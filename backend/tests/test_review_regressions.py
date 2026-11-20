import uuid
from pathlib import Path

import pytest
from app.provider import FashnClient, ProviderError
from fastapi.testclient import TestClient
from test_core import photo, session
from test_lifecycle import fixture_app as fixture_app
from test_lifecycle import fixture_client as fixture_client
from test_lifecycle import publish_fixture, ready_draft


def test_replacement_gallery_publishes_without_unpublishing(
    fixture_client, fixture_app
):
    client = fixture_client
    headers = session(client, True)
    old = publish_fixture(client, fixture_app, headers)
    path = f"/merchant/products/{old['id']}"
    reference = old["reference_id"]
    assert client.get(f"/public/assets/{reference}").status_code == 404
    item = client.put(
        path, headers=headers, json={**old, "name": "Updated garment"}
    ).json()
    assert all(not i["public"] for i in item["images"] if i["kind"] == "generated")
    assert client.get(f"/products/{old['id']}").json()["name"] == old["name"]
    job = client.post(
        path + "/generate",
        headers=headers,
        json={"version": item["version"], "idempotency_key": str(uuid.uuid4())},
    ).json()
    assert client.get(path).json()["status"] == "Generating"
    fixture_app.state.generation.tick()
    fixture_app.state.generation.tick()
    item = client.get(path).json()
    assert item["status"] == "Needs review" and item["published"] is True
    assert item["latest_job"]["job_id"] == job["job_id"]
    fresh = item["images"][-1]
    reviewed = client.post(
        path + f"/images/{fresh['id']}/review",
        headers=headers,
        json={"version": item["version"], "approved": True, "public": True},
    ).json()
    result = client.post(
        path + "/publish", headers=headers, json={"version": reviewed["version"]}
    )
    assert result.status_code == 200, result.text
    assert client.get(f"/products/{old['id']}").json()["name"] == "Updated garment"


def test_logout_revokes_queued_private_work_atomically(fixture_client, fixture_app):
    headers = session(fixture_client, True)
    item = publish_fixture(fixture_client, fixture_app, headers)
    with TestClient(fixture_app, base_url="http://127.0.0.1:8000") as shopper:
        h = session(shopper)
        uploaded = shopper.post(
            "/style-it/photos",
            headers=h,
            files={"file": ("self.png", photo())},
            data={"consent": "true"},
        ).json()
        job = shopper.post(
            "/style-it/generate",
            headers=h,
            json={
                "product_id": item["id"],
                "user_image_id": uploaded["id"],
                "idempotency_key": str(uuid.uuid4()),
            },
        ).json()
        assert shopper.post("/sessions/logout", headers=h, json={}).status_code == 200
        fixture_app.state.generation.tick()
        with fixture_app.state.db.connect() as db:
            assert (
                db.execute(
                    "SELECT status FROM jobs WHERE id=?", (job["job_id"],)
                ).fetchone()[0]
                == "cancelled"
            )
            assert (
                db.execute(
                    "SELECT deleted FROM assets WHERE id=?", (uploaded["id"],)
                ).fetchone()[0]
                == 1
            )
            assert (
                db.execute(
                    "SELECT COUNT(*) FROM assets WHERE kind='personal_result'"
                ).fetchone()[0]
                == 0
            )


def test_locked_deleted_file_stays_inaccessible_and_cleanup_retries(
    fixture_client, fixture_app, monkeypatch
):
    headers = session(fixture_client)
    uploaded = fixture_client.post(
        "/style-it/photos",
        headers=headers,
        files={"file": ("self.png", photo())},
        data={"consent": "true"},
    ).json()
    target = fixture_app.state.db.root / "files" / (uploaded["id"] + ".jpg")
    actual_unlink = Path.unlink

    def locked(path, *args, **kwargs):
        if path == target:
            raise PermissionError("file locked")
        return actual_unlink(path, *args, **kwargs)

    with monkeypatch.context() as m:
        m.setattr(Path, "unlink", locked)
        assert (
            fixture_client.delete(
                f"/assets/{uploaded['id']}", headers=headers
            ).status_code
            == 200
        )
        assert fixture_client.get(f"/assets/{uploaded['id']}").status_code == 404
        assert target.is_file()
    fixture_app.state.generation.cleanup()
    assert not target.exists()


def test_transient_status_failure_keeps_same_prediction(fixture_client, fixture_app):
    headers = session(fixture_client, True)
    item = ready_draft(fixture_client, headers)
    job = fixture_client.post(
        f"/merchant/products/{item['id']}/generate",
        headers=headers,
        json={"version": item["version"], "idempotency_key": str(uuid.uuid4())},
    ).json()
    with fixture_app.state.db.connect(write=True) as db:
        db.execute(
            "UPDATE jobs SET fixture=0,status='processing',prediction_id='known-prediction' WHERE id=?",
            (job["job_id"],),
        )

    class Provider:
        calls = 0

        def submit(self, *args):
            raise AssertionError("Do not submit again")

        def status(self, prediction):
            assert prediction == "known-prediction"
            self.calls += 1
            if self.calls == 1:
                raise ProviderError("provider_unavailable", "temporary", retryable=True)
            return {"status": "completed", "image": photo()}

    fixture_app.state.generation.provider = Provider()
    fixture_app.state.generation.tick()
    assert (
        fixture_client.get(f"/style-it/jobs/{job['job_id']}").json()["status"]
        == "processing"
    )
    fixture_app.state.generation.tick()
    assert (
        fixture_client.get(f"/style-it/jobs/{job['job_id']}").json()["status"]
        == "completed"
    )


def test_original_reference_not_selected_for_public_gallery(fixture_client):
    headers = session(fixture_client, True)
    item = ready_draft(fixture_client, headers)
    assert item["reference_id"]
    assert all(not image["public"] for image in item["images"])


def test_malformed_status_is_retryable(monkeypatch):
    provider = FashnClient("test")
    monkeypatch.setattr(provider, "_request", lambda *args: {"status": []})
    with pytest.raises(ProviderError) as error:
        provider.status("existing-prediction")
    assert error.value.retryable is True


def test_paid_allowance_is_reserved_once_for_duplicate_requests(
    fixture_client, fixture_app
):
    headers = session(fixture_client, True)
    item = ready_draft(fixture_client, headers)
    fixture_app.state.settings.generation_mode = "live"
    fixture_app.state.settings.fashn_api_key = "test-placeholder"
    fixture_app.state.settings.generation_allowance = 1
    path = f"/merchant/products/{item['id']}/generate"
    payload = {"version": item["version"], "idempotency_key": str(uuid.uuid4())}
    first = fixture_client.post(path, headers=headers, json=payload)
    again = fixture_client.post(path, headers=headers, json=payload)
    assert first.status_code == 200 and again.json()["job_id"] == first.json()["job_id"]
    assert (
        fixture_client.post(
            path,
            headers=headers,
            json={**payload, "idempotency_key": str(uuid.uuid4())},
        ).status_code
        == 429
    )
    assert fixture_app.state.generation.remaining() == 0
