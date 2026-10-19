# CampusPulse Backend

Строго типизированный backend CampusPulse AI на FastAPI. Он хранит академические сущности, выполняет CRUD и агрегирование данных для интерфейса, проверяет Google Identity tokens, выпускает собственные access/refresh tokens и ограничивает доступ по ролям, организации, enrollment и ownership.

Repository: https://github.com/DaniyarAbikenov/campuspulse-backend

## Реализовано

- FastAPI API с версионированным префиксом `/api/v1`.
- Строгие Pydantic v2 schemas: лишние поля и нежелательное приведение типов отклоняются.
- SQLAlchemy 2, PostgreSQL 17 и SQLite для простого host-run режима.
- Alembic migrations и идемпотентный deterministic seeder.
- Google Identity Services authentication.
- Короткоживущий JWT access token и rotating opaque refresh token.
- Хеширование refresh tokens в базе, logout/revocation и `/auth/me`.
- RBAC и resource-level authorization.
- CRUD для основных академических сущностей.
- Агрегирующие endpoint’ы под текущие frontend-экраны.
- Загрузка PDF, DOCX и TXT до 20 MB.
- Stored insights с настраиваемым CTA и идемпотентным применением.
- Docker hot reload и отдельный Docker Compose для инфраструктуры.

AI model calls, OCR/document parsing, vector search и MCP в backend пока отсутствуют.

## Технологии

- Python 3.11+
- FastAPI
- Pydantic v2 / pydantic-settings
- SQLAlchemy 2
- Alembic
- PostgreSQL 17 / psycopg 3
- Google Auth
- PyJWT
- Uvicorn
- Pytest, Ruff и strict mypy

## Доменные сущности

| Область | Сущности |
|---|---|
| Identity | Institution, User, IdentityAccount, AuthSession |
| Authorization | Role, UserRole, Enrollment |
| Academic structure | Semester, Course |
| Planning | Assignment, AssignmentRelation, Task, ScheduleEvent |
| Content | Document, DocumentFragment |
| Campus | CampusEvent, CampusEventMatch |
| Agent | AgentRun, AgentToolCall |
| Integrations | ImportProposal, ImportItem |
| Product | UserSettings, Insight |
| Audit | AuditEvent |

Полное описание таблиц: [`docs/database-schema.md`](docs/database-schema.md).
Mermaid ERD: [`docs/erd.md`](docs/erd.md).

## API

Все защищённые запросы используют `Authorization: Bearer <access_token>`.

### Authentication

| Method | Path | Назначение |
|---|---|---|
| POST | `/api/v1/auth/google` | Проверить Google ID token и создать/найти пользователя |
| POST | `/api/v1/auth/refresh` | Ротация refresh token и выдача новой пары |
| POST | `/api/v1/auth/logout` | Отозвать refresh session |
| GET | `/api/v1/auth/me` | Текущий профиль и роли |
| POST | `/api/v1/auth/onboarding` | Выбрать institution, program и начальные courses |
| POST | `/api/v1/auth/demo` | Скрытый локальный вход; доступен только при включённом demo-auth |

Google flow подробно описан в [`docs/authentication.md`](docs/authentication.md).

### Frontend-oriented endpoints

| Экран | Endpoint |
|---|---|
| Courses | `GET /api/v1/courses/overview` |
| Assignments | `GET /api/v1/assignments/overview` |
| Upload Assignment | `POST /api/v1/assignments/upload` |
| Download document | `GET /api/v1/documents/{id}/download` |
| My Schedule | `GET /api/v1/schedule` |
| Free time | `GET /api/v1/schedule/free-time` |
| Kanban | `GET /api/v1/kanban` |
| Move card | `PATCH /api/v1/kanban/tasks/{id}/move` |
| Workload | `GET /api/v1/workload` |
| Statistics | `GET /api/v1/statistics` |
| Knowledge | `GET /api/v1/knowledge` |
| Campus events | `GET /api/v1/campus-events`, `PATCH /api/v1/campus-events/{id}/save` |
| Agent activity | `GET /api/v1/agent/activity`, `POST /api/v1/agent/runs` |
| Imports | `POST/GET /api/v1/imports/proposals`, item `PATCH`, `POST .../apply`, `POST .../dismiss` |
| Settings | `GET/PATCH /api/v1/settings` |
| Insights | `GET/POST /api/v1/insights` |
| Insight state | `PATCH /api/v1/insights/{id}` |
| Apply CTA | `POST /api/v1/insights/{id}/apply` |

Courses поддерживают `q`, `semester_id` и `has_open_assignments`. Assignments поддерживают поиск, course/status filters и диапазон deadline. Kanban поддерживает поиск, course, assignment, priority и completed filters.

Подробный контракт: [`docs/frontend-api.md`](docs/frontend-api.md). При запущенном сервисе полный OpenAPI доступен на http://127.0.0.1:8000/docs.

### Raw CRUD

CRUD routes существуют для institutions, users, semesters, courses, enrollments, assignments, assignment relations, tasks, documents и schedule events. Identity accounts, roles, role assignments и audit events намеренно не имеют открытого generic CRUD.

## Авторизация и роли

