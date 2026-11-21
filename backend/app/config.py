from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT / "backend" / ".env", env_prefix="VYUMI_", extra="ignore"
    )
    data_dir: Path = ROOT / "data"
    merchant_token: str = ""
    admin_email: str = ""
    admin_password: str = ""
    kaggle_api_url: str = ""
    kaggle_api_token: str = ""
    room_provider: Literal["primary", "composite"] = "primary"
    fashn_api_key: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.1-flash-image"
    cloudflare_account_id: str = ""
    cloudflare_api_token: str = ""
    cloudflare_model: str = "@cf/black-forest-labs/flux-2-klein-9b"
    tryon_provider: Literal["primary", "fashn_demo", "fashn", "kaggle"] = "primary"
    generation_allowance: int = Field(default=0, ge=0, le=1000)
    generation_mode: str = "live"
    start_worker: bool = True
    worker_interval: float = 2.0
    allowed_origins: list[str] = [
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "http://127.0.0.1:8000",
        "http://localhost:8000",
        "http://127.0.0.1:3002",
        "http://localhost:3002",
        "http://127.0.0.1:3003",
        "http://localhost:3003",
    ]

    @property
    def fixture(self):
        return self.generation_mode == "fixture"

    @property
    def provider_configured(self):
        if self.provider_name == "Cloudflare":
            return bool(self.cloudflare_account_id and self.cloudflare_api_token)
        return bool(self.gemini_api_key or self.fashn_api_key)

    @property
    def provider_name(self):
        if self.cloudflare_account_id or self.cloudflare_api_token:
            return "Cloudflare"
        return "Gemini" if self.gemini_api_key else "FASHN"

    @property
    def tryon_name(self):
        return {"fashn_demo": "FASHN demo", "fashn": "FASHN", "kaggle": "Kaggle"}.get(
            self.tryon_provider, self.provider_name
        )

    @property
    def tryon_configured(self):
        if self.tryon_provider == "kaggle":
            return bool(self.kaggle_api_url and self.kaggle_api_token)
        if self.tryon_provider == "fashn_demo":
            return True
        return (
            bool(self.fashn_api_key)
            if self.tryon_provider == "fashn"
            else self.provider_configured
        )


def now():
    import time

    return int(time.time())
