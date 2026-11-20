from io import BytesIO

import pytest
from app.config import Settings
from app.main import create_app
from fastapi.testclient import TestClient
from PIL import Image


@pytest.fixture
def app(tmp_path):
    return create_app(
        Settings(
            data_dir=tmp_path, merchant_token="test-merchant-token", start_worker=False
        )
    )


@pytest.fixture
def client(app):
    with TestClient(app, base_url="http://127.0.0.1:8000") as client:
        yield client


def session(client, merchant=False):
    response = (
        client.post("/merchant/session", json={"token": "test-merchant-token"})
        if merchant
        else client.post("/sessions", json={})
    )
    assert response.status_code == 200
    return {"X-CSRF-Token": response.json()["csrf_token"]}


def photo(size=(600, 900)):
    result = BytesIO()
    Image.new("RGB", size, "#a48358").save(result, "PNG")
    return result.getvalue()


def product(client, headers):
    response = client.post(
        "/merchant/products",
        headers=headers,
        json={
            "name": "Test saree",
            "sku": "S-01",
            "category": "saree",
            "description": "Saree and blouse fabric",
            "currency": "INR",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_foreign_origin_and_missing_csrf_rejected(client):
    assert (
        client.post(
            "/sessions", json={}, headers={"Origin": "https://foreign.example"}
        ).status_code
        == 403
    )
    session(client, True)
    assert client.post("/merchant/products", json={}).status_code == 403


def test_shopper_cannot_become_merchant(client):
    headers = session(client)
    assert client.post("/merchant/session", json={"token": "wrong"}).status_code == 403
    assert (
        client.post("/merchant/products", headers=headers, json={}).status_code == 403
    )
    assert client.get("/health").json()["provider_ready"] is False


def test_draft_private_and_publish_requires_review(client):
    headers = session(client, True)
    item = product(client, headers)
    assert client.get("/products").json() == []
    assert client.get(f"/products/{item['id']}").status_code == 404
    assert (
        client.post(
            f"/merchant/products/{item['id']}/publish",
            headers=headers,
            json={"version": item["version"]},
        ).status_code
        == 422
    )


def test_image_limits_and_revision_conflict(client):
    headers = session(client, True)
    item = product(client, headers)
    path = f"/merchant/products/{item['id']}"
    assert (
        client.post(
            path + "/images",
            headers=headers,
            files={"file": ("small.png", photo((100, 100)))},
            data={"role": "main"},
        ).status_code
        == 422
    )
    updated = client.post(
        path + "/images",
        headers=headers,
        files={"file": ("garment.png", photo())},
        data={"role": "main"},
    ).json()
    assert updated["version"] > item["version"]
    assert (
        client.put(
            path, headers=headers, json={**item, "name": "Stale editor"}
        ).status_code
        == 409
    )


def test_private_asset_other_session_denied(app, client):
    headers = session(client, True)
    item = product(client, headers)
    updated = client.post(
        f"/merchant/products/{item['id']}/images",
        headers=headers,
        files={"file": ("garment.png", photo())},
        data={"role": "main"},
    ).json()
    asset = updated["images"][0]["id"]
    assert client.get(f"/assets/{asset}").status_code == 200
    with TestClient(app, base_url="http://127.0.0.1:8000") as stranger:
        session(stranger)
        assert stranger.get(f"/assets/{asset}").status_code == 404


def test_unknown_host_rejected(app):
    with TestClient(app, base_url="http://foreign.example") as client:
        assert client.get("/health").status_code == 400
