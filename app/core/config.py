from functools import lru_cache
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="CAMPUSPULSE_",
        extra="ignore",
    )

    app_name: str = "CampusPulse API"
    api_v1_prefix: str = "/api/v1"
    database_url: str = "sqlite:///./campuspulse.db"
    google_client_id: str | None = None
    jwt_secret: SecretStr | None = None
    jwt_issuer: str = "campuspulse-api"
    jwt_audience: str = "campuspulse-web"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30
    upload_directory: str = "storage/uploads"
    max_upload_bytes: int = 20 * 1024 * 1024
    enable_demo_auth: bool = False
    demo_user_email: str = "demo.student@campuspulse.example"
    # Agent: "disabled", "vertex" (Vertex AI Agent Engine) or "adk_server" (local `adk api_server`).
    agent_mode: Literal["disabled", "vertex", "adk_server"] = "disabled"
    agent_resource: str | None = None
    agent_project: str | None = None
    agent_location: str = "us-central1"
    agent_adk_url: str = "http://127.0.0.1:8002"
    agent_adk_app: str = "campuspulse"
    agent_token_ttl_minutes: int = 60
    agent_timeout_seconds: float = 120.0
    # Administrators only see aggregates over at least this many distinct students.
    admin_min_cohort_size: int = 5
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
