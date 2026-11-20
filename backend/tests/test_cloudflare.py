import base64
import io
from email.parser import BytesParser
from email.policy import default

import httpx
import pytest
from app.config import Settings
from app.provider import CloudflareClient, ProviderError
from PIL import Image
from test_core import photo
from test_gemini import transport


@pytest.mark.parametrize("personal", [False, True])
def test_cloudflare_reference_multipart_and_output(monkeypatch, personal):
    def handle(request):
        assert request.url.host == "api.cloudflare.com"
        assert request.url.path.endswith("/ai/run/" + CloudflareClient.MODEL)
        assert request.headers["authorization"] == "Bearer private-test-token"
        message = BytesParser(policy=default).parsebytes(
            ("Content-Type: " + request.headers["content-type"] + "\r\n\r\n").encode()
            + request.content
        )
        fields = {
            part.get_param("name", header="content-disposition"): part.get_payload(
                decode=True
            )
            for part in message.iter_parts()
        }
        assert ("input_image_1" in fields) is personal
        assert fields["width"] == b"768" and fields["height"] == b"1024"
        for index in range(2 if personal else 1):
            with Image.open(io.BytesIO(fields[f"input_image_{index}"])) as image:
                assert max(image.size) == 511 and image.mode == "RGB"
        if personal:
            assert b"person in image 1" in fields["prompt"]
        return httpx.Response(
            200,
            json={
                "success": True,
                "result": {"image": base64.b64encode(photo()).decode()},
            },
        )

    transport(monkeypatch, handle)
    uri = "data:image/png;base64," + base64.b64encode(photo()).decode()
    inputs = {"product_image": uri}
    if personal:
        inputs["model_image"] = uri
    assert CloudflareClient("a" * 32, "private-test-token").generate(inputs) == photo()


@pytest.mark.parametrize(
    "status,body,code,ambiguous",
    [
        (403, {}, "cloudflare_rejected", False),
        (429, {}, "cloudflare_rejected", False),
        (503, {}, "cloudflare_rejected", True),
        (200, {"success": False}, "cloudflare_failed", False),
        (200, {"result": {}}, "cloudflare_no_image", False),
        (200, {"result": {"image": "!bad!"}}, "cloudflare_uncertain", True),
    ],
)
def test_cloudflare_failure_never_retries(monkeypatch, status, body, code, ambiguous):
    calls = []

    def handle(request):
        calls.append(request)
        return httpx.Response(status, json=body)

    transport(monkeypatch, handle)
    with pytest.raises(ProviderError) as error:
        CloudflareClient("a" * 32, "private-test-token").generate(
            {
                "product_image": "data:image/png;base64,"
                + base64.b64encode(photo()).decode()
            }
        )
    assert error.value.code == code and error.value.ambiguous == ambiguous
    assert len(calls) == 1 and "private-test-token" not in str(error.value)


def test_partial_cloudflare_credentials_disable_generation_without_fallback():
    settings = Settings(
        _env_file=None, cloudflare_account_id="a" * 32, gemini_api_key="test-key"
    )
    assert (
        settings.provider_name == "Cloudflare" and settings.provider_configured is False
    )
    settings.cloudflare_api_token = "test-token"
    assert settings.provider_configured is True


def test_invalid_cloudflare_account_id_does_not_make_request(monkeypatch):
    transport(
        monkeypatch, lambda request: pytest.fail("Must not send a malformed account ID")
    )
    with pytest.raises(ProviderError, match="Account ID"):
        CloudflareClient("../invalid", "private-test-token").generate({})
