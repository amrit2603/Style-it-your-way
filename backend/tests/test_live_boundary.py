import base64
import uuid

from test_core import photo, session
from test_lifecycle import fixture_app as fixture_app
from test_lifecycle import fixture_client as fixture_client
from test_lifecycle import publish_fixture, ready_draft


def enable_recording_provider(app):
    class Provider:
        calls = []

        def submit(self, model, inputs):
            self.calls.append((model, inputs))
            return "recorded-prediction"

        def status(self, prediction):
            return {"status": "completed", "image": photo()}

    app.state.settings.generation_mode = "live"
    app.state.settings.fashn_api_key = "test-not-a-real-key"
    app.state.settings.generation_allowance = 2
    provider = Provider()
    app.state.generation.provider = provider
    return provider


def test_catalog_request_uses_uploaded_original(fixture_client, fixture_app):
    client = fixture_client
    headers = session(client, True)
    item = ready_draft(client, headers)
    provider = enable_recording_provider(fixture_app)
    response = client.post(
        f"/merchant/products/{item['id']}/generate",
        headers=headers,
        json={
            "version": item["version"],
            "prompt": "plain studio",
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    assert response.status_code == 200
    fixture_app.state.generation.tick()
    model, inputs = provider.calls[0]
    assert model == "product-to-model" and "model_image" not in inputs
    assert inputs["num_images"] == 1 and inputs["return_base64"] is True
    with fixture_app.state.db.connect() as db:
        reference = db.execute(
            "SELECT filename FROM assets WHERE id=?", (item["reference_id"],)
        ).fetchone()[0]
    assert (
        base64.b64decode(inputs["product_image"].split(",")[1])
        == (fixture_app.state.db.root / "files" / reference).read_bytes()
    )


def test_personal_request_uses_this_person_and_published_original(
    fixture_client, fixture_app, monkeypatch
):
    client = fixture_client
    headers = session(client, True)
    item = publish_fixture(client, fixture_app, headers)
    provider = enable_recording_provider(fixture_app)
    monkeypatch.setattr(
        "app.main.check_person",
        lambda image: {
            "accepted": True,
            "code": "test",
            "message": "Test detector substitute",
        },
    )
    uploaded = client.post(
        "/style-it/photos",
        headers=headers,
        files={"file": ("person.png", photo())},
        data={"consent": "true"},
    ).json()
    response = client.post(
        "/style-it/generate",
        headers=headers,
        json={
            "product_id": item["id"],
            "user_image_id": uploaded["id"],
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    assert response.status_code == 200, response.text
    fixture_app.state.generation.tick()
    model, inputs = provider.calls[0]
    assert model == "tryon-max" and inputs["return_base64"] is True
    with fixture_app.state.db.connect() as db:
        source = db.execute(
            "SELECT filename FROM assets WHERE id=?", (item["reference_id"],)
        ).fetchone()[0]
        person = db.execute(
            "SELECT filename FROM assets WHERE id=?", (uploaded["id"],)
        ).fetchone()[0]
    assert (
        base64.b64decode(inputs["product_image"].split(",")[1])
        == (fixture_app.state.db.root / "files" / source).read_bytes()
    )
    assert (
        base64.b64decode(inputs["model_image"].split(",")[1])
        == (fixture_app.state.db.root / "files" / person).read_bytes()
    )
    fixture_app.state.generation.tick()
    assert (
        client.get("/style-it/jobs/" + response.json()["job_id"]).json()["status"]
        == "completed"
    )
