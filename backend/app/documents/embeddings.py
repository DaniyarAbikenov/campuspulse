"""Text embeddings for semantic search (Vertex AI, over its REST API) and helpers."""

import logging
import math
import re
from functools import lru_cache
from typing import Protocol

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

CHUNK_WORDS = 150
CHUNK_OVERLAP = 25
MAX_CHUNKS_PER_DOCUMENT = 400
BATCH_SIZE = 16


class Embedder(Protocol):
    model: str

    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...

    def embed_query(self, text: str) -> list[float]: ...


class EmbeddingError(RuntimeError):
    """The embedding service could not be reached or returned something unusable."""


class VertexEmbedder:
    """`text-embedding-005` through the Vertex AI predict endpoint, using the service's own
    Google credentials (no keys are stored)."""

    def __init__(self, project: str, location: str, model: str) -> None:
        self.model = model
        self._url = (
            f"https://{location}-aiplatform.googleapis.com/v1/projects/{project}"
            f"/locations/{location}/publishers/google/models/{model}:predict"
        )
        self._credentials: object | None = None

    def _token(self) -> str:
        import google.auth
        from google.auth.transport.requests import Request

        if self._credentials is None:
            self._credentials, _ = google.auth.default(
                scopes=["https://www.googleapis.com/auth/cloud-platform"]
            )
        credentials = self._credentials
        if not getattr(credentials, "valid", False):
            credentials.refresh(Request())  # type: ignore[attr-defined]
        return str(getattr(credentials, "token"))  # noqa: B009

    def _predict(self, texts: list[str], task_type: str) -> list[list[float]]:
        try:
            response = httpx.post(
                self._url,
                headers={"Authorization": f"Bearer {self._token()}"},
                json={"instances": [{"content": text, "task_type": task_type} for text in texts]},
                timeout=30,
            )
            response.raise_for_status()
            predictions = response.json()["predictions"]
            return [list(map(float, item["embeddings"]["values"])) for item in predictions]
        except (httpx.HTTPError, KeyError, ValueError, TypeError) as error:
            raise EmbeddingError(f"Embedding call failed: {type(error).__name__}") from error
        except Exception as error:  # credentials problems come in many shapes
            raise EmbeddingError(f"Embedding credentials failed: {type(error).__name__}") from error

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for start in range(0, len(texts), BATCH_SIZE):
            vectors.extend(self._predict(texts[start : start + BATCH_SIZE], "RETRIEVAL_DOCUMENT"))
        return vectors

    def embed_query(self, text: str) -> list[float]:
        return self._predict([text], "RETRIEVAL_QUERY")[0]


@lru_cache(maxsize=1)
def _vertex_embedder(project: str, location: str, model: str) -> VertexEmbedder:
    return VertexEmbedder(project, location, model)


def get_embedder() -> Embedder | None:
    """The configured embedder, or None when semantic search is off (keyword search is used)."""
    project = settings.embeddings_project or settings.agent_project
    if not settings.embeddings_enabled or not project:
        return None
    location = settings.embeddings_location or settings.agent_location
    return _vertex_embedder(project, location, settings.embeddings_model)


def chunk_text(text: str) -> list[str]:
    """Overlapping windows of about CHUNK_WORDS words; short texts stay in one piece."""
    words = text.split()
    if not words:
        return []
    if len(words) <= CHUNK_WORDS + CHUNK_OVERLAP:
        return [" ".join(words)]
    chunks = []
    step = CHUNK_WORDS - CHUNK_OVERLAP
    for start in range(0, len(words), step):
        window = words[start : start + CHUNK_WORDS]
        chunks.append(" ".join(window))
        if start + CHUNK_WORDS >= len(words):
            break
    return chunks


def cosine(left: list[float], right: list[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right, strict=False))
    norm = math.sqrt(sum(a * a for a in left)) * math.sqrt(sum(b * b for b in right))
    return dot / norm if norm else 0.0


_WORD = re.compile(r"[\wЀ-ӿ]{3,}", re.UNICODE)


def keyword_score(query: str, text: str) -> float:
    """Share of the query's words found in the text: the fallback when there are no vectors."""
    words = {word.lower() for word in _WORD.findall(query)}
    if not words:
        return 0.0
    haystack = text.lower()
    return sum(word in haystack for word in words) / len(words)
