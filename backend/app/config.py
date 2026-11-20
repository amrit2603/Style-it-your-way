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
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.1-flash-image"
    cloudflare_account_id: str = ""
    cloudflare_api_token: str = ""
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


def now():
    import time

    return int(time.time())
