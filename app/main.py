from fastapi import FastAPI

from app.api.router import router
from app.core.config import settings

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    summary="Typed CRUD API for the CampusPulse academic domain",
)
app.include_router(router, prefix=settings.api_v1_prefix)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}
