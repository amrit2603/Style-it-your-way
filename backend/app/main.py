import io
import json
import secrets
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal

from fastapi import FastAPI, Form, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.responses import Response as RawResponse
from PIL import Image
from starlette.concurrency import run_in_threadpool
from starlette.middleware.trustedhost import TrustedHostMiddleware

from . import assets, catalog
from .body_limit import BodyLimitMiddleware
from .config import Settings, now
from .db import Database
from .generation import GenerationService, job_response
from .pdf import PdfError, inspect_pdf, render_pdf_page
from .photo_checks import check_person, validator_ready
from .schemas import (
    CatalogGenerate,
    CropInput,
    MerchantLogin,
    ProductEdit,
    ProductInput,
    ReferenceInput,
    ReviewInput,
    TryOnGenerate,
    VersionInput,
)
from .security import COOKIE, current_session, fail, merchant, new_session


def create_app(settings=None):
    settings = settings or Settings()
    if settings.generation_mode not in {"live", "fixture"}:
        raise ValueError("VYUMI_GENERATION_MODE must be live or fixture")
    database = Database(settings.data_dir)
    generation = GenerationService(database, settings)

    @asynccontextmanager
    async def lifespan(app):
        generation.cleanup()
        if settings.start_worker:
            generation.start()
        yield
        generation.close()

    app = FastAPI(title="VYUMI Style It Your Way", lifespan=lifespan)
    app.state.db, app.state.settings, app.state.generation = (
        database,
        settings,
        generation,
    )
    app.add_middleware(
        TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "[::1]"]
    )

    @app.middleware("http")
    async def local_boundaries(request, call_next):
        origin = request.headers.get("origin")
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            if origin and origin not in settings.allowed_origins:
                return JSONResponse(
                    {
                        "detail": {
                            "code": "origin_denied",
                            "message": "Requests must come from the local VYUMI application.",
                        }
                    },
                    status_code=403,
                )
            if request.headers.get("sec-fetch-site") == "cross-site":
                return JSONResponse(
                    {
                        "detail": {
                            "code": "origin_denied",
                            "message": "Open the local VYUMI application before continuing.",
                        }
                    },
                    status_code=403,
                )
            try:
                if int(request.headers.get("content-length", "0")) > 32 * 1024 * 1024:
                    return JSONResponse(
                        {
                            "detail": {
                                "code": "upload_too_large",
                                "message": "Choose a file smaller than 30 MiB.",
                            }
                        },
                        status_code=413,
                    )
            except ValueError:
                return JSONResponse(
                    {
                        "detail": {
                            "code": "request_invalid",
                            "message": "Invalid request size.",
                        }
                    },
                    status_code=400,
                )
            if request.url.path not in {"/sessions", "/merchant/session"}:
                session = current_session(request, optional=True)
                if not session:
                    return JSONResponse(
                        {
                            "detail": {
                                "code": "session_expired",
                                "message": "Your session expired. Refresh the page to start again.",
                            }
                        },
                        status_code=401,
                    )
                if not secrets.compare_digest(
                    request.headers.get("x-csrf-token", "").encode(),
                    session["csrf"].encode(),
                ):
                    return JSONResponse(
                        {
                            "detail": {
                                "code": "csrf_invalid",
                                "message": "Refresh the page before continuing this action.",
                            }
                        },
                        status_code=403,
                    )
        if (
            request.url.path.startswith("/merchant/")
            and request.url.path != "/merchant/session"
        ):
            session = current_session(request, optional=True)
            if not session or session["role"] != "merchant":
                return JSONResponse(
                    {
                        "detail": {
                            "code": "merchant_required",
                            "message": "Open the merchant studio and enter your local access token.",
                        }
                    },
                    status_code=403,
                )
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        first = exc.errors()[0]
        field = str(first["loc"][-1]).replace("_", " ")
        return JSONResponse(
            {
                "detail": {
                    "code": "input_invalid",
                    "message": f"Check {field}: {first['msg']}",
                }
            },
            status_code=422,
        )

    @app.exception_handler(PdfError)
    async def pdf_error(request, exc):
        return JSONResponse(
            {"detail": {"code": exc.code, "message": exc.message}}, status_code=422
        )

    @app.get("/health")
    def health():
        return {
            "status": "ok",
            "provider_ready": settings.fixture
            or bool(settings.provider_configured and generation.remaining() > 0),
            "validator_ready": validator_ready(),
            "generation_mode": settings.generation_mode,
            "provider": "Gemini" if settings.gemini_api_key else "FASHN",
            "remaining_allowance": generation.remaining(),
        }

    @app.post("/sessions")
    def session_start(request: Request, response: Response):
        session = current_session(request, optional=True)
        return (
            {"role": session["role"], "csrf_token": session["csrf"]}
            if session
            else new_session(request, response, "shopper")
        )

    @app.get("/sessions/current")
    def session_read(request: Request):
        session = current_session(request)
        return {"role": session["role"], "csrf_token": session["csrf"]}

    @app.post("/merchant/session")
    def merchant_session(payload: MerchantLogin, request: Request, response: Response):
        if not settings.merchant_token or not secrets.compare_digest(
            payload.token.encode(), settings.merchant_token.encode()
        ):
            fail(
                "merchant_token_invalid",
                "Enter the local merchant access token configured in backend settings.",
                403,
            )
        old = current_session(request, optional=True)
        if old:
            generation.invalidate_session(old["id"])
        return new_session(request, response, "merchant")

    @app.post("/sessions/logout")
    def logout(request: Request, response: Response):
        session = current_session(request)
        generation.invalidate_session(session["id"])
        response.delete_cookie(COOKIE)
        return {"ok": True}

    def merchant_product_view(db, product):
        result = catalog.response_product(product)
        latest = db.execute(
            "SELECT * FROM jobs WHERE product_id=? AND operation='catalog' AND version=? ORDER BY rowid DESC LIMIT 1",
            (product["id"], product["version"]),
        ).fetchone()
        current_ids = {
            row[0]
            for row in db.execute(
                "SELECT id FROM assets WHERE product_id=? AND kind='generated' AND deleted=0 AND json_extract(source,'$.version')=?",
                (product["id"], product["version"]),
            )
        }
        review_needed = any(
            image["id"] in current_ids and not image["approved"]
            for image in product["images"]
        )
        public_row = db.execute(
            "SELECT published FROM products WHERE id=?", (product["id"],)
        ).fetchone()
        public_snapshot = json.loads(public_row[0]) if public_row[0] else None
        if latest and latest["status"] in {"queued", "submitting", "processing"}:
            result["status"] = "Generating"
        elif review_needed:
            result["status"] = "Needs review"
        elif (
            public_snapshot
            and public_snapshot["version"] == product["version"]
            and {image["id"] for image in public_snapshot["images"]}
            == {image["id"] for image in product["images"] if image["public"]}
        ):
            result["status"] = "Published"
        else:
            result["status"] = "Draft"
        result["latest_job"] = job_response(latest) if latest else None
        return result

    @app.get("/merchant/products")
    def merchant_products(request: Request):
        merchant(request)
        with database.connect() as db:
            return [
                merchant_product_view(db, catalog.load_product(db, row["id"]))
                for row in db.execute("SELECT id FROM products ORDER BY updated DESC")
            ]

    @app.post("/merchant/products")
    def product_create(payload: ProductInput, request: Request):
        merchant(request)
        return catalog.create_product(database, payload)

    @app.get("/merchant/products/{product_id}")
    def product_read(product_id: str, request: Request):
        merchant(request)
        with database.connect() as db:
            return merchant_product_view(db, catalog.load_product(db, product_id))

    @app.put("/merchant/products/{product_id}")
    def product_edit(product_id: str, payload: ProductEdit, request: Request):
        merchant(request)
        return catalog.update_product(database, product_id, payload)

    @app.post("/merchant/products/{product_id}/images")
    async def product_upload(
        product_id: str,
        request: Request,
        file: UploadFile,
        role: Annotated[Literal["main", "reverse", "detail"], Form()] = "main",
    ):
        session = merchant(request)
        with database.connect() as db:
            catalog.load_product(db, product_id)
        image = assets.decode_image(await assets.read_upload(file, assets.MAX_PHOTO))
        asset_id = assets.save_image(
            database, image, session["id"], "original", product_id
        )
        try:
            return catalog.attach_original(database, product_id, asset_id, role)
        except Exception:
            assets.mark_deleted(database, [asset_id])
            raise

    @app.post("/merchant/products/{product_id}/reference")
    def product_reference(product_id: str, payload: ReferenceInput, request: Request):
        merchant(request)
        return catalog.set_reference(database, product_id, payload)

    @app.post("/merchant/products/{product_id}/images/{asset_id}/review")
    def image_review(
        product_id: str, asset_id: str, payload: ReviewInput, request: Request
    ):
        merchant(request)
        return catalog.review_image(database, product_id, asset_id, payload)

    @app.post("/merchant/products/{product_id}/publish")
    def product_publish(product_id: str, payload: VersionInput, request: Request):
        merchant(request)
        return catalog.publish(database, product_id, payload.version)

    @app.post("/merchant/products/{product_id}/unpublish")
    def product_unpublish(product_id: str, request: Request):
        merchant(request)
        with database.connect(write=True) as db:
            catalog.load_product(db, product_id)
            db.execute("UPDATE products SET published=NULL WHERE id=?", (product_id,))
            return catalog.response_product(catalog.load_product(db, product_id))

    @app.get("/products")
    def public_products(category: Literal["saree", "suit"] | None = None):
        with database.connect() as db:
            products = [
                catalog.load_product(db, row["id"], public=True)
                for row in db.execute(
                    "SELECT id FROM products WHERE published IS NOT NULL ORDER BY updated DESC"
                )
            ]
        return [
            catalog.response_product(product, public=True)
            for product in products
            if not category or product["category"] == category
        ]

    @app.get("/products/{product_id}")
    def public_product(product_id: str):
        with database.connect() as db:
            return catalog.response_product(
                catalog.load_product(db, product_id, public=True), public=True
            )

    @app.post("/merchant/pdfs")
    async def pdf_upload(request: Request, file: UploadFile):
        session = merchant(request)
        name = Path((file.filename or "Catalog.pdf").replace("\\", "/")).name[:160]
        content = await assets.read_upload(file, 30 * 1024 * 1024)
        asset_id = str(uuid.uuid4())
        folder = database.root / "files"
        folder.mkdir(exist_ok=True)
        filename = asset_id + ".pdf"
        target = folder / filename
        target.write_bytes(content)
        try:
            info = await run_in_threadpool(inspect_pdf, target)
            with database.connect(write=True) as db:
                db.execute(
                    "INSERT INTO assets(id,owner,kind,filename,mime,created) VALUES (?,?,?,?,?,?)",
                    (
                        asset_id,
                        session["id"],
                        "pdf",
                        filename,
                        "application/pdf",
                        now(),
                    ),
                )
                db.execute(
                    "INSERT INTO pdfs VALUES (?,?,?)",
                    (asset_id, name, info["page_count"]),
                )
        except Exception:
            target.unlink(missing_ok=True)
            raise
        return {"id": asset_id, "name": name, "page_count": info["page_count"]}

    def get_pdf(request, pdf_id):
        merchant(request)
        with database.connect() as db:
            asset = assets.get_asset(db, pdf_id)
        if asset["kind"] != "pdf":
            fail("pdf_not_found", "This PDF is unavailable.", 404)
        return assets.asset_path(database, asset)

    @app.get("/merchant/pdfs/{pdf_id}/pages/{page}")
    def pdf_page(pdf_id: str, page: int, request: Request, thumbnail: bool = False):
        return RawResponse(
            render_pdf_page(get_pdf(request, pdf_id), page, 220 if thumbnail else 4096),
            media_type="image/jpeg",
        )

    @app.post("/merchant/pdfs/{pdf_id}/crops")
    def pdf_crop(pdf_id: str, payload: CropInput, request: Request):
        session = merchant(request)
        if (
            payload.x + payload.width > 1.000001
            or payload.y + payload.height > 1.000001
        ):
            fail("crop_bounds", "Keep the selected garment region inside the PDF page.")
        with database.connect() as db:
            catalog.load_product(db, payload.product_id)
        image = Image.open(
            io.BytesIO(render_pdf_page(get_pdf(request, pdf_id), payload.page))
        ).convert("RGB")
        box = (
            round(payload.x * image.width),
            round(payload.y * image.height),
            round((payload.x + payload.width) * image.width),
            round((payload.y + payload.height) * image.height),
        )
        image = image.crop(box)
        if min(image.size) < 512:
            fail(
                "crop_too_small",
                "Select a larger garment region or upload a separate high-resolution photo.",
            )
        asset_id = assets.save_image(
            database,
            image,
            session["id"],
            "original",
            payload.product_id,
            source={
                "pdf_id": pdf_id,
                "page": payload.page,
                "crop": payload.model_dump(exclude={"product_id", "page", "role"}),
            },
        )
        try:
            return catalog.attach_original(
                database, payload.product_id, asset_id, payload.role
            )
        except Exception:
            assets.mark_deleted(database, [asset_id])
            raise

    @app.post("/style-it/photos")
    async def personal_photo(
        request: Request,
        file: UploadFile,
        consent: Annotated[str, Form()] = "false",
        height_cm: Annotated[float | None, Form()] = None,
        usual_size: Annotated[str, Form(max_length=80)] = "",
    ):
        session = current_session(request)
        if consent != "true":
            fail(
                "consent_required",
                "Confirm you are an adult and have permission to process this photo.",
            )
        if height_cm is not None and not 80 <= height_cm <= 250:
            fail(
                "height_invalid",
                "Enter a height between 80 and 250 cm, or leave it blank.",
            )
        image = assets.decode_image(await assets.read_upload(file, assets.MAX_PHOTO))
        if settings.fixture:
            checks = {
                "accepted": True,
                "code": "fixture_only",
                "message": "Demo upload only. Person validation and real personalized generation are not being demonstrated.",
            }
        else:
            checks = await run_in_threadpool(check_person, image)
        if not checks["accepted"]:
            fail(checks["code"], checks["message"])
        expires = now() + 3600
        asset_id = assets.save_image(
            database,
            image,
            session["id"],
            "personal",
            expires=expires,
            source={"accepted": True, "consent": True, "fixture": settings.fixture},
        )
        return {
            "id": asset_id,
            "url": f"/api/assets/{asset_id}",
            "expires_at": expires,
            "checks": checks,
        }

    @app.post("/merchant/products/{product_id}/generate")
    def catalog_generate(product_id: str, payload: CatalogGenerate, request: Request):
        return generation.submit(merchant(request), "catalog", payload, product_id)

    @app.post("/style-it/generate")
    def tryon_generate(payload: TryOnGenerate, request: Request):
        return generation.submit(current_session(request), "tryon", payload)

    @app.get("/style-it/jobs/{job_id}")
    def job_read(job_id: str, request: Request):
        session = current_session(request)
        generation.cleanup()
        with database.connect() as db:
            job = db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
            if (
                job
                and job["owner"] != session["id"]
                and not (
                    session["role"] == "merchant" and job["operation"] == "catalog"
                )
            ):
                job = None
        if not job:
            fail("job_not_found", "This request is unavailable in your session.", 404)
        return job_response(job)

    @app.get("/public/assets/{asset_id}")
    def public_asset(asset_id: str):
        with database.connect() as db:
            published = db.execute(
                "SELECT published FROM products WHERE published IS NOT NULL"
            ).fetchall()
            if not any(
                any(
                    image["id"] == asset_id and image["public"]
                    for image in json.loads(row[0])["images"]
                )
                for row in published
            ):
                fail("asset_not_found", "This catalog image is unavailable.", 404)
            asset = assets.get_asset(db, asset_id)
            if asset["kind"] not in {"original", "generated"}:
                fail("asset_not_found", "This catalog image is unavailable.", 404)
        return FileResponse(
            assets.asset_path(database, asset), media_type=asset["mime"]
        )

    @app.get("/assets/{asset_id}")
    def private_asset(asset_id: str, request: Request, download: bool = False):
        session = current_session(request)
        with database.connect() as db:
            asset = assets.get_asset(db, asset_id)
        permitted = asset["owner"] == session["id"] or (
            session["role"] == "merchant"
            and asset["kind"] in {"original", "generated", "pdf"}
        )
        if not permitted:
            fail("asset_not_found", "This image is unavailable in your session.", 404)
        return FileResponse(
            assets.asset_path(database, asset),
            media_type=asset["mime"],
            filename="vyumi-look.jpg"
            if download and asset["kind"] == "personal_result"
            else None,
        )

    @app.delete("/assets/{asset_id}")
    def delete_asset(asset_id: str, request: Request):
        session = current_session(request)
        with database.connect(write=True) as db:
            asset = assets.get_asset(db, asset_id)
            if asset["kind"] in {"personal", "personal_result"}:
                if asset["owner"] != session["id"]:
                    fail(
                        "asset_not_found",
                        "This image is unavailable in your session.",
                        404,
                    )
            else:
                merchant(request)
                if db.execute(
                    "SELECT 1 FROM jobs WHERE reference_id=? AND status IN ('queued','submitting','processing')",
                    (asset_id,),
                ).fetchone():
                    fail(
                        "asset_in_use",
                        "Wait for generation to finish before deleting its garment reference.",
                        409,
                    )
                for row in db.execute(
                    "SELECT published FROM products WHERE published IS NOT NULL"
                ):
                    product = json.loads(row[0])
                    if product["reference_id"] == asset_id or any(
                        image["id"] == asset_id for image in product["images"]
                    ):
                        fail(
                            "asset_published",
                            "Unpublish this product or publish a replacement gallery before deleting the image.",
                            409,
                        )
                if asset["product_id"]:
                    product = catalog.load_product(db, asset["product_id"])
                    catalog.revise(product)
                    product["images"] = [
                        image for image in product["images"] if image["id"] != asset_id
                    ]
                    if product["reference_id"] == asset_id:
                        product["reference_id"] = None
                    catalog.save_draft(db, product)
        if asset["kind"] in {"personal", "personal_result"}:
            generation.delete_photo(asset_id)
        else:
            assets.mark_deleted(database, [asset_id])
        return {"ok": True}

    app.add_middleware(BodyLimitMiddleware)
    return app


app = create_app()
