import json
import sqlite3
import uuid

from .assets import get_asset
from .config import now
from .security import fail


def load_product(db, product_id, public=False):
    row = db.execute("SELECT * FROM products WHERE id=?", (product_id,)).fetchone()
    if row is None or (public and not row["published"]):
        fail("product_not_found", "This garment is not available.", 404)
    product = json.loads(row["published"] if public else row["draft"])
    product.setdefault(
        "audience", "women" if product["category"] in {"saree", "suit"} else "unisex"
    )
    product["published"] = bool(row["published"])
    return product


def response_product(product, public=False):
    result = {**product, "images": []}
    result.setdefault(
        "audience", "women" if product["category"] in {"saree", "suit"} else "unisex"
    )
    for image in product["images"]:
        if public and not image["public"]:
            continue
        result["images"].append(
            {**image, "url": f"/api/{'public/' if public else ''}assets/{image['id']}"}
        )
    if public:
        result["reference_id"] = None
    return result


def save_draft(db, product):
    try:
        db.execute(
            "UPDATE products SET sku=?,draft=?,updated=? WHERE id=?",
            (product["sku"], json.dumps(product), now(), product["id"]),
        )
    except sqlite3.IntegrityError:
        fail("sku_exists", "That SKU is already in the catalog. Use a unique SKU.", 409)


def check_version(product, version):
    if product["version"] != version:
        fail(
            "revision_changed",
            "This product changed in another action. Reload it before continuing.",
            409,
        )


def revise(product):
    product["version"] += 1
    product["images"] = [
        {
            **image,
            "approved": False,
            "public": False if image["kind"] == "generated" else image["public"],
        }
        for image in product["images"]
    ]


def create_product(database, payload):
    product = {
        "id": str(uuid.uuid4()),
        "version": 1,
        **payload.model_dump(),
        "images": [],
        "reference_id": None,
        "published": False,
    }
    try:
        with database.connect(write=True) as db:
            db.execute(
                "INSERT INTO products VALUES (?,?,?,NULL,?)",
                (product["id"], product["sku"], json.dumps(product), now()),
            )
    except sqlite3.IntegrityError:
        fail("sku_exists", "That SKU is already in the catalog. Use a unique SKU.", 409)
    return response_product(product)


def update_product(database, product_id, payload):
    with database.connect(write=True) as db:
        product = load_product(db, product_id)
        check_version(product, payload.version)
        revise(product)
        product.update(payload.model_dump(exclude={"version"}))
        save_draft(db, product)
    return response_product(product)


def attach_original(database, product_id, asset_id, role):
    with database.connect(write=True) as db:
        product = load_product(db, product_id)
        if (
            len([image for image in product["images"] if image["kind"] == "original"])
            >= 10
        ):
            fail(
                "image_limit",
                "Keep up to 10 reference images per product. Remove an unused reference first.",
            )
        asset = get_asset(db, asset_id)
        if asset["product_id"] != product_id or asset["kind"] != "original":
            fail(
                "asset_not_found",
                "Choose an original image belonging to this product.",
                404,
            )
        revise(product)
        product["images"].append(
            {
                "id": asset_id,
                "kind": "original",
                "role": role,
                "approved": False,
                "public": False,
            }
        )
        save_draft(db, product)
    return response_product(product)


def set_reference(database, product_id, payload):
    with database.connect(write=True) as db:
        product = load_product(db, product_id)
        check_version(product, payload.version)
        if not any(
            image["id"] == payload.asset_id and image["kind"] == "original"
            for image in product["images"]
        ):
            fail(
                "reference_invalid",
                "Select an original garment photo or PDF crop from this product.",
            )
        get_asset(db, payload.asset_id)
        if product["reference_id"] != payload.asset_id:
            revise(product)
            product["reference_id"] = payload.asset_id
            save_draft(db, product)
    return response_product(product)


def review_image(database, product_id, asset_id, payload):
    with database.connect(write=True) as db:
        product = load_product(db, product_id)
        check_version(product, payload.version)
        image = next((i for i in product["images"] if i["id"] == asset_id), None)
        if not image:
            fail(
                "asset_not_found", "This image is no longer in the product draft.", 404
            )
        asset = get_asset(db, asset_id)
        if image["kind"] == "generated":
            provenance = json.loads(asset["source"] or "{}")
            if provenance.get("version") != product["version"] and (
                payload.approved or payload.public
            ):
                fail(
                    "revision_changed",
                    "This output belongs to an older garment revision. Generate a new preview.",
                    409,
                )
        image["approved"] = payload.approved if image["kind"] == "generated" else False
        image["public"] = payload.public
        save_draft(db, product)
    return response_product(product)


def publish(database, product_id, version):
    with database.connect(write=True) as db:
        product = load_product(db, product_id)
        check_version(product, version)
        if not product["reference_id"]:
            fail(
                "reference_required",
                "Confirm an original garment image as the try-on reference first.",
            )
        reference = get_asset(db, product["reference_id"])
        if reference["kind"] != "original" or reference["product_id"] != product_id:
            fail(
                "reference_invalid",
                "Confirm an original garment image belonging to this product.",
            )
        gallery = [image for image in product["images"] if image["public"]]
        if not any(
            image["kind"] == "generated" and image["approved"] for image in gallery
        ):
            fail(
                "approval_required",
                "Approve at least one generated catalog image before publishing.",
            )
        for image in gallery:
            asset = get_asset(db, image["id"])
            if image["kind"] == "generated":
                if not image["approved"]:
                    fail(
                        "approval_required",
                        "Approve or hide every generated image selected for the public gallery.",
                    )
                if json.loads(asset["source"] or "{}").get("version") != version:
                    fail(
                        "revision_changed",
                        "Generate and approve images for the current garment revision.",
                        409,
                    )
        # Generated catalog photos lead; originals remain available for evidence.
        snapshot = {
            **product,
            "images": sorted(
                gallery
                + [
                    image
                    for image in product["images"]
                    if image["kind"] == "original" and not image["public"]
                ],
                key=lambda image: image["kind"] != "generated",
            ),
            "published": True,
        }
        db.execute(
            "UPDATE products SET published=? WHERE id=?",
            (json.dumps(snapshot), product_id),
        )
        product["published"] = True
    return response_product(product)
