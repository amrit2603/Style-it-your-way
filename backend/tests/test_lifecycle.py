import json
import uuid

import pytest
from app.config import Settings
from app.main import create_app
from app.provider import FashnClient, ProviderError
from fastapi.testclient import TestClient
from test_core import photo, product, session
from test_pdf import pdf_bytes


@pytest.fixture
def fixture_app(tmp_path):
    return create_app(
        Settings(
            _env_file=None,
            data_dir=tmp_path,
            merchant_token="test-merchant-token",
            generation_mode="fixture",
            start_worker=False,
        )
    )


@pytest.fixture
def fixture_client(fixture_app):
    with TestClient(fixture_app, base_url="http://127.0.0.1:8000") as client:
        yield client


def ready_draft(client, headers):
    item = product(client, headers)
    path = f"/merchant/products/{item['id']}"
    item = client.post(
        path + "/images",
        headers=headers,
        files={"file": ("original.png", photo())},
        data={"role": "main"},
    ).json()
    original = item["images"][0]["id"]
    item = client.post(
        path + "/reference",
        headers=headers,
        json={"asset_id": original, "version": item["version"]},
    ).json()
    return item


def publish_fixture(client, app, headers):
    item = ready_draft(client, headers)
    path = f"/merchant/products/{item['id']}"
    job = client.post(
        path + "/generate",
        headers=headers,
        json={"version": item["version"], "idempotency_key": str(uuid.uuid4())},
    ).json()
    app.state.generation.tick()
    app.state.generation.tick()
    assert client.get(f"/style-it/jobs/{job['job_id']}").json()["status"] == "completed"
    item = client.get(path).json()
    generated = item["images"][-1]["id"]
    item = client.post(
        path + f"/images/{generated}/review",
        headers=headers,
        json={"version": item["version"], "approved": True, "public": True},
    ).json()
    result = client.post(
        path + "/publish", headers=headers, json={"version": item["version"]}
    )
    assert result.status_code == 200, result.text
    return result.json()


def test_catalog_to_publication_and_immutable_snapshot(fixture_client, fixture_app):
    client = fixture_client
    headers = session(client, True)
    item = publish_fixture(client, fixture_app, headers)
    published = client.get(f"/products/{item['id']}").json()
    assert published["reference_id"] is None
    assert published["images"][0]["kind"] == "generated"
    assert (
        client.get(published["images"][0]["url"].removeprefix("/api")).status_code
        == 200
    )
    updated = client.put(
        f"/merchant/products/{item['id']}",
        headers=headers,
        json={**item, "name": "New draft name"},
    ).json()
    assert updated["name"] == "New draft name"
    assert all(not image["approved"] for image in updated["images"])
    assert client.get(f"/products/{item['id']}").json()["name"] == item["name"]
    assert (
        client.post(
            f"/merchant/products/{item['id']}/publish",
            headers=headers,
            json={"version": updated["version"]},
        ).status_code
        == 422
    )
    assert (
        client.delete(f"/assets/{item['reference_id']}", headers=headers).status_code
        == 409
    )


def test_duplicate_job_and_changed_input(fixture_client, fixture_app):
    client = fixture_client
    headers = session(client, True)
    item = ready_draft(client, headers)
    path = f"/merchant/products/{item['id']}/generate"
    payload = {"version": item["version"], "idempotency_key": str(uuid.uuid4())}
    first = client.post(path, headers=headers, json=payload)
    assert first.status_code == 200, first.text
    again = client.post(path, headers=headers, json=payload)
    assert first.json()["job_id"] == again.json()["job_id"]
    assert (
        client.post(
            path, headers=headers, json={**payload, "prompt": "another scene"}
        ).status_code
        == 409
    )
    with fixture_app.state.db.connect() as db:
        assert db.execute("SELECT count(*) FROM jobs").fetchone()[0] == 1


def test_pdf_crop_provenance_and_bounds(fixture_client):
    client = fixture_client
    headers = session(client, True)
    item = product(client, headers)
    pdf = client.post(
        "/merchant/pdfs", headers=headers, files={"file": ("catalog.pdf", pdf_bytes())}
    )
    assert pdf.status_code == 200, pdf.text
    pdf_id = pdf.json()["id"]
    assert client.get(f"/public/assets/{pdf_id}").status_code == 404
    payload = {
        "product_id": item["id"],
        "page": 0,
        "x": 0,
        "y": 0,
        "width": 1,
        "height": 1,
        "role": "main",
    }
    assert (
        client.post(
            f"/merchant/pdfs/{pdf_id}/crops",
            headers=headers,
            json={**payload, "x": 0.9},
        ).status_code
        == 422
    )
    assert (
        client.post(
            f"/merchant/pdfs/{pdf_id}/crops",
            headers=headers,
            json={**payload, "width": 0.01},
        ).status_code
        == 422
    )
    result = client.post(
        f"/merchant/pdfs/{pdf_id}/crops", headers=headers, json=payload
    )
    assert result.status_code == 200, result.text
    with client.app.state.db.connect() as db:
        source = json.loads(
            db.execute(
                "SELECT source FROM assets WHERE id=?",
                (result.json()["images"][0]["id"],),
            ).fetchone()[0]
        )
    assert source["pdf_id"] == pdf_id and source["page"] == 0


