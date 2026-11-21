import io
import json
import uuid
import warnings

from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

from .config import now
from .security import fail

MAX_PHOTO = 10 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 25_000_000
register_heif_opener()


def decode_image(content: bytes, *, minimum=True, preserve_alpha=False):
    if len(content) > MAX_PHOTO:
        fail("photo_too_large", "Choose a photo smaller than 10 MiB.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(content)) as source:
                if source.format not in {"JPEG", "PNG", "WEBP", "HEIF", "AVIF"}:
                    fail(
                        "image_format", "Upload a JPEG, PNG, WebP, HEIC or AVIF photo."
                    )
                if getattr(source, "n_frames", 1) != 1:
                    fail(
                        "image_animated",
                        "Upload a still photo rather than an animation.",
                    )
                if source.width * source.height > 25_000_000:
                    fail("photo_pixels", "Choose a photo smaller than 25 megapixels.")
                image = ImageOps.exif_transpose(source).convert(
                    "RGBA" if preserve_alpha and "A" in source.getbands() else "RGB"
                )
                image.load()
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ):
        fail(
            "image_unreadable",
            "We could not read this image. Upload a valid, smaller JPEG, PNG or WebP.",
        )
    if minimum and min(image.size) < 512:
        fail("photo_too_small", "Use an image at least 512 pixels on its shorter side.")
    return image


def save_image(
    database, image, owner, kind, product_id=None, expires=None, source=None
):
    asset_id = str(uuid.uuid4())
    transparent = image.mode == "RGBA"
    filename = asset_id + (".png" if transparent else ".jpg")
    folder = database.root / "files"
    folder.mkdir(exist_ok=True)
    target = folder / filename
    try:
        image.save(
            target,
            "PNG" if transparent else "JPEG",
            **({} if transparent else {"quality": 92}),
        )
        with database.connect(write=True) as db:
            db.execute(
                "INSERT INTO assets(id,owner,kind,product_id,filename,mime,width,height,expires,source,created) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (
                    asset_id,
                    owner,
                    kind,
                    product_id,
                    filename,
                    "image/png" if transparent else "image/jpeg",
                    image.width,
                    image.height,
                    expires,
                    json.dumps(source) if source else None,
                    now(),
                ),
            )
    except Exception:
        target.unlink(missing_ok=True)
        raise
    return asset_id


def get_asset(db, asset_id):
    row = db.execute(
        "SELECT * FROM assets WHERE id=? AND deleted=0", (asset_id,)
    ).fetchone()
    if not row or (row["expires"] is not None and row["expires"] <= now()):
        fail(
            "asset_not_found",
            "This image is unavailable or has expired. Please upload it again.",
            404,
        )
    return dict(row)


def asset_path(database, asset):
    path = (database.root / "files" / asset["filename"]).resolve()
    if path.parent != (database.root / "files").resolve():
        fail("asset_not_found", "This image is unavailable.", 404)
    if not path.is_file():
        fail(
            "asset_not_found", "This image is unavailable. Please upload it again.", 404
        )
    return path


def mark_deleted(database, ids):
    with database.connect(write=True) as db:
        for asset_id in ids:
            db.execute("UPDATE assets SET deleted=1 WHERE id=?", (asset_id,))
    purge_deleted(database)


def purge_deleted(database):
    with database.connect() as db:
        rows = db.execute("SELECT filename FROM assets WHERE deleted=1").fetchall()
    for row in rows:
        path = (database.root / "files" / row["filename"]).resolve()
        if path.parent == (database.root / "files").resolve():
            try:
                path.unlink(missing_ok=True)
            except OSError:
                # Access is already revoked; periodic cleanup retries a locked file.
                continue


async def read_upload(file, limit):
    chunks = []
    size = 0
    try:
        while chunk := await file.read(64 * 1024):
            size += len(chunk)
            if size > limit:
                fail(
                    "upload_too_large",
                    f"Choose a file smaller than {limit // 1024 // 1024} MiB.",
                    413,
                )
            chunks.append(chunk)
        return b"".join(chunks)
    finally:
        await file.close()
