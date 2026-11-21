import hashlib
import io
import json
import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Form, Request, UploadFile
from pydantic import BaseModel, Field, field_validator
from starlette.concurrency import run_in_threadpool

from . import assets, catalog
from .accounts import require_user
from .config import now
from .photo_checks import check_upload
from .schemas import CatalogGenerate, TryOnGenerate
from .security import current_session, fail, merchant


class OrderLine(BaseModel):
    product_id: str
    quantity: int = Field(ge=1, le=20)
    size: str = Field(default="", max_length=80)
    color: str = Field(default="", max_length=80)


class OrderInput(BaseModel):
    items: list[OrderLine] = Field(min_length=1, max_length=30)
    name: str = Field(min_length=1, max_length=120)
    address: str = Field(min_length=10, max_length=1000)
    phone: str = Field(min_length=7, max_length=30)
    idempotency_key: str = Field(min_length=8, max_length=100)

    @field_validator("name", "address", "phone")
    @classmethod
    def not_blank(cls, value):
        if not value.strip():
            raise ValueError("This field is required")
        return value.strip()


class OrderStatus(BaseModel):
    status: Literal["pending", "confirmed", "shipped", "delivered"]


class LibraryGeneration(BaseModel):
    product_id: str
    stock_model_id: str | None = None
    room_template_id: str | None = None
    view: Literal["front", "back", "left", "right"] = "front"
    idempotency_key: str = Field(min_length=8, max_length=100)


def order_response(db, row):
    result = dict(row)
    for field in ("fingerprint", "request_key"):
        result.pop(field, None)
    result["items"] = [
        dict(item)
        for item in db.execute(
            "SELECT product_id,name,sku,quantity,price,size,color FROM order_items WHERE order_id=?",
            (row["id"],),
        )
    ]
    return result


