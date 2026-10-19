from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.documents import embeddings
from app.documents.embeddings import EmbeddingError

API = "/api/v1"
CONCEPTS = [
    {"login", "authentication", "token", "jwt", "signin"},
    {"index", "query", "optimization", "database"},
    {"network", "subnet", "router"},
]


class FakeEmbedder:
    """Maps words of the same topic onto one axis, so meaning (not spelling) decides."""

    model = "fake-embedding"

    def _vector(self, text: str) -> list[float]:
        words = {w.strip(".,;:!?").lower() for w in text.split()}
        return [float(len(words & topic)) for topic in CONCEPTS] + [0.01]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._vector(text) for text in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._vector(text)


class BrokenEmbedder(FakeEmbedder):
    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        raise EmbeddingError("down")

    def embed_query(self, text: str) -> list[float]:
        raise EmbeddingError("down")


@pytest.fixture
def semantic(monkeypatch: pytest.MonkeyPatch) -> FakeEmbedder:
    fake = FakeEmbedder()
    monkeypatch.setattr(embeddings, "get_embedder", lambda: fake)
    return fake


@pytest.fixture
def uploads(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    monkeypatch.setattr(settings, "upload_directory", str(tmp_path))
    return tmp_path


def course_id(client: TestClient) -> str:
    return str(client.get(f"{API}/courses").json()[0]["id"])


def add_lecture(client: TestClient, name: str, text: str) -> dict[str, Any]:
    created = client.post(
        f"{API}/materials",
        data={"course_id": course_id(client), "kind": "lecture", "name": name},
        files={"file": (f"{name}.txt", text.encode(), "text/plain")},
    )
    assert created.status_code == 201, created.text
    return dict(created.json())


AUTH_LECTURE = "Token based authentication. A jwt token proves who the user is after login."
DB_LECTURE = "Query optimization. An index speeds up database queries."


def test_search_finds_a_passage_by_meaning_not_spelling(
    student: TestClient, uploads: Path, semantic: FakeEmbedder
) -> None:
    add_lecture(student, "Lecture 6", AUTH_LECTURE)
    add_lecture(student, "Lecture 8", DB_LECTURE)
    hits = student.get(f"{API}/knowledge/search", params={"q": "how does signin work"}).json()
    assert [hit["document_name"] for hit in hits][:1] == ["Lecture 6"]
    assert hits[0]["page"] == 1 and "jwt" in hits[0]["excerpt"]
    assert all(hit["document_name"] != "Lecture 8" for hit in hits)


def test_without_embeddings_search_falls_back_to_words(student: TestClient, uploads: Path) -> None:
    add_lecture(student, "Lecture 6", AUTH_LECTURE)
    miss = student.get(f"{API}/knowledge/search", params={"q": "signin"}).json()
    assert miss == []  # no shared word, no vectors: honest silence
    hit = student.get(f"{API}/knowledge/search", params={"q": "jwt token authentication"}).json()
    assert hit and hit[0]["document_name"] == "Lecture 6"


def test_a_failing_embedding_service_never_blocks_an_upload(
    student: TestClient, uploads: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(embeddings, "get_embedder", lambda: BrokenEmbedder())
    add_lecture(student, "Lecture 6", AUTH_LECTURE)
    assert student.get(f"{API}/knowledge/search", params={"q": "jwt token"}).json()


def test_reindex_builds_chunks_for_documents_that_have_none(
    student: TestClient, semantic: FakeEmbedder
) -> None:
    first = student.post(f"{API}/knowledge/reindex").json()
    assert first["indexed_documents"] >= 1 and first["semantic"] is True
    assert student.post(f"{API}/knowledge/reindex").json()["indexed_documents"] == 0
    forced = student.post(f"{API}/knowledge/reindex", params={"force": "true"}).json()
    assert forced["indexed_documents"] == first["indexed_documents"]


def test_search_validates_its_input(student: TestClient) -> None:
    assert student.get(f"{API}/knowledge/search", params={"q": "x"}).status_code == 422
    student.headers.pop("Authorization")
    assert student.get(f"{API}/knowledge/search", params={"q": "jwt token"}).status_code == 401


def test_plan_items_carry_study_material_from_lectures_not_from_the_brief(
    student: TestClient, uploads: Path, semantic: FakeEmbedder
) -> None:
    add_lecture(student, "Lecture 6", AUTH_LECTURE)
    add_lecture(student, "Lecture 8", DB_LECTURE)
    brief = student.post(
        f"{API}/assignments/upload",
        data={
            "course_id": course_id(student),
            "title": "Auth lab",
            "due_at": (datetime.now(UTC) + timedelta(days=6)).isoformat(),
        },
        files={
            "file": (
                "brief.txt",
                b"R1 Implement login with a jwt token and authentication.",
                "text/plain",
            )
        },
    ).json()
    assignment = brief["assignment"]["id"]
    plan = student.post(
        f"{API}/task-plans",
        json={
            "assignment_id": assignment,
            "summary": "One requirement.",
            "items": [
                {
                    "requirement_id": "R1",
                    "requirement_text": "Implement login with a jwt token.",
                    "quote": "Implement login with a jwt token",
                    "page": 1,
                    "title": "Build the login flow",
                    "estimated_hours": 2.0,
                }
            ],
        },
    ).json()
    resources = plan["items"][0]["resources"]
    assert [r["document_name"] for r in resources] == ["Lecture 6"]  # not the brief, not Lecture 8
    assert resources[0]["page"] == 1 and "jwt" in resources[0]["excerpt"]

    student.post(f"{API}/task-plans/{plan['id']}/apply")
    tasks = [
        t
        for t in student.get(f"{API}/tasks", params={"limit": 200}).json()
        if t["assignment_id"] == assignment
    ]
    assert tasks[0]["resources"][0]["document_name"] == "Lecture 6"
    board = student.get(f"{API}/kanban").json()["columns"]
    on_board = [t for c in board for t in c["tasks"] if t["id"] == tasks[0]["id"]]
    assert on_board[0]["resources"][0]["document_name"] == "Lecture 6"


def test_tasks_without_material_have_an_empty_list(student: TestClient) -> None:
    tasks = student.get(f"{API}/tasks", params={"limit": 5}).json()
    assert tasks and all(t["resources"] == [] for t in tasks)
