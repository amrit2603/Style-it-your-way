from types import SimpleNamespace

import numpy as np
import pytest
from app import photo_checks
from PIL import Image


def detailed_photo():
    rng = np.random.default_rng(42)
    return Image.fromarray(rng.integers(50, 210, (700, 600, 3), dtype=np.uint8))


def pose():
    landmarks = [
        SimpleNamespace(x=0.5, y=0.5, z=0, visibility=0.95, presence=0.95)
        for _ in range(33)
    ]
    for i, x, y in [(11, 0.35, 0.2), (12, 0.65, 0.2), (23, 0.4, 0.65), (24, 0.6, 0.65)]:
        landmarks[i] = SimpleNamespace(x=x, y=y, z=0, visibility=0.95, presence=0.95)
    return landmarks


def test_missing_models_fail_closed(monkeypatch):
    monkeypatch.setattr(photo_checks, "validator_ready", lambda: False)
    assert photo_checks.check_person(detailed_photo())["code"] == "validator_not_ready"


@pytest.mark.parametrize(
    "people,poses,code",
    [
        (0, 1, "photo_people"),
        (2, 1, "photo_people"),
        (1, 0, "photo_pose"),
        (1, 2, "photo_pose"),
    ],
)
def test_person_and_pose_count(monkeypatch, people, poses, code):
    monkeypatch.setattr(photo_checks, "validator_ready", lambda: True)
    monkeypatch.setattr(
        photo_checks, "_infer", lambda image: ([object()] * people, [pose()] * poses)
    )
    assert photo_checks.check_person(detailed_photo())["code"] == code


def test_uncertain_body_region_rejected(monkeypatch):
    points = pose()
    points[23].visibility = 0.2
    monkeypatch.setattr(photo_checks, "validator_ready", lambda: True)
    monkeypatch.setattr(photo_checks, "_infer", lambda image: ([object()], [points]))
    assert photo_checks.check_person(detailed_photo())["code"] == "photo_framing"


def test_accepted_body_frame(monkeypatch):
    monkeypatch.setattr(photo_checks, "validator_ready", lambda: True)
    monkeypatch.setattr(photo_checks, "_infer", lambda image: ([object()], [pose()]))
    assert photo_checks.check_person(detailed_photo())["accepted"] is True


@pytest.mark.parametrize(
    "color,code",
    [(0, "photo_lighting"), (255, "photo_lighting"), (128, "photo_blurred")],
)
def test_bad_lighting_and_blur(monkeypatch, color, code):
    monkeypatch.setattr(photo_checks, "validator_ready", lambda: True)
    assert (
        photo_checks.check_person(Image.new("RGB", (600, 900), (color,) * 3))["code"]
        == code
    )
