from functools import lru_cache

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


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