def test_private_tryon_delete_discards_late_output(fixture_client, fixture_app):
    merchant_headers = session(fixture_client, True)
    item = publish_fixture(fixture_client, fixture_app, merchant_headers)
    with TestClient(fixture_app, base_url="http://127.0.0.1:8000") as shopper:
        headers = session(shopper)
        denied = shopper.post(
            "/style-it/photos",
            headers=headers,
            files={"file": ("self.png", photo())},
            data={"consent": "false"},
        )
        assert denied.status_code == 422
        uploaded = shopper.post(
            "/style-it/photos",
            headers=headers,
            files={"file": ("self.png", photo())},
            data={"consent": "true"},
        ).json()
        response = shopper.post(
            "/style-it/generate",
            headers=headers,
            json={
                "user_image_id": uploaded["id"],
                "product_id": item["id"],
                "idempotency_key": str(uuid.uuid4()),
            },
        )
        assert response.status_code == 200, response.text
        job_id = response.json()["job_id"]
        fixture_app.state.generation.tick()
        with fixture_app.state.db.connect() as db:
            running = dict(
                db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
            )
        assert fixture_client.get(f"/style-it/jobs/{job_id}").status_code == 404
        assert (
            shopper.delete(f"/assets/{uploaded['id']}", headers=headers).status_code
            == 200
        )
        fixture_app.state.generation._finish(running, photo())
        result = shopper.get(f"/style-it/jobs/{job_id}").json()
        assert result["status"] == "cancelled" and "result_image_url" not in result
        assert shopper.get(f"/assets/{uploaded['id']}").status_code == 404


def test_expiration_denies_bytes_even_before_cleanup(fixture_client, fixture_app):
    headers = session(fixture_client)
    uploaded = fixture_client.post(
        "/style-it/photos",
        headers=headers,
        files={"file": ("self.png", photo())},
        data={"consent": "true"},
    ).json()
    with fixture_app.state.db.connect(write=True) as db:
        db.execute("UPDATE assets SET expires=1 WHERE id=?", (uploaded["id"],))
    assert fixture_client.get(f"/assets/{uploaded['id']}").status_code == 404


def test_live_missing_configuration_rejected(tmp_path):
    app = create_app(
        Settings(
            _env_file=None,
            data_dir=tmp_path,
            merchant_token="test-merchant-token",
            start_worker=False,
        )
    )
    with TestClient(app, base_url="http://127.0.0.1:8000") as client:
        headers = session(client, True)
        item = ready_draft(client, headers)
        result = client.post(
            f"/merchant/products/{item['id']}/generate",
            headers=headers,
            json={"version": item["version"], "idempotency_key": str(uuid.uuid4())},
        )
        assert result.status_code == 503
        assert result.json()["detail"]["code"] == "provider_not_configured"


def test_recovery_never_resubmits_ambiguous_job(fixture_client, fixture_app):
    headers = session(fixture_client, True)
    item = ready_draft(fixture_client, headers)
    result = fixture_client.post(
        f"/merchant/products/{item['id']}/generate",
        headers=headers,
        json={"version": item["version"], "idempotency_key": str(uuid.uuid4())},
    ).json()
    with fixture_app.state.db.connect(write=True) as db:
        db.execute(
            "UPDATE jobs SET status='submitting' WHERE id=?", (result["job_id"],)
        )
    fixture_app.state.generation.recover()
    fixture_app.state.generation.tick()
    assert (
        fixture_client.get(f"/style-it/jobs/{result['job_id']}").json()["status"]
        == "needs_review"
    )


def test_provider_rejects_urls_and_malformed_images(monkeypatch):
    client = FashnClient("test")
    monkeypatch.setattr(
        client,
        "_request",
        lambda *args: {"status": "completed", "output": ["http://127.0.0.1/secret"]},
    )
    with pytest.raises(ProviderError):
        client.status("prediction-123")
    monkeypatch.setattr(
        client,
        "_request",
        lambda *args: {"status": "completed", "output": ["data:image/png;base64,!bad"]},
    )
    with pytest.raises(ProviderError):
        client.status("prediction-123")
