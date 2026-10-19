from typing import Literal

from pydantic import AnyHttpUrl, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CAMPUSPULSE_", env_file=".env", extra="ignore")

    moodle_url: AnyHttpUrl
    moodle_token: SecretStr
    moodle_timeout_seconds: float = 20.0
    max_file_bytes: int = 2_000_000
    mcp_transport: Literal["stdio", "streamable-http"] = "stdio"
    mcp_host: str = "127.0.0.1"
    mcp_port: int = 8001
    backend_url: AnyHttpUrl = AnyHttpUrl("http://127.0.0.1:8000/api/v1")
    backend_token: SecretStr | None = None
    backend_demo_login: bool = False
