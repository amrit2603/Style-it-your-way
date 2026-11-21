import base64
import io
import json
import sqlite3
import uuid

import httpx
import pytest
from app.ai_services import KaggleClient, composite_room
from app.ai_services.config import service_origin
from app.assets import asset_path, decode_image
from app.config import Settings
from app.db import Database
from app.main import create_app
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw
from test_core import photo, session
from test_gemini import transport
from test_lifecycle import fixture_app as fixture_app
from test_lifecycle import fixture_client as fixture_client
from test_outfits import piece

PASSWORD = "test-only-password-1234"


def signup(client, email="shopper@example.test"):
    response = client.post(
        "/api/auth/signup",
        json={
            "name": "Sample shopper",
            "email": email,
            "password": PASSWORD,
            "role": "admin",
        },
    )
    assert response.status_code == 201, response.text
    return {"X-CSRF-Token": response.json()["csrf_token"]}


def test_signup_role_hash_login_rotation_and_prefix(fixture_client, fixture_app):
    client = fixture_client
    signup(client, "SHOPPER@example.test")
    assert client.get("/api/auth/me").json()["role"] == "customer"
    assert client.get("/api/admin/dashboard").status_code == 403
    with fixture_app.state.db.connect() as db:
        stored = db.execute("SELECT password_hash FROM users").fetchone()[0]
    assert stored != PASSWORD and PASSWORD not in stored
    assert (
        client.post(
            "/auth/signup",
            json={
                "name": "Again",
                "email": "shopper@example.test",
                "password": PASSWORD,
            },
        ).status_code
        == 409
    )
    old_cookie = client.cookies.get("vyumi_session")
    result = client.post(
        "/api/auth/login", json={"email": "shopper@example.test", "password": PASSWORD}
    )
    assert (
        result.status_code == 200 and client.cookies.get("vyumi_session") != old_cookie
    )
    assert client.get("/api/auth/me").json()["email"] == "shopper@example.test"
    assert client.post("/api/orders", json={}).status_code == 403


def test_login_limit_persists_and_origin_is_checked(fixture_client):
    client = fixture_client
    for _ in range(5):
        assert (
            client.post(
                "/auth/login",
                json={"email": "missing@example.test", "password": PASSWORD},
            ).status_code
            == 401
        )
    assert (
        client.post(
            "/auth/login", json={"email": "missing@example.test", "password": PASSWORD}
        ).status_code
        == 429
    )
    assert (
        client.post(
            "/api/auth/signup",
            headers={"Origin": "https://evil.example"},
            json={
                "name": "Sample",
                "email": "sample@example.test",
                "password": PASSWORD,
            },
        ).status_code
        == 403
    )


def test_bootstrap_admin_uses_email_password(tmp_path):
    app = create_app(
        Settings(
            _env_file=None,
            data_dir=tmp_path,
            start_worker=False,
            admin_email="admin@example.test",
            admin_password=PASSWORD,
        )
    )
    with TestClient(app, base_url="http://127.0.0.1:8000") as client:
        result = client.post(
            "/api/auth/login",
            json={"email": "admin@example.test", "password": PASSWORD},
        )
        assert result.status_code == 200 and result.json()["user"]["role"] == "admin"
        assert client.get("/api/admin/dashboard").status_code == 200
        assert client.get("/api/admin/products").status_code == 200
    Database(tmp_path)
    with app.state.db.connect() as db:
        assert db.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1


def test_commerce_migration_keeps_legacy_sessions_and_is_repeatable(tmp_path):
    with sqlite3.connect(tmp_path / "vyumi.sqlite3") as db:
        db.execute(
            "CREATE TABLE sessions(id TEXT PRIMARY KEY,token_hash TEXT UNIQUE NOT NULL,csrf TEXT NOT NULL,role TEXT NOT NULL,expires INTEGER NOT NULL)"
        )
        db.execute(
            "INSERT INTO sessions VALUES ('legacy','hash','csrf','shopper',9999999999)"
        )
    Database(tmp_path)
    Database(tmp_path)
    with Database(tmp_path).connect() as db:
        assert db.execute("SELECT id FROM sessions").fetchone()[0] == "legacy"
        assert [row[1] for row in db.execute("PRAGMA table_info(sessions)")].count(
            "user_id"
        ) == 1


