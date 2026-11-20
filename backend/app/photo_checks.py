"""Conservative local photo checks; heuristics do not establish age or exact pose."""

import threading
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

MODELS = Path(__file__).resolve().parents[2] / "models"
LOCK = threading.Lock()


def validator_ready():
    return all(
        (MODELS / name).is_file()
        for name in ("efficientdet_lite0.tflite", "pose_landmarker_lite.task")
    )


@lru_cache(maxsize=1)
def _detectors():
    import mediapipe as mp
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision

    detector = vision.ObjectDetector.create_from_options(
        vision.ObjectDetectorOptions(
            base_options=python.BaseOptions(
                model_asset_path=str(MODELS / "efficientdet_lite0.tflite")
            ),
            running_mode=vision.RunningMode.IMAGE,
            score_threshold=0.3,
            category_allowlist=["person"],
        )
    )
    pose = vision.PoseLandmarker.create_from_options(
        vision.PoseLandmarkerOptions(
            base_options=python.BaseOptions(
                model_asset_path=str(MODELS / "pose_landmarker_lite.task")
            ),
            running_mode=vision.RunningMode.IMAGE,
            num_poses=2,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
        )
    )
    return mp, detector, pose


def _infer(image):
    with LOCK:
        mp, detector, pose = _detectors()
        frame = mp.Image(
            image_format=mp.ImageFormat.SRGB, data=np.asarray(image, dtype=np.uint8)
        )
        return detector.detect(frame).detections, pose.detect(frame).pose_landmarks


def check_person(image: Image.Image) -> dict:
    def rejected(code, message):
        return {"accepted": False, "code": code, "message": message}

    if not validator_ready():
        return rejected(
            "validator_not_ready",
            "Photo validation is not set up. Run the local model downloader before trying a personal photo.",
        )
    gray = np.asarray(image.convert("L").resize((256, 256)), dtype=np.float32)
    if gray.mean() < 35 or gray.mean() > 235:
        return rejected(
            "photo_lighting",
            "Use even daylight or bright indoor light. Avoid very dark or overexposed photos.",
        )
    edges = np.asarray(
        image.convert("L").resize((256, 256)).filter(ImageFilter.FIND_EDGES),
        dtype=np.float32,
    )[2:-2, 2:-2]
    if edges.var() < 18:
        return rejected(
            "photo_blurred",
            "This photo does not show enough detail. Upload a sharper photo with your body visible.",
        )
    resized = image.copy()
    resized.thumbnail((1280, 1280))
    try:
        people, poses = _infer(resized)
    except Exception:
        return rejected(
            "validator_unavailable",
            "Photo validation could not run. Check local model setup and try again.",
        )
    if len(people) != 1:
        return rejected(
            "photo_people", "Upload a clear photo with exactly one person in the frame."
        )
    if len(poses) != 1:
        return rejected(
            "photo_pose",
            "Use a clear front-facing or slight-angle photo with your shoulders and hips visible.",
        )
    landmarks = poses[0]
    if any(
        min(landmarks[index].visibility, landmarks[index].presence) < 0.6
        or not 0.02 < landmarks[index].x < 0.98
        or not 0.02 < landmarks[index].y < 0.98
        for index in (0, 2, 5)
    ):
        return rejected(
            "photo_face",
            "Keep your whole face visible and face the camera, without a face covering or heavy shadow.",
        )
    region = [landmarks[index] for index in (11, 12, 23, 24)]
    if any(
        min(point.visibility, point.presence) < 0.6
        or not 0.02 < point.x < 0.98
        or not 0.02 < point.y < 0.98
        for point in region
    ):
        return rejected(
            "photo_framing",
            "Show your shoulders and hips clearly; for a saree or full suit include your full body.",
        )
    left, right, left_hip, right_hip = region
    if (
        abs(left.x - right.x) < 0.08
        or abs(left.z - right.z) > 0.35
        or abs(left_hip.z - right_hip.z) > 0.4
    ):
        return rejected(
            "photo_angle",
            "Face the camera or turn only slightly, keeping both shoulders visible.",
        )
    if max(left_hip.y, right_hip.y) - min(left.y, right.y) < 0.12:
        return rejected(
            "photo_framing",
            "Upload a photo showing more of your body, rather than a close-up selfie.",
        )
    return {
        "accepted": True,
        "code": "photo_ready",
        "message": "Photo checks passed. The result will be an approximate visual preview, not a fit measurement.",
    }
