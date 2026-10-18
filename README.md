# CampusPulse Backend

Typed FastAPI service for the initial CampusPulse academic domain. It supports Google Identity
Services sign-in, CampusPulse access and refresh tokens, identity mapping, roles and audit events.
Academic CRUD is protected by role and ownership checks. MCP, AI workflows, document parsing and a
configurable policy engine are not implemented yet.

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
- Personal settings
- Actionable AI insight records

The academic resources expose list, create, read, partial update and delete operations under
`/api/v1`. Identity accounts, roles, role assignments and audit events currently exist only as
database and Pydantic models, so they cannot be mutated through an unsecured API.
Request bodies use strict Pydantic v2 schemas: implicit type coercion and unknown fields are rejected.

The schema overview is in [docs/database-schema.md](docs/database-schema.md), and the Mermaid ERD is
in [docs/erd.md](docs/erd.md). The access rules are documented in
[docs/authorization.md](docs/authorization.md).

## Local Google authentication

The backend receives the Google ID token produced by the Google Identity Services browser widget.
It verifies the token with Google's signing keys and configured audience, then returns a short-lived
CampusPulse access token plus a rotating refresh token.

Copy `.env.example` to `.env`, generate a private JWT secret, and set your Google Web Client ID:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Create a Web application OAuth client in Google Cloud and add `http://localhost:5173` as an
Authorized JavaScript origin. Popup mode with a JavaScript callback does not require a redirect URI
or client secret. The complete browser/backend contract is in
[docs/authentication.md](docs/authentication.md).

Authentication endpoints:

- `POST /api/v1/auth/google`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/onboarding`

Every academic CRUD endpoint requires `Authorization: Bearer <access_token>`. A newly created
Google user completes onboarding once to select an institution, profile details and initial
courses.

Frontend-oriented endpoints are documented in
[docs/frontend-api.md](docs/frontend-api.md). They provide the aggregated course and assignment
cards, weekly schedule and free-time slots, Kanban columns, workload and study statistics,
actionable insights, assignment file upload, and user settings used by the current prototype.

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

