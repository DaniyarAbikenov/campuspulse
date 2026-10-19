from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CAMPUSPULSE_", env_file=".env", extra="ignore")

    agent_model: str = "gemini-2.5-flash"
    backend_url: str = "http://127.0.0.1:8000/api/v1"
    moodle_mcp_url: str | None = None
    moodle_mcp_token: SecretStr | None = None
    request_timeout_seconds: float = 20.0


def get_settings() -> Settings:
    return Settings()
