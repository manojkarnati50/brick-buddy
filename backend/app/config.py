"""Environment configuration. Secrets stay on the server; nothing here is sent to the browser."""
from __future__ import annotations

import os
import secrets
from dataclasses import dataclass, field
from pathlib import Path


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


@dataclass
class Settings:
    anthropic_api_key: str = field(default_factory=lambda: _env("ANTHROPIC_API_KEY"))
    # Needed only for API keys that are not scoped to a workspace (sent as the anthropic-workspace-id header)
    anthropic_workspace_id: str = field(default_factory=lambda: _env("ANTHROPIC_WORKSPACE_ID"))
    sarvam_api_key: str = field(default_factory=lambda: _env("SARVAM_API_KEY"))
    data_dir: Path = field(default_factory=lambda: Path(_env("BRICK_DATA_DIR", str(Path(__file__).resolve().parents[1] / "data"))))
    nova_dir: Path | None = field(default_factory=lambda: Path(_env("LDRAW_NOVA_DIR")) if _env("LDRAW_NOVA_DIR") else None)
    default_pin: str = field(default_factory=lambda: _env("PARENT_PIN", "1234"))
    secret_key: str = field(default_factory=lambda: _env("APP_SECRET") or "")
    model_quick: str = field(default_factory=lambda: _env("MODEL_QUICK", "claude-haiku-5-5"))
    model_inventory: str = field(default_factory=lambda: _env("MODEL_INVENTORY", "claude-sonnet-5-5"))
    model_big: str = field(default_factory=lambda: _env("MODEL_BIG", "claude-opus-5-5"))
    usd_to_inr: float = field(default_factory=lambda: float(_env("USD_TO_INR", "84")))
    cors_origins: str = field(default_factory=lambda: _env("CORS_ORIGINS", "*"))

    @property
    def db_path(self) -> Path:
        return self.data_dir / "brickbuddy.db"

    @property
    def models_dir(self) -> Path:
        return self.data_dir / "models"

    @property
    def thumbs_dir(self) -> Path:
        return self.data_dir / "thumbs"

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"  # real photos of builds + audio

    @property
    def private_dir(self) -> Path:
        return self.data_dir / "private"  # photos of Aaradya / custom avatar art. Never exported by default.

    def ensure_dirs(self) -> None:
        for d in (self.data_dir, self.models_dir, self.thumbs_dir, self.uploads_dir, self.private_dir,
                  self.private_dir / "avatar", self.data_dir / "cache", self.data_dir / "stl"):
            d.mkdir(parents=True, exist_ok=True)
        if not self.secret_key:
            key_file = self.data_dir / ".secret"
            if not key_file.exists():
                key_file.write_text(secrets.token_hex(32))
            self.secret_key = key_file.read_text().strip()


settings = Settings()
settings.ensure_dirs()

# USD per million tokens (input, output). Kept in one place so the cost meter is easy to update.
PRICING = {
    "claude-haiku-5-5": (0.10, 0.50),
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-opus-5-5": (4.00, 20.00),
}