def priced_product(client, app, headers):
    item = piece(client, app, headers, "shirt")
    with app.state.db.connect(write=True) as db:
        row = db.execute(
            "SELECT draft,published FROM products WHERE id=?", (item["id"],)
        ).fetchone()
        draft, published = json.loads(row[0]), json.loads(row[1])
        for data in (draft, published):
            data.update(price_minor=12500, sizes="M,L,XL", colors=["Blue", "White"])
        db.execute(
            "UPDATE products SET draft=?,published=? WHERE id=?",
            (json.dumps(draft), json.dumps(published), item["id"]),
        )
    return item


def test_order_is_server_priced_idempotent_and_private(fixture_client, fixture_app):
    client, app = fixture_client, fixture_app
    h = session(client, True)
    item = priced_product(client, app, h)
    h = signup(client)
    body = {
        "name": "Sample shopper",
        "address": "123 Example Road, Test City",
        "phone": "1234567890",
        "items": [
            {
                "product_id": item["id"],
                "quantity": 2,
                "size": "XL",
                "color": "Blue",
                "price": 1,
            }
        ],
        "total": 1,
        "idempotency_key": str(uuid.uuid4()),
    }
    result = client.post("/api/orders", headers=h, json=body)
    assert result.status_code == 201, result.text
    order = result.json()
    assert order["total"] == 25000 and order["items"][0]["price"] == 12500
    assert client.post("/api/orders", headers=h, json=body).json()["id"] == order["id"]
    assert (
        client.post(
            "/api/orders", headers=h, json={**body, "phone": "1111111111"}
        ).status_code
        == 409
    )
    assert client.get("/api/orders").json()[0]["id"] == order["id"]
    signup(client, "second@example.test")
    assert client.get("/api/orders").json() == []
    assert client.get("/api/orders/" + order["id"]).status_code == 404
    h = session(client, True)
    assert (
        client.put(
            "/api/admin/orders/" + order["id"], headers=h, json={"status": "delivered"}
        ).status_code
        == 409
    )
    for status in ["confirmed", "shipped", "delivered"]:
        assert (
            client.put(
                "/api/admin/orders/" + order["id"], headers=h, json={"status": status}
            ).json()["status"]
            == status
        )
    assert (
        client.delete("/api/admin/products/" + item["id"], headers=h).status_code == 200
    )
    assert client.get("/products/" + item["id"]).status_code == 404
    assert client.get("/api/admin/orders").json()[0]["items"][0]["name"] == item["name"]


