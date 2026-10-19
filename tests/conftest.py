from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.db.models import Base
from app.db.session import get_session
from app.main import app
from app.seeds import seed_database


@pytest.fixture
def student(monkeypatch: pytest.MonkeyPatch) -> Generator[TestClient, None, None]:
    monkeypatch.setattr(
        settings, "jwt_secret", SecretStr("test-secret-that-is-long-and-random-enough")
    )
    monkeypatch.setattr(settings, "enable_demo_auth", True)
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    Base.metadata.create_all(bind=engine)
    with factory() as session:
        seed_database(session)

    def override_session() -> Generator[Session, None, None]:
        with factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    with TestClient(app) as client:
        token = client.post("/api/v1/auth/demo").json()["access_token"]
        client.headers["Authorization"] = f"Bearer {token}"
        yield client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
