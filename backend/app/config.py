from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT / "backend" / ".env", env_prefix="VYUMI_", extra="ignore"
    )
    data_dir: Path = ROOT / "data"
    merchant_token: str = ""
    fashn_api_key: str = ""
    generation_allowance: int = Field(default=0, ge=0, le=1000)
    generation_mode: str = "live"
    start_worker: bool = True
    worker_interval: float = 2.0
    allowed_origins: list[str] = [
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "http://127.0.0.1:8000",
        "http://localhost:8000",
    ]

    @property
    def fixture(self):
        return self.generation_mode == "fixture"


def now():
    import time

    return int(time.time())
