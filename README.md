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
- Загрузка PDF, DOCX и TXT до 20 MB; текст извлекается постранично и индексируется во фрагменты.
- Шлюз к ИИ-агенту (Vertex AI Agent Engine или локальный ADK-сервер) со стримингом шагов (SSE).
- Анализ условия задания: план подзадач с проверяемыми цитатами и страницами, подтверждение студентом.
- Insights агента с причиной и проверенными источниками; идемпотентное применение.
- Действия агента из чата (`AgentAction`): предложение → окно «Apply» → применение.
- Отмена/удаление заданий с каскадом на подзадачи и учебные сессии.
- Повторяющиеся занятия и семестровые предметы (серии, раскрываемые в события календаря).
- CRUD событий кампуса и учебных материалов.
- Импорт заданий из Moodle через предложение и подтверждение (MCP-сервер в `campuspulse-mcp`).
- Анонимные агрегаты для факультета с минимальным размером когорты.
- Docker (dev с hot reload, production-образ для Cloud Run) и отдельный Compose для инфраструктуры.

Реальных вызовов моделей из самого backend нет: он только передаёт сообщения агенту
([`campuspulse-agent`](https://github.com/DaniyarAbikenov/campuspulse-agent)) и проверяет всё, что агент
возвращает. OCR и векторный поиск не реализованы.

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
| Planning | Assignment (статус `cancelled`), AssignmentRelation, Task, ScheduleEvent, ScheduleSeries, TaskPlan, TaskPlanItem |
| Content | Document, DocumentFragment |
| Campus | CampusEvent, CampusEventMatch |
| Agent | AgentRun, AgentToolCall, AgentAction |
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
| Agent chat | `GET /api/v1/agent/status`, `POST /api/v1/agent/chat`, `POST /api/v1/agent/chat/stream` (SSE: `step` events, then `done` or `error`; the same for `/assignments/{id}/analysis/stream` and `/insights/refresh/stream`) |
| Agent insights | `POST /api/v1/insights/refresh` (student triggers), `POST /api/v1/agent/insights` (agent writes; sources verified) |
| Задания | `POST /api/v1/assignments`, `PATCH /assignments/{id}`, `POST /assignments/{id}/cancel`, `POST /assignments/{id}/reopen`, `DELETE /assignments/{id}` (каскад) |
| Анализ задания | `GET /assignments/{id}/text`, `POST /assignments/{id}/analysis[/stream]`, `GET /assignments/{id}/task-plan`, `PATCH /task-plans/{id}/items/{item}`, `POST /task-plans/{id}/apply`, `POST /task-plans/{id}/dismiss` |
| План недели | `GET /api/v1/schedule/plan`, `POST /api/v1/schedule/plan/apply` |
| Повторяющиеся занятия | `GET/POST /api/v1/schedule/series`, `DELETE /api/v1/schedule/series/{id}` |
| События календаря | `POST/PATCH/DELETE /api/v1/schedule-events` |
| События кампуса | `GET/POST /api/v1/campus-events`, `PATCH/DELETE /api/v1/campus-events/{id}` (автор или администратор) |
| Материалы | `POST /api/v1/materials` (загрузка), `PATCH/DELETE /api/v1/materials/{id}` |
| Действия агента | `POST /api/v1/agent/actions` (пишет агент), `GET /agent/actions`, `POST /agent/actions/{id}/apply`, `POST /agent/actions/{id}/dismiss` |
| Админ | `GET /api/v1/admin/overview` (только агрегаты, без персональных данных) |
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
| `CAMPUSPULSE_AGENT_MODE` | `disabled`, `vertex` (Agent Engine) или `adk_server` (локальный `adk api_server`) | `disabled` |
| `CAMPUSPULSE_AGENT_RESOURCE` | Resource name Agent Engine (режим `vertex`) | — |
| `CAMPUSPULSE_AGENT_PROJECT`, `CAMPUSPULSE_AGENT_LOCATION` | GCP проект и регион | —, `us-central1` |
| `CAMPUSPULSE_AGENT_ADK_URL` | URL ADK-сервера (режим `adk_server`) | `http://127.0.0.1:8002` |
| `CAMPUSPULSE_AGENT_ADK_APP`, `CAMPUSPULSE_AGENT_ADK_HOST_HEADER` | Имя ADK-приложения и подмена `Host` (ADK-сервер принимает только локальный host) | `campuspulse_agent`, — |
| `CAMPUSPULSE_AGENT_TOKEN_TTL_MINUTES` | Срок токена, который получает агент | `60` |
| `CAMPUSPULSE_ADMIN_MIN_COHORT_SIZE` | Минимум студентов в группе для показа агрегатов | `5` |

Compose переопределяет database URL на PostgreSQL и включает demo-auth для локального прототипа. Demo endpoint скрыт из OpenAPI и должен оставаться выключенным вне локальной среды.

## AI-агент

Backend не вызывает модель сам: он передаёт сообщение агенту ([`campuspulse-agent`](https://github.com/DaniyarAbikenov/campuspulse-agent),
Gemini + Google ADK) и возвращает ответ вместе с трассой рассуждений (`thought`, `tool_call`,
`tool_result`).

- **Права.** Backend выпускает агенту краткоживущий access-токен *студента*, поэтому все вызовы
  агента к API идут от имени студента и подчиняются тем же правилам доступа.
- **Стриминг.** `POST /agent/chat/stream`, `/assignments/{id}/analysis/stream` и
  `/insights/refresh/stream` отдают Server-Sent Events: `step` на каждый шаг, затем `done` или
  `error`. Буферизующие варианты без `/stream` остаются.
- **Журнал.** Каждый запуск записывается как `AgentRun` с `AgentToolCall` (страница Agent Activity).
- **Время.** В каждое сообщение добавляется текущее время кампуса (`Asia/Almaty`), чтобы «завтра»
  имело смысл.
- **Предложения вместо действий.** Агент не меняет данные сам. Результаты записываются как
  предложения и проверяются на сервере:
  - планы подзадач: цитаты сверяются с извлечённым текстом, страница исправляется;
  - insights: источники должны существовать; учебная сессия обязана попадать в реальное свободное
    окно в будущем, иначе остаётся советом;
  - действия чата (`AgentAction`): ссылки на задания и задачи проверяются на принадлежность
    студенту при предложении и ещё раз при применении.
- **Режимы.** `vertex` требует `pip install -e '.[agent]'` и доступ к Vertex AI;
  `adk_server` — локальный `adk api_server` (см. `campuspulse-agent/scripts/run_local.sh`).

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

## Файлы и документы

`POST /assignments/upload` (условие задания) и `POST /materials` (лекции, силлабусы, прочее) принимают
multipart с файлом PDF, DOCX или TXT до 20 MB. Запись и файл создаются одной транзакцией; при
ошибке файл удаляется. Текст извлекается постранично (`app/documents`) и сохраняется как
`DocumentFragment`, на которые ссылаются цитаты агента. Если текст прочитать нельзя (например,
скан), файл сохраняется, а ответ сообщает об этом (OCR нет). Метаданные хранятся в базе, байты — в
`CAMPUSPULSE_UPLOAD_DIRECTORY`.

## Отмена и удаление заданий

- `POST /assignments/{id}/cancel` — статус `cancelled`; незавершённые подзадачи и **будущие**
  учебные сессии удаляются, завершённые подзадачи остаются, открытые планы отклоняются. Задание
  выпадает из дедлайнов, нагрузки и свободного времени.
- `POST /assignments/{id}/reopen` — возвращает в работу.
- `DELETE /assignments/{id}` — удаляет задание вместе с подзадачами, учебными сессиями, планами и
  загруженным условием (включая файл).

## Календарь и серии

Повторяющаяся активность или предмет семестра создаётся через `POST /schedule/series` (дни недели,
время, период; по умолчанию до конца семестра, не более 400 вхождений) и раскрывается в обычные
`ScheduleEvent`, поэтому свободные окна, нагрузка и планировщик учитывают их без изменений.
Удаление серии удаляет все вхождения.

## Деплой в Google Cloud

Backend запускается в Cloud Run, база — Cloud SQL (PostgreSQL), секреты — Secret Manager. Образ
собирает `Dockerfile` (production, `.[agent]`); при старте контейнер выполняет
`alembic upgrade head`.

```bash
gcloud run deploy campuspulse-api --source . --region REGION \
  --add-cloudsql-instances PROJECT:REGION:INSTANCE \
  --set-secrets CAMPUSPULSE_DATABASE_URL=campuspulse-database-url:latest,CAMPUSPULSE_JWT_SECRET=campuspulse-jwt-secret:latest \
  --set-env-vars CAMPUSPULSE_GOOGLE_CLIENT_ID=...,CAMPUSPULSE_CORS_ORIGINS=https://<frontend>,\
CAMPUSPULSE_AGENT_MODE=vertex,CAMPUSPULSE_AGENT_PROJECT=PROJECT,CAMPUSPULSE_AGENT_LOCATION=REGION,\
CAMPUSPULSE_AGENT_RESOURCE=projects/.../reasoningEngines/...
```

Подробный порядок (Cloud SQL, Moodle MCP, Agent Engine, права сервисного агента на секреты) описан
в [`campuspulse-agent/docs/deployment.md`](https://github.com/DaniyarAbikenov/campuspulse-agent/blob/main/docs/deployment.md).
Миграция проверена на PostgreSQL (upgrade → downgrade → upgrade); автогенерируемые миграции
нужно править вручную (дубли CHECK для enum, имена ограничений, `batch_alter_table` для SQLite).

## Роли и очистка данных

```bash
python -m app.roles grant EMAIL academic_admin    # роли выдаются только так, не через API
python -m app.purge --keep you@example.com --yes  # удалить все данные, кроме указанных аккаунтов
```

`app.purge` без `--yes` делает пробный прогон и ничего не удаляет.

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
  agent/        шлюз к агенту (Vertex / ADK), стриминг, сервис запусков
  api/          raw CRUD routes
  auth/         Google verification, tokens, sessions, dependencies
  core/         configuration
  db/           SQLAlchemy models and session
  documents/    извлечение текста и фрагменты
  product/      frontend-oriented routes and services (manage, actions, plans, planner,
                imports, insight_agent, campus, admin)
  crud.py       typed CRUD helpers
  schemas.py    strict Pydantic contracts
  seeds.py      deterministic demo dataset
  roles.py      выдача ролей из CLI
  purge.py      очистка данных с сохранением аккаунтов
migrations/     Alembic environment and revisions
docs/           auth, RBAC, schema, ERD and frontend API
storage/        local uploaded files
tests/          API and migration tests
```

## Известные ограничения

- Refresh token возвращается JSON; production-вариант — Secure HttpOnly cookie и CSRF protection.
- Загруженные файлы лежат на локальном диске инстанса; в Cloud Run они пропадают при пересоздании
  (текст остаётся в базе). Нужно объектное хранилище и проверка содержимого.
- Нет OCR, эмбеддингов и очереди фоновых задач; поиск по материалам — по ключевым словам.
- Один токен Moodle обслуживает MCP-сервер для всех студентов; нужны персональные токены.
- `AuditEvent` существует, но полное журналирование действий не подключено.
- Нет ограничения частоты запросов (особенно к `/agent/*`), наблюдаемости и резервных копий.
