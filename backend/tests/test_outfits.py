import json
import uuid

import pytest
from app.db import Database
from app.schemas import ProductInput
from test_core import photo, session
from test_lifecycle import fixture_app as fixture_app
from test_lifecycle import fixture_client as fixture_client
from test_lifecycle import publish_fixture


def piece(client, app, headers, category, public=True):
    # Existing publication helper supplies real asset and approval boundaries.
    with app.state.db.connect(write=True) as db:
        db.execute("UPDATE products SET sku=? WHERE sku='S-01'", (str(uuid.uuid4()),))
    item = publish_fixture(client, app, headers)
    with app.state.db.connect(write=True) as db:
        row = db.execute(
            "SELECT draft,published FROM products WHERE id=?", (item["id"],)
        ).fetchone()
        draft, published = json.loads(row[0]), json.loads(row[1])
        draft["category"] = published["category"] = category
        draft["audience"] = published["audience"] = (
            "men" if category in {"shirt", "trousers", "jacket"} else "women"
        )
        db.execute(
            "UPDATE products SET draft=?,published=? WHERE id=?",
            (json.dumps(draft), json.dumps(published) if public else None, item["id"]),
        )
    return item


@pytest.mark.parametrize(
    "category",
    ["shirt", "trousers", "jacket", "dress", "kurta", "top", "skirt", "lehenga"],
)
def test_expanded_garment_schema(category):
    item = ProductInput(
        sku="new",
        name="Garment",
        category=category,
        audience="men",
        description="Reference details",
    )
    assert item.audience == "men" and item.category == category


@pytest.mark.parametrize(
    "categories,code",
    [
        (["shirt", "trousers", "jacket"], None),
        (["suit", "jacket"], None),
        (["saree", "dress"], "outfit_conflict"),
        (["shirt", "kurta"], "outfit_conflict"),
        (["suit", "trousers"], "outfit_conflict"),
    ],
)
def test_outfit_slot_rules_and_durable_reference_snapshot(
    fixture_app, fixture_client, categories, code
):
    client, app = fixture_client, fixture_app
    h = session(client, True)
    items = [piece(client, app, h, category) for category in categories]
    # Fixture generation setup is intentionally excluded from shopper rate accounting.
    with app.state.db.connect(write=True) as db:
        db.execute("UPDATE jobs SET created=created-120")
    uploaded = client.post(
        "/style-it/photos",
        headers=h,
        files={"file": ("person.png", photo())},
        data={"consent": "true"},
    ).json()
    payload = {
        "product_id": items[0]["id"],
        "additional_product_ids": [p["id"] for p in items[1:]],
        "user_image_id": uploaded["id"],
        "idempotency_key": str(uuid.uuid4()),
    }
    result = client.post("/style-it/generate", headers=h, json=payload)
    if code:
        assert result.status_code == 422 and result.json()["detail"]["code"] == code
    else:
        assert result.status_code == 200, result.text
        with app.state.db.connect() as db:
            context = json.loads(
                db.execute(
                    "SELECT context FROM jobs WHERE id=?", (result.json()["job_id"],)
                ).fetchone()[0]
            )
        assert [g["reference_id"] for g in context["garments"]] == [
            i["reference_id"] for i in items
        ]
        app.state.generation.tick()
        app.state.generation.tick()
        assert (
            client.get("/style-it/jobs/" + result.json()["job_id"]).json()["status"]
            == "completed"
        )


def test_private_extra_garment_is_not_available(fixture_app, fixture_client):
    client, app = fixture_client, fixture_app
    h = session(client, True)
    first = piece(client, app, h, "shirt")
    extra = piece(client, app, h, "trousers", public=False)
    with app.state.db.connect(write=True) as db:
        db.execute("UPDATE jobs SET created=created-120")
    uploaded = client.post(
        "/style-it/photos",
        headers=h,
        files={"file": ("person.png", photo())},
        data={"consent": "true"},
    ).json()
    r = client.post(
        "/style-it/generate",
        headers=h,
        json={
            "product_id": first["id"],
            "additional_product_ids": [extra["id"]],
            "user_image_id": uploaded["id"],
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    assert r.status_code == 404


def test_job_context_migration_is_additive_and_repeatable(tmp_path):
    database = Database(tmp_path)
    with database.connect(write=True) as db:
        db.execute("ALTER TABLE jobs DROP COLUMN context")
        db.execute("UPDATE counters SET value=7 WHERE key='live_submissions'")
        db.execute(
            "INSERT INTO sessions VALUES ('old-session','hash','csrf','shopper',123)"
        )
    Database(tmp_path)
    Database(tmp_path)
    with database.connect() as db:
        assert [row[1] for row in db.execute("PRAGMA table_info(jobs)")].count(
            "context"
        ) == 1
        assert db.execute("SELECT value FROM counters").fetchone()[0] == 7
        assert db.execute("SELECT id FROM sessions").fetchone()[0] == "old-session"


def test_public_category_and_collection_filters(fixture_app, fixture_client):
    h = session(fixture_client, True)
    shirt = piece(fixture_client, fixture_app, h, "shirt")
    assert [
        p["id"]
        for p in fixture_client.get("/products?category=shirt&audience=men").json()
    ] == [shirt["id"]]
    assert fixture_client.get("/products?category=shirt&audience=women").json() == []
    assert fixture_client.get("/products?category=invalid").status_code == 422
