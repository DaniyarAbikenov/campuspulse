from pathlib import Path

from app import schemas
from app.db import models
from app.documents.extract import ExtractionError, PageText, extract_pages

CONCEPT_LENGTH = 80


def extract(path: Path, content_type: str) -> tuple[schemas.ExtractionRead, list[PageText]]:
    """Extract text without ever failing the upload: the outcome is reported instead."""
    try:
        pages = extract_pages(path, content_type)
    except ExtractionError as error:
        if error.reason == "no_text":
            return schemas.ExtractionRead(status="no_text", pages=0, characters=0), []
        if error.reason == "unsupported":
            return schemas.ExtractionRead(status="unsupported", pages=0, characters=0), []
        return schemas.ExtractionRead(status="failed", pages=0, characters=0), []
    return (
        schemas.ExtractionRead(
            status="ok", pages=len(pages), characters=sum(len(page.text) for page in pages)
        ),
        pages,
    )


def fragments_for(
    document: models.Document, pages: list[PageText]
) -> list[models.DocumentFragment]:
    return [
        models.DocumentFragment(
            document_id=document.id,
            assignment_id=document.assignment_id,
            page=page.number,
            concept=_first_line(page.text),
            text=page.text,
        )
        for page in pages
    ]


def _first_line(text: str) -> str:
    line = next((item.strip() for item in text.splitlines() if item.strip()), "")
    return line[:CONCEPT_LENGTH] or "Page"
