"""Authenticated notebook API. Importing this module does not download/load a model."""

import base64
import hashlib
import hmac
import io
import re
import threading
import time
from collections import OrderedDict
from typing import Annotated

from fastapi import FastAPI, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

MAX_FILE = 10 * 1024 * 1024
MAX_BODY = 22 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 25_000_000
CATEGORIES = {
    "saree",
    "suit",
    "dress",
    "shirt",
    "top",
    "kurta",
    "jacket",
    "trousers",
    "skirt",
    "lehenga",
}


class Boundary:
    def __init__(self, app, token):
        self.app, self.token = app, token

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = dict(scope["headers"])
        if scope["path"] != "/health" and not hmac.compare_digest(
            headers.get(b"authorization", b""), ("Bearer " + self.token).encode()
        ):
            return await JSONResponse(
                {"detail": "Authentication required"}, status_code=401
            )(scope, receive, send)
        size = 0

        async def bounded_receive():
            nonlocal size
            message = await receive()
            size += len(message.get("body", b""))
            if size > MAX_BODY:
                raise HTTPException(413, "Upload smaller images")
            return message

        await self.app(scope, bounded_receive, send)


async def read_image(file):
    content = bytearray()
    try:
        while chunk := await file.read(64 * 1024):
            content.extend(chunk)
            if len(content) > MAX_FILE:
                raise HTTPException(413, "Each image must be at most 10 MiB")
    finally:
        await file.close()
    try:
        with Image.open(io.BytesIO(content)) as source:
            if (
                source.format not in {"JPEG", "PNG", "WEBP"}
                or getattr(source, "n_frames", 1) != 1
                or source.width * source.height > 25_000_000
            ):
                raise HTTPException(
                    422, "Use a still JPEG, PNG or WebP smaller than 25 megapixels"
                )
            if min(source.size) < 128:
                raise HTTPException(422, "Image is too small")
            image = ImageOps.exif_transpose(source).convert("RGB")
            image.load()
    except (OSError, ValueError, UnidentifiedImageError, Image.DecompressionBombError):
        raise HTTPException(422, "Image could not be decoded") from None
    return bytes(content), image


def create_app(predict, token, *, gpu_ready=True):
    if len(token) < 24:
        raise ValueError("Set a GPU API token of at least 24 characters")
    app = FastAPI(
        title="VYUMI GPU inference", docs_url=None, redoc_url=None, openapi_url=None
    )
    lock, cache = threading.Lock(), OrderedDict()

    @app.get("/health")
    def health():
        return {
            "status": "running",
            "gpu_ready": gpu_ready,
            "engine": "IDM-VTON" if gpu_ready else "contract-test",
        }

    def infer(key, fingerprint, person, garment, category):
        if not lock.acquire(timeout=55):
            raise HTTPException(503, "GPU is busy. Resume this same request later")
        try:
            for expired in [k for k, v in cache.items() if v["expires"] <= time.time()]:
                del cache[expired]
            if key in cache:
                saved = cache[key]
                if saved["fingerprint"] != fingerprint:
                    raise HTTPException(
                        409, "Request key was reused with different images"
                    )
                if saved["result"] is None:
                    raise HTTPException(
                        410,
                        "This completed output left the memory cache; it will not be generated again",
                    )
                return saved["result"]
            if len(cache) >= 1000:
                raise HTTPException(
                    429, "Request history is full; wait for old requests to expire"
                )
            try:
                image = predict(person, garment, category)
                output = io.BytesIO()
                image.convert("RGB").save(output, "JPEG", quality=92)
                if len(output.getvalue()) > MAX_FILE:
                    raise ValueError("Oversized generated image")
            except Exception as error:
                import logging

                logging.getLogger("vyumi-gpu").error(
                    "Inference failed: %s", type(error).__name__
                )
                raise HTTPException(
                    503, "GPU inference failed; inspect the notebook diagnostics"
                ) from None
            result = {
                "image_base64": base64.b64encode(output.getvalue()).decode(),
                "request_id": key,
            }
            cache[key] = {
                "fingerprint": fingerprint,
                "result": result,
                "expires": time.time() + 3600,
            }
            outputs = [
                key for key, value in cache.items() if value["result"] is not None
            ]
            for old_key in outputs[:-2]:
                cache[old_key]["result"] = None
            return result
        finally:
            lock.release()

    @app.post("/try-on")
    async def try_on(
        person_image: UploadFile,
        garment_image: UploadFile,
        category: Annotated[str, Form()] = "top",
        request_id: Annotated[str, Header(alias="X-Request-ID")] = "",
    ):
        if not re.fullmatch(r"[A-Za-z0-9_-]{8,100}", request_id):
            raise HTTPException(422, "Send a stable X-Request-ID")
        if category not in CATEGORIES:
            raise HTTPException(
                422, "This model handles clothing only, not watches, shoes or rooms"
            )
        raw_person, person = await read_image(person_image)
        raw_garment, garment = await read_image(garment_image)
        fingerprint = hashlib.sha256(
            raw_person + raw_garment + category.encode()
        ).hexdigest()
        return await run_in_threadpool(
            infer, request_id, fingerprint, person, garment, category
        )

    app.add_middleware(Boundary, token=token)
    return app
