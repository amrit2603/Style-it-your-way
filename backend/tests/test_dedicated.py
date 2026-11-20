import base64
import io
import json
from email.parser import BytesParser
from email.policy import default

import httpx
import pytest
from app import photo_checks
from app.assets import decode_image
from app.config import Settings
from app.main import create_app
from app.provider import FashnDemoClient, ProviderError
from fastapi.testclient import TestClient
from PIL import Image
from test_core import photo, session
from test_gemini import transport
from test_lifecycle import fixture_app as fixture_app
from test_lifecycle import fixture_client as fixture_client


def uri(content):
    return "data:image/png;base64," + base64.b64encode(content).decode()


@pytest.mark.parametrize("extra", [False, True])
def test_dedicated_model_uses_person_and_garment_and_chains_outfit(monkeypatch, extra):
    monkeypatch.setattr(
        FashnDemoClient, "_photo_type", staticmethod(lambda raw: "flat-lay")
    )
    original = photo()
    result = photo((700, 1000))
    uploads, calls = [], []
    output_url = (
        FashnDemoClient.ORIGIN
        + "/gradio_api/file=/tmp/gradio/"
        + "a" * 64
        + "/image.webp"
    )

    def handle(request):
        assert request.url.host == "fashn-ai-fashn-vton-1-5.hf.space"
        if request.url.path.endswith("/upload"):
            message = BytesParser(policy=default).parsebytes(
                (
                    "Content-Type: " + request.headers["content-type"] + "\r\n\r\n"
                ).encode()
                + request.content
            )
            images = [p.get_payload(decode=True) for p in message.iter_parts()]
            uploads.append(images)
            return httpx.Response(
                200, json=["/tmp/gradio/person", "/tmp/gradio/garment"]
            )
        if request.method == "POST":
            calls.append(json.loads(request.content)["data"])
            return httpx.Response(200, json={"event_id": "b" * 32})
        if "/call/" in request.url.path:
            return httpx.Response(
                200,
                text="event: complete\ndata: "
                + json.dumps([{"url": output_url}])
                + "\n\n",
            )
        return httpx.Response(200, content=result)

    transport(monkeypatch, handle)
    inputs = {
        "model_image": uri(original),
        "product_image": uri(original),
        "garment_categories": ["shirt", "trousers"],
    }
    if extra:
        inputs["additional_images"] = [uri(original)]
    assert FashnDemoClient().generate(inputs) == result
    assert uploads[0] == [original, original]
    assert calls[0][2] == "tops"
    assert calls[0][3] == "flat-lay"
    if extra:
        assert uploads[1][0] == result and calls[1][2] == "bottoms"


def test_provider_output_cannot_redirect_photo_download_to_another_host(monkeypatch):
    calls = []

    def handle(request):
        calls.append(str(request.url))
        if request.url.path.endswith("/upload"):
            return httpx.Response(200, json=["/tmp/gradio/p", "/tmp/gradio/g"])
        if request.method == "POST":
            return httpx.Response(200, json={"event_id": "b" * 32})
        return httpx.Response(
            200, text='event: complete\ndata: [{"url":"http://127.0.0.1/private"}]\n\n'
        )

    transport(monkeypatch, handle)
    with pytest.raises(ProviderError):
        FashnDemoClient().generate(
            {"model_image": uri(photo()), "product_image": uri(photo())}
        )
    assert len(calls) == 3


def test_portrait_pose_advice_does_not_block_upload(monkeypatch):
    monkeypatch.setattr(
        photo_checks,
        "check_person",
        lambda image: {
            "accepted": False,
            "code": "photo_framing",
            "message": "Show hips",
        },
    )
    monkeypatch.setattr(photo_checks, "_face_count", lambda image: 1)
    assert photo_checks.check_upload(Image.new("RGB", (256, 256)))["accepted"] is True


def test_group_photo_still_requires_one_person(monkeypatch):
    monkeypatch.setattr(
        photo_checks,
        "check_person",
        lambda image: {
            "accepted": False,
            "code": "photo_people",
            "message": "One person",
        },
    )
    monkeypatch.setattr(photo_checks, "_face_count", lambda image: 2)
    assert photo_checks.check_upload(Image.new("RGB", (256, 256)))["accepted"] is False


@pytest.mark.parametrize("image_format", ["HEIF", "AVIF"])
def test_phone_heic_and_small_personal_photos(fixture_client, image_format):
    headers = session(fixture_client)
    content = io.BytesIO()
    Image.new("RGB", (256, 320), "blue").save(content, format=image_format)
    image = decode_image(content.getvalue(), minimum=False)
    assert image.size == (256, 320)
    response = fixture_client.post(
        "/style-it/photos",
        headers=headers,
        files={"file": ("phone.heic", content.getvalue(), "image/heic")},
        data={"consent": "true"},
    )
    assert response.status_code == 200, response.text


def test_dedicated_tryon_does_not_require_catalog_key():
    settings = Settings(_env_file=None, tryon_provider="fashn_demo")
    assert settings.tryon_configured and not settings.provider_configured


def test_personal_and_catalog_readiness_are_independent(tmp_path):
    settings = Settings(
        _env_file=None,
        data_dir=tmp_path,
        tryon_provider="fashn_demo",
        generation_allowance=1,
        start_worker=False,
    )
    with TestClient(create_app(settings), base_url="http://127.0.0.1:8000") as client:
        health = client.get("/health").json()
    assert health["provider_ready"] is True
    assert health["catalog_ready"] is False
    assert health["provider"] == "FASHN demo"
