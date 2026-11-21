import importlib.util
import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

SERVICE = Path(__file__).resolve().parents[2] / "ai-services/gpu_server.py"
spec = importlib.util.spec_from_file_location("gpu_contract", SERVICE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
TOKEN = "contract-test-token-of-at-least-24-characters"


def image(color):
    result = io.BytesIO()
    Image.new("RGB", (600, 900), color).save(result, "PNG")
    return result.getvalue()


def test_gpu_endpoint_auth_input_order_and_inference_replay():
    calls = []

    def predict(person, garment, category):
        calls.append((person.getpixel((0, 0)), garment.getpixel((0, 0)), category))
        return person

    app = module.create_app(predict, TOKEN, gpu_ready=False)
    with TestClient(app) as client:
        assert client.get("/health").json() == {
            "status": "running",
            "gpu_ready": False,
            "engine": "contract-test",
        }
        files = {
            "person_image": ("person.png", image("red")),
            "garment_image": ("garment.png", image("blue")),
        }
        assert client.post("/try-on", files=files).status_code == 401
        headers = {
            "Authorization": "Bearer " + TOKEN,
            "X-Request-ID": "same-request-123",
        }
        first = client.post(
            "/try-on", files=files, headers=headers, data={"category": "shirt"}
        )
        assert first.status_code == 200 and first.json()["image_base64"]
        assert (
            client.post(
                "/try-on", files=files, headers=headers, data={"category": "shirt"}
            ).json()
            == first.json()
        )
        assert calls == [((255, 0, 0), (0, 0, 255), "shirt")]
        assert (
            client.post(
                "/try-on", files=files, headers=headers, data={"category": "dress"}
            ).status_code
            == 409
        )
        assert (
            client.post(
                "/try-on", files=files, headers=headers, data={"category": "watch"}
            ).status_code
            == 422
        )


def test_completed_request_is_not_recomputed_after_output_cache_eviction():
    calls = []

    def predict(person, garment, category):
        calls.append(category)
        return person

    files = {
        "person_image": ("person.png", image("red")),
        "garment_image": ("garment.png", image("blue")),
    }
    with TestClient(module.create_app(predict, TOKEN, gpu_ready=False)) as client:
        for index in range(3):
            assert (
                client.post(
                    "/try-on",
                    files=files,
                    headers={
                        "Authorization": "Bearer " + TOKEN,
                        "X-Request-ID": f"another-request-{index}",
                    },
                ).status_code
                == 200
            )
        assert (
            client.post(
                "/try-on",
                files=files,
                headers={
                    "Authorization": "Bearer " + TOKEN,
                    "X-Request-ID": "another-request-0",
                },
            ).status_code
            == 410
        )
        assert len(calls) == 3


def test_gpu_decode_error_does_not_execute_model():
    def predict(*args):
        pytest.fail("Invalid image must not reach CUDA")

    with TestClient(module.create_app(predict, TOKEN, gpu_ready=False)) as client:
        result = client.post(
            "/try-on",
            files={
                "person_image": ("bad.png", b"not an image"),
                "garment_image": ("garment.png", image("blue")),
            },
            headers={
                "Authorization": "Bearer " + TOKEN,
                "X-Request-ID": "invalid-image-123",
            },
        )
        assert result.status_code == 422
