from functools import lru_cache

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
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
