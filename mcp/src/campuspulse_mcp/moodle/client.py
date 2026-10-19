from collections.abc import Mapping
from typing import Any
from urllib.parse import urlsplit

import httpx

REST_PATH = "/webservice/rest/server.php"


class MoodleError(RuntimeError):
    """Raised for Moodle web-service errors and unsafe requests."""

    def __init__(self, message: str, code: str | None = None) -> None:
        super().__init__(message)
        self.code = code


def flatten_params(value: Any, prefix: str = "") -> dict[str, str]:
    """Encode nested lists/dicts the way Moodle expects: ``courseids[0]=1``."""
    if isinstance(value, Mapping):
        out: dict[str, str] = {}
        for key, item in value.items():
            out.update(flatten_params(item, f"{prefix}[{key}]" if prefix else str(key)))
        return out
    if isinstance(value, list | tuple):
        out = {}
        for index, item in enumerate(value):
            out.update(flatten_params(item, f"{prefix}[{index}]"))
        return out
    if isinstance(value, bool):
        return {prefix: "1" if value else "0"}
    return {prefix: str(value)}


class MoodleClient:
    def __init__(
        self,
        base_url: str,
        token: str,
        *,
        timeout: float = 20.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._token = token
        self._http = httpx.AsyncClient(timeout=timeout, transport=transport, follow_redirects=False)

    async def aclose(self) -> None:
        await self._http.aclose()

    async def call(self, function: str, **params: Any) -> Any:
        data = {
            "wstoken": self._token,
            "wsfunction": function,
            "moodlewsrestformat": "json",
            **flatten_params(params),
        }
        try:
            response = await self._http.post(f"{self._base_url}{REST_PATH}", data=data)
            response.raise_for_status()
        except httpx.HTTPError as error:
            raise MoodleError(f"Moodle is unreachable: {type(error).__name__}") from error
        body = response.json()
        if isinstance(body, dict) and "exception" in body:
            raise MoodleError(str(body.get("message", "Moodle error")), body.get("errorcode"))
        return body

    async def download(self, file_url: str, max_bytes: int) -> tuple[bytes, bool]:
        """Fetch a Moodle file, never sending the token to another host."""
        if urlsplit(file_url).netloc != urlsplit(self._base_url).netloc:
            raise MoodleError("Refusing to download a file outside the configured Moodle site")
        chunks: list[bytes] = []
        size = 0
        try:
            async with self._http.stream("GET", file_url, params={"token": self._token}) as reply:
                reply.raise_for_status()
                async for chunk in reply.aiter_bytes():
                    size += len(chunk)
                    if size > max_bytes:
                        chunks.append(chunk[: len(chunk) - (size - max_bytes)])
                        return b"".join(chunks), True
                    chunks.append(chunk)
        except httpx.HTTPError as error:
            raise MoodleError(f"File download failed: {type(error).__name__}") from error
        return b"".join(chunks), False
