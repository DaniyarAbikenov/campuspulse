"""Index a student's materials into embedded chunks and search them by meaning."""

import logging
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app import schemas
from app.auth.authorization import can_read
from app.auth.service import AuthenticatedUser
from app.db import models
from app.documents import embeddings
from app.documents.embeddings import Embedder, EmbeddingError

logger = logging.getLogger(__name__)

MIN_SEARCH_SCORE = 0.52
MIN_RESOURCE_SCORE = 0.58
KEYWORD_WEIGHT = 0.8  # a word match is weaker evidence than a close meaning
EXCERPT_CHARS = 420
STUDY_KINDS = (models.DocumentKind.lecture, models.DocumentKind.syllabus, models.DocumentKind.other)


def index_document(session: Session, document: models.Document) -> int:
    """(Re)build the chunks of one document from its fragments and embed them when possible.
    Never raises: without vectors the chunks still serve keyword search."""
    session.execute(
        delete(models.DocumentChunk).where(models.DocumentChunk.document_id == document.id)
    )
    chunks: list[models.DocumentChunk] = []
    fragments = session.scalars(
        select(models.DocumentFragment)
        .where(models.DocumentFragment.document_id == document.id)
        .order_by(models.DocumentFragment.page, models.DocumentFragment.created_at)
    ).all()
    for fragment in fragments:
        for piece in embeddings.chunk_text(fragment.text):
            if len(chunks) >= embeddings.MAX_CHUNKS_PER_DOCUMENT:
                break
            chunks.append(
                models.DocumentChunk(
                    document_id=document.id, position=len(chunks), page=fragment.page, text=piece
                )
            )
    session.add_all(chunks)
    session.flush()
    _embed(chunks, document.name)
    session.commit()
    return len(chunks)


def _embed(chunks: list[models.DocumentChunk], title: str) -> None:
    embedder = embeddings.get_embedder()
    if embedder is None or not chunks:
        return
    try:
        vectors = embedder.embed_documents([f"{title}\n{chunk.text}" for chunk in chunks])
    except EmbeddingError as error:
        logger.warning("Chunks of %s stay keyword-only: %s", title, error)
        return
    for chunk, vector in zip(chunks, vectors, strict=True):
        chunk.embedding = vector
        chunk.embedding_model = embedder.model


def reindex_all(session: Session, actor: AuthenticatedUser, *, force: bool = False) -> int:
    """Index every readable document that has no chunks (or all of them with `force`)."""
    count = 0
    for document in _readable_documents(session, actor):
        has_chunks = session.scalar(
            select(models.DocumentChunk.id).where(models.DocumentChunk.document_id == document.id)
        )
        if force or has_chunks is None:
            index_document(session, document)
            count += 1
    return count


def _readable_documents(
    session: Session, actor: AuthenticatedUser, course_id: UUID | None = None
) -> list[models.Document]:
    documents = []
    for document in session.scalars(select(models.Document)):
        if course_id is not None and document.course_id != course_id:
            continue
        if not can_read(session, actor, document):
            continue
        if document.assignment_id is not None:
            assignment = session.get(models.Assignment, document.assignment_id)
            if assignment is None or assignment.owner_user_id != actor.user.id:
                continue  # briefs belong to the student who uploaded them
        documents.append(document)
    return documents


def search(
    session: Session,
    actor: AuthenticatedUser,
    query: str,
    *,
    limit: int = 5,
    course_id: UUID | None = None,
    kinds: tuple[models.DocumentKind, ...] | None = None,
    exclude_assignment_id: UUID | None = None,
    min_score: float = MIN_SEARCH_SCORE,
    embedder: Embedder | None = None,
) -> list[schemas.KnowledgeHitRead]:
    """Passages that best answer `query`: by meaning when vectors exist, by words otherwise."""
    query = query.strip()
    if not query:
        return []
    documents = {
        document.id: document
        for document in _readable_documents(session, actor, course_id)
        if (kinds is None or document.kind in kinds)
        and not (exclude_assignment_id and document.assignment_id == exclude_assignment_id)
    }
    if not documents:
        return []
    embedder = embedder or embeddings.get_embedder()
    vector: list[float] | None = None
    if embedder is not None:
        try:
            vector = embedder.embed_query(query)
        except EmbeddingError as error:
            logger.warning("Searching by keywords only: %s", error)
    scored: list[tuple[float, models.DocumentChunk]] = []
    for chunk in session.scalars(
        select(models.DocumentChunk).where(models.DocumentChunk.document_id.in_(list(documents)))
    ):
        if vector is not None and chunk.embedding:
            score = embeddings.cosine(vector, chunk.embedding)
        else:
            score = embeddings.keyword_score(query, chunk.text) * KEYWORD_WEIGHT
        if score >= min_score:
            scored.append((score, chunk))
    scored.sort(key=lambda item: item[0], reverse=True)
    hits: list[schemas.KnowledgeHitRead] = []
    seen: set[tuple[UUID, int]] = set()
    for score, chunk in scored:
        key = (chunk.document_id, chunk.page)
        if key in seen:
            continue  # one passage per page is enough to cite
        seen.add(key)
        document = documents[chunk.document_id]
        hits.append(
            schemas.KnowledgeHitRead(
                document_id=document.id,
                document_name=document.name,
                kind=document.kind,
                course_id=document.course_id,
                page=chunk.page,
                excerpt=_excerpt(chunk.text),
                score=round(score, 3),
            )
        )
        if len(hits) >= limit:
            break
    return hits


def _excerpt(text: str) -> str:
    return text if len(text) <= EXCERPT_CHARS else text[: EXCERPT_CHARS - 1].rstrip() + "…"


def resources_for(
    session: Session,
    actor: AuthenticatedUser,
    *,
    requirement: str,
    title: str,
    assignment_id: UUID,
    limit: int = 2,
) -> list[dict[str, object]]:
    """Study passages to attach to a task: lectures, syllabi and other materials only."""
    hits = search(
        session,
        actor,
        f"{requirement}. {title}",
        limit=limit,
        kinds=STUDY_KINDS,
        exclude_assignment_id=assignment_id,
        min_score=MIN_RESOURCE_SCORE,
    )
    return [
        {
            "document_id": str(hit.document_id),
            "document_name": hit.document_name,
            "page": hit.page,
            "excerpt": hit.excerpt,
        }
        for hit in hits
    ]