def test_filters_pagination_and_invalid_options(fixture_client, fixture_app):
    client, app = fixture_client, fixture_app
    h = session(client, True)
    item = priced_product(client, app, h)
    assert (
        client.get(
            "/api/shop?color=Blue&size=XL&min_price=10000&sort=price_asc"
        ).json()["total"]
        == 1
    )
    assert client.get("/api/products?color=Green").json() == []
    assert client.get("/api/shop?page=2&limit=1").json()["items"] == []
    assert client.get("/api/shop?min_price=-1").status_code == 422
    h = signup(client)
    result = client.post(
        "/api/orders",
        headers=h,
        json={
            "name": "Sample",
            "address": "123 Example Road",
            "phone": "1234567890",
            "items": [{"product_id": item["id"], "quantity": 1, "color": "Missing"}],
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    assert (
        result.status_code == 409
        and result.json()["detail"]["code"] == "option_changed"
    )


def test_library_permission_and_selected_model_job(fixture_client, fixture_app):
    client, app = fixture_client, fixture_app
    h = session(client, True)
    item = piece(client, app, h, "shirt")
    args = {
        "headers": h,
        "files": {"file": ("sample.png", photo())},
        "data": {"label": "Fictional model", "gender": "men"},
    }
    assert client.post("/api/admin/stock-models", **args).status_code == 422
    args["data"]["permission"] = "true"
    model = client.post("/api/admin/stock-models", **args).json()
    response = client.post(
        "/api/admin/ai-generate/model-tryon",
        headers=h,
        json={
            "product_id": item["id"],
            "stock_model_id": model["id"],
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    assert response.status_code == 200, response.text
    with app.state.db.connect() as db:
        context = json.loads(
            db.execute(
                "SELECT context FROM jobs WHERE id=?", (response.json()["job_id"],)
            ).fetchone()[0]
        )
    assert context["template_asset_id"] == model["asset_id"]
    assert client.get("/api/public/assets/" + model["asset_id"]).status_code == 404


def test_selected_stock_model_is_the_actual_gpu_person_input(
    fixture_client, fixture_app, monkeypatch
):
    client, app = fixture_client, fixture_app
    h = session(client, True)
    item = piece(client, app, h, "shirt")
    model = client.post(
        "/admin/stock-models",
        headers=h,
        files={"file": ("stock.png", photo((700, 1000)))},
        data={"label": "Sample model", "permission": "true"},
    ).json()
    settings = app.state.settings
    settings.tryon_provider = "kaggle"
    settings.kaggle_api_url = "https://example.ngrok-free.app"
    settings.kaggle_api_token = "test-token"
    settings.generation_mode = "live"
    settings.generation_allowance = 10
    app.state.generation.dedicated = KaggleClient(
        settings.kaggle_api_url, settings.kaggle_api_token
    )
    captured = []
    monkeypatch.setattr(
        KaggleClient,
        "generate",
        lambda self, inputs: captured.append(inputs) or photo(),
    )
    result = client.post(
        "/admin/ai-generate/model-tryon",
        headers=h,
        json={
            "product_id": item["id"],
            "stock_model_id": model["id"],
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    assert result.status_code == 200, result.text
    app.state.generation.tick()
    assert (
        client.get("/style-it/jobs/" + result.json()["job_id"]).json()["status"]
        == "completed"
    )
    with app.state.db.connect() as db:
        asset = dict(
            db.execute(
                "SELECT * FROM assets WHERE id=?", (model["asset_id"],)
            ).fetchone()
        )
    assert (
        base64.b64decode(captured[0]["model_image"].split(",", 1)[1])
        == asset_path(app.state.db, asset).read_bytes()
    )
    assert captured[0]["request_id"] == result.json()["job_id"]
    draft = client.get("/admin/products/" + item["id"]).json()
    assert draft["images"][-1]["approved"] is False


def test_multipart_tryon_replays_same_job_without_reupload(fixture_client, fixture_app):
    client, app = fixture_client, fixture_app
    h = session(client, True)
    item = piece(client, app, h, "shirt")
    args = {
        "headers": h,
        "files": {"person_image": ("sample.png", photo())},
        "data": {
            "product_id": item["id"],
            "consent": "true",
            "idempotency_key": str(uuid.uuid4()),
        },
    }
    first = client.post("/api/tryon", **args)
    assert first.status_code == 200, first.text
    assert client.post("/api/tryon", **args).json()["job_id"] == first.json()["job_id"]
    args["files"]["person_image"] = ("different.png", photo((800, 1000)))
    assert client.post("/api/tryon", **args).status_code == 409
    with app.state.db.connect() as db:
        assert (
            db.execute("SELECT COUNT(*) FROM assets WHERE kind='personal'").fetchone()[
                0
            ]
            == 1
        )


def cutout():
    image = Image.new("RGBA", (600, 900), (0, 0, 0, 0))
    ImageDraw.Draw(image).rectangle((100, 200, 450, 700), fill="red")
    output = io.BytesIO()
    image.save(output, "PNG")
    return output.getvalue()


def test_local_room_composite_is_labelled_and_needs_no_paid_allowance(
    fixture_client, fixture_app
):
    client, app = fixture_client, fixture_app
    h = session(client, True)
    item = piece(client, app, h, "furniture")
    with app.state.db.connect() as db:
        source = dict(
            db.execute(
                "SELECT * FROM assets WHERE id=(SELECT reference_id FROM jobs LIMIT 1)"
            ).fetchone()
        )
    asset_path(app.state.db, source).write_bytes(cutout())
    app.state.settings.generation_mode = "live"
    app.state.settings.room_provider = "composite"
    app.state.settings.generation_allowance = 0
    result = client.post(
        "/api/room-visualize",
        headers=h,
        files={"room_image": ("room.png", photo())},
        data={
            "product_id": item["id"],
            "consent": "true",
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    assert result.status_code == 200, result.text
    app.state.generation.tick()
    job = client.get("/api/style-it/jobs/" + result.json()["job_id"]).json()
    assert (
        job["status"] == "completed" and job["visualization_kind"] == "room_composite"
    )
    assert client.get(job["result_image_url"]).status_code == 200
    assert decode_image(cutout(), preserve_alpha=True).mode == "RGBA"
    with app.state.db.connect() as db:
        assert db.execute("SELECT value FROM counters").fetchone()[0] == 0


def test_room_compositor_changes_pixels_without_diffusion():
    room = photo()
    result = composite_room(room, cutout())
    image = Image.open(io.BytesIO(result))
    assert image.getpixel((300, 500))[0] > image.getpixel((300, 500))[1] + 50


def test_kaggle_contract_auth_order_and_retry_idempotency(monkeypatch):
    requests = []

    def handle(request):
        requests.append(request)
        assert request.headers["authorization"] == "Bearer test-token"
        assert request.headers["x-request-id"] == "fixed-request"
        assert request.content.index(b"person_image") < request.content.index(
            b"garment_image"
        )
        if len(requests) == 1:
            raise httpx.ReadTimeout("test", request=request)
        return httpx.Response(
            200, json={"image_base64": base64.b64encode(photo()).decode()}
        )

    transport(monkeypatch, handle)
    uri = "data:image/png;base64," + base64.b64encode(photo()).decode()
    result = KaggleClient("https://example.ngrok-free.app", "test-token").generate(
        {
            "model_image": uri,
            "product_image": uri,
            "request_id": "fixed-request",
            "garment_categories": ["shirt"],
        }
    )
    assert result == photo() and len(requests) == 2


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com",
        "https://127.0.0.1",
        "https://example.com/private",
        "https://user:pass@example.com",
    ],
)
def test_kaggle_origin_rejects_unsafe_configuration(url):
    with pytest.raises(ValueError):
        service_origin(url)


def test_existing_editor_does_not_erase_new_product_colors(fixture_client, fixture_app):
    client, app = fixture_client, fixture_app
    h = session(client, True)
    item = priced_product(client, app, h)
    result = client.put(
        "/merchant/products/" + item["id"],
        headers=h,
        json={
            key: item[key]
            for key in (
                "version",
                "sku",
                "name",
                "category",
                "description",
                "currency",
                "sizes",
            )
        },
    )
    assert result.status_code == 200 and result.json()["colors"] == ["Blue", "White"]


def test_palette_png_transparency_survives_product_decode():
    image = Image.new("P", (600, 900), 0)
    image.putpalette([255, 255, 255] + [0, 0, 0] * 255)
    output = io.BytesIO()
    image.save(output, "PNG", transparency=0)
    decoded = decode_image(output.getvalue(), preserve_alpha=True)
    assert decoded.mode == "RGBA" and decoded.getpixel((0, 0))[3] == 0


def test_room_compositor_rejects_extreme_aspect_ratio_before_upscaling():
    from app.provider import ProviderError

    with pytest.raises(ProviderError) as caught:
        composite_room(photo((12000, 128)), cutout())
    assert caught.value.code == "room_framing"


def test_watch_accepts_wrist_photo_but_wrist_cannot_bypass_clothing_validation(
    fixture_app, fixture_client, monkeypatch
):
    from app import main
    from app.provider import CloudflareClient

    client, app = fixture_client, fixture_app
    h = session(client, True)
    watch = piece(client, app, h, "watch")
    shirt = piece(client, app, h, "shirt")
    settings = app.state.settings
    settings.generation_mode = "live"
    settings.generation_allowance = 10
    settings.cloudflare_account_id = "a" * 32
    settings.cloudflare_api_token = "test-token"
    app.state.generation.provider = CloudflareClient(
        settings.cloudflare_account_id, settings.cloudflare_api_token
    )
    monkeypatch.setattr(
        main,
        "check_person",
        lambda image: pytest.fail("Wrist upload must not require a face"),
    )
    result = client.post(
        "/api/tryon",
        headers=h,
        files={"person_image": ("wrist.png", photo())},
        data={
            "product_id": watch["id"],
            "consent": "true",
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    assert result.status_code == 200, result.text
    uploaded = client.post(
        "/style-it/photos",
        headers=h,
        files={"file": ("wrist.png", photo())},
        data={"purpose": "wrist", "consent": "true"},
    ).json()
    result = client.post(
        "/style-it/generate",
        headers=h,
        json={
            "product_id": shirt["id"],
            "user_image_id": uploaded["id"],
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    assert (
        result.status_code == 422
        and result.json()["detail"]["code"] == "photo_purpose_mismatch"
    )
