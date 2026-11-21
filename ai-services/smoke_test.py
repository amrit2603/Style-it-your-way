"""Exercise the real CUDA model and private API before requesting any user secrets."""

import base64
import json
import os
import time
from pathlib import Path

from fastapi.testclient import TestClient

from gpu_server import create_app
from idmvton_runner import IDMRunner


def main():
    project = Path(__file__).resolve().parents[1]
    runner = IDMRunner(os.environ["VYUMI_IDM_SOURCE"], os.environ["VYUMI_IDM_MODEL"])
    calls = []

    def predict(person, garment, category):
        calls.append(category)
        return runner(person, garment, category)

    # This dummy credential exists only inside TestClient; no socket or tunnel opens.
    token = "in-process-test-only-not-a-live-token"
    files = {
        "person_image": ("person.png", (project / "demo/ivory-suit.png").read_bytes()),
        "garment_image": (
            "garment.png",
            (project / "demo/emerald-saree.png").read_bytes(),
        ),
    }
    with TestClient(create_app(predict, token)) as client:
        assert client.get("/health").json()["gpu_ready"] is True
        assert client.post("/try-on").status_code == 401
        headers = {"Authorization": "Bearer " + token, "X-Request-ID": "cuda-self-test"}
        started = time.monotonic()
        response = client.post(
            "/try-on", headers=headers, files=files, data={"category": "saree"}
        )
        response.raise_for_status()
        elapsed = round(time.monotonic() - started, 1)
        replay = client.post(
            "/try-on", headers=headers, files=files, data={"category": "saree"}
        )
        assert replay.status_code == 200 and replay.json() == response.json()
        assert calls == ["saree"], "Replay must not generate a second image"
        Path(os.environ["VYUMI_SMOKE_RESULT"]).write_bytes(
            base64.b64decode(response.json()["image_base64"], validate=True)
        )
    print(
        json.dumps(
            {
                "engine": "IDM-VTON",
                "seconds": elapsed,
                "authenticated_api": True,
                "replay_calls": len(calls),
            }
        )
    )


if __name__ == "__main__":
    main()