def install(app, upload_person):
    router = APIRouter()
    database, generation = app.state.db, app.state.generation

    @router.get("/shop")
    def shop(
        q: str = "",
        category: str = "",
        color: str = "",
        size: str = "",
        min_price: int = 0,
        max_price: int | None = None,
        sort: Literal["newest", "price_asc", "price_desc", "popular"] = "newest",
        page: int = 1,
        limit: int = 12,
        audience: Literal["women", "men", "unisex"] | None = None,
    ):
        if (
            page < 1
            or not 1 <= limit <= 60
            or min_price < 0
            or (max_price is not None and max_price < min_price)
        ):
            fail("filter_invalid", "Check the price range, page and page size.")
        with database.connect() as db:
            rows = db.execute(
                "SELECT id,updated FROM products WHERE published IS NOT NULL ORDER BY updated DESC"
            ).fetchall()
            items = []
            for row in rows:
                item = catalog.response_product(
                    catalog.load_product(db, row["id"], public=True), public=True
                )
                price = item.get("price_minor")
                if (
                    audience
                    and item["audience"] != audience
                    and not (audience != "unisex" and item["audience"] == "unisex")
                ):
                    continue
                if category and item["category"] != category:
                    continue
                if (
                    q.lower()
                    not in (
                        item["name"] + " " + item["description"] + " " + item["sku"]
                    ).lower()
                ):
                    continue
                if (min_price or max_price is not None) and (
                    price is None
                    or price < min_price
                    or (max_price is not None and price > max_price)
                ):
                    continue
                if color and color.lower() not in [
                    value.lower() for value in item.get("colors", [])
                ]:
                    continue
                if size and size.lower() not in [
                    value.strip().lower() for value in item.get("sizes", "").split(",")
                ]:
                    continue
                item["created_at"] = item.get("created_at", row["updated"])
                items.append(item)
            if sort == "popular":
                counts = {
                    row[0]: row[1]
                    for row in db.execute(
                        "SELECT product_id,SUM(quantity) FROM order_items GROUP BY product_id"
                    )
                }
                items.sort(key=lambda item: counts.get(item["id"], 0), reverse=True)
            elif sort.startswith("price_"):
                priced = [item for item in items if item.get("price_minor") is not None]
                priced.sort(
                    key=lambda item: item["price_minor"], reverse=sort == "price_desc"
                )
                items = priced + [
                    item for item in items if item.get("price_minor") is None
                ]
            else:
                items.sort(key=lambda item: item["created_at"], reverse=True)
        start = (page - 1) * limit
        return {
            "items": items[start : start + limit],
            "total": len(items),
            "page": page,
            "limit": limit,
        }

    @router.post("/orders", status_code=201)
    def place_order(payload: OrderInput, request: Request):
        user = require_user(request)
        fingerprint = hashlib.sha256(
            payload.model_dump_json(exclude={"idempotency_key"}).encode()
        ).hexdigest()
        with database.connect(write=True) as db:
            old = db.execute(
                "SELECT * FROM orders WHERE user_id=? AND request_key=?",
                (user["id"], payload.idempotency_key),
            ).fetchone()
            if old:
                if old["fingerprint"] != fingerprint:
                    fail(
                        "request_changed",
                        "This checkout request changed. Start a new checkout.",
                        409,
                    )
                return order_response(db, old)
            lines, currency = [], None
            for item in payload.items:
                product = catalog.load_product(db, item.product_id, public=True)
                if product.get("fixture"):
                    fail(
                        "sample_not_for_sale",
                        "Demonstration products cannot be ordered. Choose a store product.",
                    )
                if product.get("price_minor") is None:
                    fail(
                        "price_required",
                        "This product needs a published price before checkout.",
                    )
                if currency and currency != product["currency"]:
                    fail(
                        "currency_mixed",
                        "Place separate orders for products with different currencies.",
                    )
                currency = product["currency"]
                if item.color and item.color not in product.get("colors", []):
                    fail(
                        "option_changed",
                        "This color is no longer available. Check the product.",
                        409,
                    )
                offered_sizes = [
                    value.strip()
                    for value in product.get("sizes", "").split(",")
                    if value.strip()
                ]
                if item.size and item.size not in offered_sizes:
                    fail(
                        "option_changed",
                        "This size is no longer available. Check the product.",
                        409,
                    )
                lines.append(
                    {
                        **item.model_dump(),
                        "name": product["name"],
                        "sku": product["sku"],
                        "price": product["price_minor"],
                    }
                )
            order_id = str(uuid.uuid4())
            total = sum(item["price"] * item["quantity"] for item in lines)
            db.execute(
                "INSERT INTO orders(id,user_id,request_key,fingerprint,total,currency,name,address,phone,created) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (
                    order_id,
                    user["id"],
                    payload.idempotency_key,
                    fingerprint,
                    total,
                    currency,
                    payload.name,
                    payload.address,
                    payload.phone,
                    now(),
                ),
            )
            for item in lines:
                db.execute(
                    "INSERT INTO order_items VALUES (?,?,?,?,?,?,?,?,?)",
                    (
                        str(uuid.uuid4()),
                        order_id,
                        item["product_id"],
                        item["name"],
                        item["sku"],
                        item["quantity"],
                        item["price"],
                        item["size"],
                        item["color"],
                    ),
                )
            return order_response(
                db,
                db.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone(),
            )

    @router.get("/orders")
    def orders(request: Request):
        user = require_user(request)
        with database.connect() as db:
            return [
                order_response(db, row)
                for row in db.execute(
                    "SELECT * FROM orders WHERE user_id=? ORDER BY created DESC",
                    (user["id"],),
                )
            ]

    @router.get("/orders/{order_id}")
    def order_detail(order_id: str, request: Request):
        user = require_user(request)
        with database.connect() as db:
            row = db.execute(
                "SELECT * FROM orders WHERE id=? AND user_id=?", (order_id, user["id"])
            ).fetchone()
            if not row:
                fail("order_not_found", "This order is unavailable.", 404)
            return order_response(db, row)

    @router.get("/admin/orders")
    def admin_orders(request: Request):
        merchant(request)
        with database.connect() as db:
            return [
                order_response(db, row)
                for row in db.execute("SELECT * FROM orders ORDER BY created DESC")
            ]

    @router.put("/admin/orders/{order_id}")
    def update_order(order_id: str, payload: OrderStatus, request: Request):
        merchant(request)
        sequence = ["pending", "confirmed", "shipped", "delivered"]
        with database.connect(write=True) as db:
            row = db.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
            if not row:
                fail("order_not_found", "This order is unavailable.", 404)
            if sequence.index(payload.status) not in {
                sequence.index(row["status"]),
                sequence.index(row["status"]) + 1,
            }:
                fail(
                    "order_status_invalid",
                    "Move the order forward one step at a time.",
                    409,
                )
            db.execute(
                "UPDATE orders SET status=? WHERE id=?", (payload.status, order_id)
            )
            return order_response(
                db,
                db.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone(),
            )

    @router.get("/admin/dashboard")
    def dashboard(request: Request):
        merchant(request)
        with database.connect() as db:
            total = sum(
                not json.loads(row[0]).get("archived")
                for row in db.execute("SELECT draft FROM products")
            )
            return {
                "total_products": total,
                "total_orders": db.execute("SELECT COUNT(*) FROM orders").fetchone()[0],
                "pending_orders": db.execute(
                    "SELECT COUNT(*) FROM orders WHERE status='pending'"
                ).fetchone()[0],
                "recent_orders": [
                    order_response(db, row)
                    for row in db.execute(
                        "SELECT * FROM orders ORDER BY created DESC LIMIT 5"
                    )
                ],
            }

    @router.delete("/admin/products/{product_id}")
    def archive_product(product_id: str, request: Request):
        merchant(request)
        with database.connect(write=True) as db:
            product = catalog.load_product(db, product_id)
            catalog.revise(product)
            product["archived"] = True
            catalog.save_draft(db, product)
            db.execute("UPDATE products SET published=NULL WHERE id=?", (product_id,))
        return {"ok": True}

    def library_list(kind, request):
        merchant(request)
        with database.connect() as db:
            return [
                {**dict(row), "url": f"/api/assets/{row['asset_id']}"}
                for row in db.execute(
                    "SELECT l.* FROM library_images l JOIN assets a ON a.id=l.asset_id WHERE l.kind=? AND a.deleted=0 ORDER BY l.created DESC",
                    (kind,),
                )
            ]

    async def library_upload(
        kind, request, file, label, gender, body_type, room_type, permission
    ):
        session = merchant(request)
        if permission != "true":
            fail(
                "permission_required",
                "Confirm permission to reuse this photo in catalog generation.",
            )
        if not label.strip():
            fail("label_required", "Give this library photo a label.")
        image = assets.decode_image(await assets.read_upload(file, assets.MAX_PHOTO))
        if kind == "stock_model" and not app.state.settings.fixture:
            checks = await run_in_threadpool(check_upload, image)
            if not checks["accepted"]:
                fail(checks["code"], checks["message"])
        asset_id = assets.save_image(
            database, image, session["id"], kind, source={"reuse_permission": True}
        )
        library_id = str(uuid.uuid4())
        with database.connect(write=True) as db:
            db.execute(
                "INSERT INTO library_images VALUES (?,?,?,?,?,?,?,?)",
                (
                    library_id,
                    asset_id,
                    kind,
                    label.strip(),
                    gender,
                    body_type,
                    room_type,
                    now(),
                ),
            )
        return next(
            item for item in library_list(kind, request) if item["id"] == library_id
        )

    @router.get("/admin/stock-models")
    def models(request: Request):
        return library_list("stock_model", request)

    @router.post("/admin/stock-models", status_code=201)
    async def add_model(
        request: Request,
        file: UploadFile,
        label: Annotated[str, Form(max_length=120)],
        permission: Annotated[str, Form()] = "false",
        gender: Annotated[Literal["women", "men", "unisex"], Form()] = "unisex",
        body_type: Annotated[str, Form(max_length=120)] = "",
    ):
        return await library_upload(
            "stock_model", request, file, label, gender, body_type, "", permission
        )

    @router.get("/admin/room-templates")
    def rooms(request: Request):
        return library_list("room_template", request)

    @router.post("/admin/room-templates", status_code=201)
    async def add_room(
        request: Request,
        file: UploadFile,
        label: Annotated[str, Form(max_length=120)],
        permission: Annotated[str, Form()] = "false",
        room_type: Annotated[str, Form(max_length=120)] = "",
    ):
        return await library_upload(
            "room_template", request, file, label, "unisex", "", room_type, permission
        )

    def library_generate(payload, request, kind):
        session = merchant(request)
        chosen = (
            payload.stock_model_id
            if kind == "stock_model"
            else payload.room_template_id
        )
        if not chosen:
            fail("template_required", "Select a library photo first.")
        with database.connect() as db:
            product = catalog.load_product(db, payload.product_id)
        return generation.submit(
            session,
            "catalog",
            CatalogGenerate(
                version=product["version"],
                stock_model_id=chosen if kind == "stock_model" else None,
                room_template_id=chosen if kind == "room_template" else None,
                view=payload.view,
                idempotency_key=payload.idempotency_key,
            ),
            payload.product_id,
        )

    @router.post("/admin/ai-generate/model-tryon")
    def generate_model(payload: LibraryGeneration, request: Request):
        return library_generate(payload, request, "stock_model")

    @router.post("/admin/ai-generate/room-placement")
    def generate_room(payload: LibraryGeneration, request: Request):
        return library_generate(payload, request, "room_template")

    @router.post("/tryon")
    async def tryon(
        request: Request,
        person_image: UploadFile,
        product_id: Annotated[str, Form()],
        consent: Annotated[str, Form()] = "false",
        idempotency_key: Annotated[str, Form(min_length=8, max_length=100)] = "",
    ):
        if not idempotency_key:
            fail("request_key_required", "Send a generation request key.")
        with database.connect() as db:
            product = catalog.load_product(db, product_id, public=True)
        if product["category"] in {"furniture", "decor", "curtains"}:
            fail("category_invalid", "Use room visualization for this product.")
        photo_id = await upload_once(
            request,
            person_image,
            product_id,
            consent,
            idempotency_key,
            "wrist" if product["category"] == "watch" else "person",
        )
        return generation.submit(
            current_session(request),
            "tryon",
            TryOnGenerate(
                product_id=product_id,
                user_image_id=photo_id,
                idempotency_key=idempotency_key,
            ),
        )

    @router.post("/room-visualize")
    async def visualize(
        request: Request,
        room_image: UploadFile,
        product_id: Annotated[str, Form()],
        consent: Annotated[str, Form()] = "false",
        idempotency_key: Annotated[str, Form(min_length=8, max_length=100)] = "",
    ):
        if not idempotency_key:
            fail("request_key_required", "Send a generation request key.")
        with database.connect() as db:
            product = catalog.load_product(db, product_id, public=True)
        if product["category"] not in {"furniture", "decor", "curtains"}:
            fail(
                "category_invalid",
                "Choose furniture, decor or curtains for a room preview.",
            )
        photo_id = await upload_once(
            request, room_image, product_id, consent, idempotency_key, "room"
        )
        return generation.submit(
            current_session(request),
            "tryon",
            TryOnGenerate(
                product_id=product_id,
                user_image_id=photo_id,
                idempotency_key=idempotency_key,
            ),
        )

    async def upload_once(request, file, product_id, consent, key, purpose):
        session = current_session(request)
        content = await assets.read_upload(file, assets.MAX_PHOTO)
        digest = hashlib.sha256(
            content + json.dumps([product_id, purpose, consent]).encode()
        ).hexdigest()
        with database.connect() as db:
            old = db.execute(
                "SELECT * FROM multipart_requests WHERE owner=? AND request_key=?",
                (session["id"], key),
            ).fetchone()
        if old:
            if old["fingerprint"] != digest:
                fail(
                    "request_changed",
                    "Use a new request key after changing the photo or product.",
                    409,
                )
            return old["photo_id"]
        file = UploadFile(
            file=io.BytesIO(content), filename=file.filename, headers=file.headers
        )
        uploaded = await upload_person(
            request=request, file=file, consent=consent, purpose=purpose
        )
        with database.connect(write=True) as db:
            db.execute(
                "INSERT OR IGNORE INTO multipart_requests VALUES (?,?,?,?,?)",
                (session["id"], key, digest, uploaded["id"], now()),
            )
            saved = db.execute(
                "SELECT * FROM multipart_requests WHERE owner=? AND request_key=?",
                (session["id"], key),
            ).fetchone()
        if saved["photo_id"] != uploaded["id"]:
            assets.mark_deleted(database, [uploaded["id"]])
        if saved["fingerprint"] != digest:
            fail(
                "request_changed",
                "Use a new request key after changing the photo or product.",
                409,
            )
        return saved["photo_id"]

    app.include_router(router)
    app.state.shop = shop


class ApiPrefixMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["path"].startswith("/api/"):
            scope = {
                **scope,
                "path": scope["path"][4:],
                "raw_path": scope.get("raw_path", b"")[4:],
            }
        await self.app(scope, receive, send)
