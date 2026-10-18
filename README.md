# CampusPulse Backend

Typed FastAPI CRUD service for the initial CampusPulse academic domain. The database includes the
identity, role and audit tables needed for the next AAA phase. Token verification, permission
enforcement, MCP, AI workflows, document parsing and a policy engine are not implemented yet.

## Domain resources

- Institutions
- Users
- Semesters
- Courses
- Enrollments
- Assignments
- Assignment relations
- Tasks
- Documents (metadata only)
- Schedule events

The academic resources expose list, create, read, partial update and delete operations under
`/api/v1`. Identity accounts, roles, role assignments and audit events currently exist only as
database and Pydantic models, so they cannot be mutated through an unsecured API.
Request bodies use strict Pydantic v2 schemas: implicit type coercion and unknown fields are rejected.

The schema overview is in [docs/database-schema.md](docs/database-schema.md), and the Mermaid ERD is
in [docs/erd.md](docs/erd.md).

## Run with Docker and hot reload

The API and infrastructure intentionally live in separate Compose projects. Start PostgreSQL first:

```bash
cp .env.infrastructure.example .env.infrastructure
docker compose \
  --env-file .env.infrastructure \
  -f compose.infrastructure.yml \
  up -d --wait
```

Then start the API:

```bash
docker compose --env-file .env.infrastructure up --build
```

`app/` is mounted into the API container. Changes to Python files restart Uvicorn automatically.
The API container applies all pending Alembic migrations before starting Uvicorn.
The API is available at `http://127.0.0.1:8000`, and OpenAPI at
`http://127.0.0.1:8000/docs`. PostgreSQL stays inside `campuspulse-network`, so it does not collide
with databases already running on the host.

Stop the API and infrastructure independently:

```bash
docker compose down
docker compose --env-file .env.infrastructure -f compose.infrastructure.yml down
```

Add `--volumes` to the second command only when you deliberately want to remove the local PostgreSQL
data volume.

## Run directly on the host

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
alembic upgrade head
uvicorn app.main:app --reload
```

Optionally load the deterministic prototype dataset after the migration:

```bash
python -m app.seeds
```

The seeder is idempotent. Running it again updates the same fixed demo records rather than creating
duplicates. In Docker, run it with `docker compose exec api python -m app.seeds`.

Open `http://127.0.0.1:8000/docs` for the generated OpenAPI interface.

SQLite is used by default outside Docker. The Docker setup uses PostgreSQL 17 through the separate
infrastructure project.

## Verify

```bash
pytest
ruff check .
mypy app
alembic check
```

