import base64
import json
import uuid

import httpx
import pytest
from app.provider import CloudflareClient, GeminiClient, ProviderError
from test_core import photo, session
from test_lifecycle import fixture_app as fixture_app
from test_lifecycle import fixture_client as fixture_client
from test_lifecycle import ready_draft


def transport(monkeypatch, handler):
    client = httpx.Client
    monkeypatch.setattr(
        "app.provider.httpx.Client",
        lambda **kwargs: client(transport=httpx.MockTransport(handler), **kwargs),
    )


@pytest.mark.parametrize("personal", [False, True])
def test_gemini_sends_references_and_decodes_image(monkeypatch, personal):
    uri = "data:image/png;base64," + base64.b64encode(photo()).decode()

    def handle(request):
        assert request.url.host == "generativelanguage.googleapis.com"
        assert request.headers["x-goog-api-key"] == "test-key"
        payload = json.loads(request.content)
        parts = payload["contents"][0]["parts"]
        assert len(parts) == (3 if personal else 2)
        assert parts[1]["inlineData"]["data"] == uri.split(",")[1]
        if personal:
            assert "Preserve their face" in parts[0]["text"]
            assert parts[2]["inlineData"]["data"] == uri.split(",")[1]
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "inlineData": {
                                        "mimeType": "image/png",
                                        "data": uri.split(",")[1],
                                    }
                                }
                            ]
                        }
                    }
                ]
            },
        )

    transport(monkeypatch, handle)
    inputs = {"product_image": uri}
    if personal:
        inputs["model_image"] = uri
    assert (
        GeminiClient("test-key", "gemini-3.1-flash-image").generate(inputs) == photo()
    )


@pytest.mark.parametrize(
    "status,body,code,ambiguous",
    [
        (429, {}, "gemini_rejected", False),
        (403, {}, "gemini_rejected", False),
        (503, {}, "gemini_rejected", True),
        (200, {"candidates": []}, "gemini_no_image", False),
        (200, {"candidates": "bad"}, "gemini_uncertain", True),
    ],
)
def test_gemini_errors_do_not_retry(monkeypatch, status, body, code, ambiguous):
    calls = []

    def handle(request):
        calls.append(request)
        return httpx.Response(status, json=body)

    transport(monkeypatch, handle)
    with pytest.raises(ProviderError) as error:
        GeminiClient("test-key", "gemini-3.1-flash-image").generate(
            {"product_image": "data:image/png;base64,YQ=="}
        )
    assert error.value.code == code and error.value.ambiguous == ambiguous
    assert len(calls) == 1 and "test-key" not in str(error.value)


@pytest.mark.parametrize("name", ["Gemini", "Cloudflare"])
def test_synchronous_worker_completes_and_replays_without_second_call(
    fixture_app, fixture_client, monkeypatch, name
):
    headers = session(fixture_client, True)
    item = ready_draft(fixture_client, headers)
    settings = fixture_app.state.settings
    settings.generation_mode = "live"
    settings.gemini_api_key = "test-key"
    settings.generation_allowance = 1
    if name == "Cloudflare":
        settings.cloudflare_account_id = "a" * 32
        settings.cloudflare_api_token = "test-token"
        provider = CloudflareClient(
            settings.cloudflare_account_id, settings.cloudflare_api_token
        )
    else:
        provider = GeminiClient("test-key", settings.gemini_model)
    calls = []
    monkeypatch.setattr(
        provider, "generate", lambda inputs: calls.append(inputs) or photo()
    )
    fixture_app.state.generation.provider = provider
    payload = {
        "version": item["version"],
        "prompt": "neutral studio",
        "idempotency_key": str(uuid.uuid4()),
    }
    route = f"/merchant/products/{item['id']}/generate"
    response = fixture_client.post(route, headers=headers, json=payload)
    assert response.status_code == 200
    fixture_app.state.generation.tick()
    job = fixture_client.get("/style-it/jobs/" + response.json()["job_id"]).json()
    assert job["status"] == "completed" and job["fixture"] is False
    assert (
        fixture_client.get(job["result_image_url"].removeprefix("/api")).status_code
        == 200
    )
    again = fixture_client.post(route, headers=headers, json=payload)
    assert again.json()["job_id"] == job["job_id"] and len(calls) == 1
