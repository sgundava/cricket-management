"""Application configuration using pydantic-settings."""

from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # API
    api_v1_prefix: str = "/api/v1"
    debug: bool = True

    # CORS
    cors_origins: List[str] = [
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ]

    # Paths
    base_dir: Path = Path(__file__).parent.parent
    config_dir: Path = base_dir / "config"
    probability_params_path: Path = config_dir / "probability_params.yaml"
    event_templates_dir: Path = config_dir / "event_templates"

    # Match engine
    event_trigger_chance: float = 0.35  # 35% chance to trigger event after match

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
