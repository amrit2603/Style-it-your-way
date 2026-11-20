"""Download official MediaPipe checkpoints for local photo quality validation."""

import hashlib
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    "blaze_face_short_range.tflite": "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
    "efficientdet_lite0.tflite": "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite",
    "pose_landmarker_lite.task": "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
}


def main():
    folder = ROOT / "models"
    folder.mkdir(exist_ok=True)
    records = {}
    for name, url in SOURCES.items():
        path = folder / name
        if not path.is_file():
            temporary = path.with_suffix(".download")
            try:
                with urllib.request.urlopen(url, timeout=60) as response:
                    content = response.read(25 * 1024 * 1024 + 1)
                if len(content) > 25 * 1024 * 1024 or len(content) < 100_000:
                    raise ValueError("Unexpected model download size")
                temporary.write_bytes(content)
                temporary.replace(path)
            finally:
                temporary.unlink(missing_ok=True)
        records[name] = {
            "source": url,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "bytes": path.stat().st_size,
        }
        print(f"Ready: {name}")
    (folder / "manifest.json").write_text(
        json.dumps(records, indent=2), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