- `student` управляет собственными assignments, tasks, schedule, settings и insights в enrolled courses.
- `academic_admin` управляет академическими данными своей institution.
- `platform_admin` имеет глобальную область.

List routes фильтруют недоступные записи. Прямой доступ к чужому ресурсу возвращает `404`, чтобы не раскрывать его существование. Assignment имеет `owner_user_id`, поскольку status, progress и effort являются персональными.

Полная матрица: [`docs/authorization.md`](docs/authorization.md).

## Конфигурация

Скопируйте `.env.example` в `.env`.

| Variable | Назначение | Default/example |
|---|---|---|
| `CAMPUSPULSE_DATABASE_URL` | SQLAlchemy connection URL | `sqlite:///./campuspulse.db` |
| `CAMPUSPULSE_API_V1_PREFIX` | API prefix | `/api/v1` |
| `CAMPUSPULSE_GOOGLE_CLIENT_ID` | Google Web Client ID | требуется для Google login |
| `CAMPUSPULSE_JWT_SECRET` | Подпись CampusPulse JWT | случайное значение минимум 32 bytes |
| `CAMPUSPULSE_CORS_ORIGINS` | Разрешённые frontend origins | localhost/127.0.0.1:5173 |
| `CAMPUSPULSE_UPLOAD_DIRECTORY` | Storage загруженных файлов | `storage/uploads` |
| `CAMPUSPULSE_MAX_UPLOAD_BYTES` | Максимальный размер файла | 20 MB |
| `CAMPUSPULSE_ENABLE_DEMO_AUTH` | Разрешить локальный `/auth/demo` | `false` |

Compose переопределяет database URL на PostgreSQL и включает demo-auth для локального прототипа. Demo endpoint скрыт из OpenAPI и должен оставаться выключенным вне локальной среды.

## Запуск через Docker

Инфраструктура и приложение разделены, чтобы PostgreSQL можно было запускать и останавливать независимо.

```bash
cp .env.infrastructure.example .env.infrastructure
cp .env.example .env

docker compose --env-file .env.infrastructure -f compose.infrastructure.yml up -d --wait
docker compose --env-file .env.infrastructure up -d --build
docker compose exec api python -m app.seeds
```

- API: http://127.0.0.1:8000
- OpenAPI: http://127.0.0.1:8000/docs
- Health: http://127.0.0.1:8000/health

`app/` и `migrations/` подключены как bind mounts; изменение Python-кода перезапускает Uvicorn. Перед стартом API автоматически выполняется `alembic upgrade head`.

Остановка:

```bash
docker compose down
docker compose --env-file .env.infrastructure -f compose.infrastructure.yml down
```

Для полного удаления локальных данных добавьте `--volumes` только ко второй команде.

## Запуск без Docker

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
cp .env.example .env
alembic upgrade head
python -m app.seeds
uvicorn app.main:app --reload
```

Без изменения `.env` используется SQLite. Docker-профиль использует PostgreSQL.

## Миграции и сиды

```bash
alembic current
alembic upgrade head
alembic check
python -m app.seeds
```

Seeder создаёт фиксированного demo student, три роли, пять courses, девять assignments, восемь tasks, schedule events, settings и insights. Он идемпотентен: повторный запуск обновляет фиксированные UUID и не увеличивает количество записей.

Данные сидера являются демонстрационными, даже несмотря на то, что frontend получает их через настоящий API.

## Файлы

`POST /assignments/upload` принимает multipart fields `file`, `course_id`, `title`, `due_at`, optional `description` и `estimated_hours`. Запись Assignment и Document создаётся одной транзакцией. При ошибке файл удаляется. Metadata хранится в PostgreSQL, а байты — в `CAMPUSPULSE_UPLOAD_DIRECTORY`.

Текущая реализация не извлекает текст и не вызывает AI. Filename в интерфейсе не должен подразумевать, что файл был проанализирован.

## Проверки

```bash
pytest
ruff check app tests
mypy app
alembic check
```

`mypy` работает в strict mode. Тесты покрывают CRUD, authentication/refresh/logout, authorization, frontend endpoints, uploads, insights, migrations и идемпотентность seed.

## Структура

```text
app/
  api/          raw CRUD routes
  auth/         Google verification, tokens, sessions, dependencies
  core/         configuration
  db/           SQLAlchemy models and session
  product/      frontend-oriented routes and aggregation services
  crud.py       typed CRUD helpers
  schemas.py    strict Pydantic contracts
  seeds.py      deterministic demo dataset
migrations/     Alembic environment and revisions
docs/           auth, RBAC, schema, ERD and frontend API
storage/        local uploaded files
tests/          API and migration tests
```

## Известные ограничения и следующий этап

- Google login backend готов, но frontend login/onboarding UI ещё не подключён.
- Refresh token пока возвращается JSON; production-вариант должен использовать Secure HttpOnly cookie и CSRF protection.
- Upload storage локальный; production требует object storage и malware/content validation.
- Нет очереди фоновых задач, document ingestion, OCR, embeddings или AI orchestration.
- Нет MCP server. Сначала следует определить внутренние agent tools и permission model.
- AuditEvent model существует, но полное журналирование всех действий ещё не подключено.
- Нужны deployment config, observability, backups и rate limiting.
