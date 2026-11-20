"""Isolated fixture backend used by the browser acceptance suite."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "scripts"))
import uvicorn
from app.config import Settings
from app.db import Database
from seed_demo import seed

if __name__ == "__main__":
    settings = Settings()
    if not settings.fixture:
        raise SystemExit("The browser test server requires explicit fixture mode.")
    seed(Database(settings.data_dir))
    uvicorn.run("app.main:app", host="127.0.0.1", port=8001, log_level="warning")
