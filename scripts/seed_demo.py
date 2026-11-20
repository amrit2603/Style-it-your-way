"""Seed original AI-created sample garments into the separate demo database."""

import json
import sys
import uuid
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.assets import save_image
from app.config import Settings, now
from app.db import Database

SAMPLES = [
    (
        "emerald-saree.png",
        "DEMO-S01",
        "Emerald silk saree",
        "saree",
        "An AI-created emerald saree with an antique gold border. Fictional demonstration garment; not merchandise for sale.",
    ),
    (
        "rose-saree.png",
        "DEMO-S02",
        "Rose silk saree",
        "saree",
        "An AI-created rose saree with a delicate woven border. Fictional demonstration garment; not merchandise for sale.",
    ),
    (
        "ivory-suit.png",
        "DEMO-S03",
        "Ivory embroidered suit",
        "suit",
        "An AI-created ivory tunic, trousers and dupatta. Fictional demonstration garment; not merchandise for sale.",
    ),
    (
        "burgundy-suit.png",
        "DEMO-S04",
        "Burgundy Anarkali suit",
        "suit",
        "An AI-created burgundy Anarkali suit with embroidered details. Fictional demonstration garment; not merchandise for sale.",
    ),
]


def seed(database):
    for filename, sku, name, category, description in SAMPLES:
        path = ROOT / "demo" / filename
        if not path.is_file():
            continue
        with database.connect() as db:
            if db.execute("SELECT 1 FROM products WHERE sku=?", (sku,)).fetchone():
                continue
        product_id = str(uuid.uuid4())
        with Image.open(path) as source:
            original = source.convert("RGB")
        original_id = save_image(
            database,
            original,
            "demo-catalog",
            "original",
            product_id,
            source={"fixture": True, "origin": filename},
        )
        generated = original.copy()
        draw = ImageDraw.Draw(generated)
        height = max(65, generated.height // 24)
        draw.rectangle(
            (0, generated.height - height, generated.width, generated.height),
            fill="#254535",
        )
        draw.text(
            (18, generated.height - height + 15),
            "AI DEMONSTRATION GARMENT",
            fill="white",
            font_size=max(22, height // 2),
        )
        generated_id = save_image(
            database,
            generated,
            "demo-catalog",
            "generated",
            product_id,
            source={"fixture": True, "version": 1, "origin": filename},
        )
        images = [
            {
                "id": generated_id,
                "kind": "generated",
                "role": "main",
                "approved": True,
                "public": True,
            },
            {
                "id": original_id,
                "kind": "original",
                "role": "main",
                "approved": False,
                "public": True,
            },
        ]
        product = {
            "id": product_id,
            "version": 1,
            "sku": sku,
            "name": name,
            "category": category,
            "description": description,
            "price_minor": None,
            "currency": "INR",
            "sizes": "Demonstration garment",
            "reference_id": original_id,
            "images": images,
            "published": True,
            "fixture": True,
        }
        with database.connect(write=True) as db:
            db.execute(
                "INSERT INTO products VALUES (?,?,?,?,?)",
                (product_id, sku, json.dumps(product), json.dumps(product), now()),
            )
        print(f"Seeded: {name}")


if __name__ == "__main__":
    settings = Settings()
    if not settings.fixture:
        raise SystemExit(
            "Demo seeding requires VYUMI_GENERATION_MODE=fixture. Live catalogs are not modified."
        )
    seed(Database(settings.data_dir))
