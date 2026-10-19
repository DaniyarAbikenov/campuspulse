# CampusPulse Frontend

Dashboard-first интерфейс CampusPulse AI для студентов и академических администраторов. Приложение объединяет курсы, задания, Kanban, расписание, workload, statistics, knowledge, campus events, proactive insights и настройки в CRM-подобной рабочей области.

Repository: https://github.com/DaniyarAbikenov/pixel-true-design-recreation
Lovable preview: https://pixel-true-design-recreation.lovable.app

## Текущее состояние

Frontend подключён к локальному FastAPI, но остаётся гибридным MVP-прототипом:

- реальные HTTP requests, bearer/refresh tokens и server mutations уже работают;
- backend данные локально создаются демонстрационным сидером;
- при недоступности API Store сохраняет исходные fixtures как visual fallback;
- часть страниц и вложенных блоков всё ещё использует `src/lib/data.ts`;
- AI-анализ файла и AI chat пока симулируются;
- Lovable deployment не может обращаться к локальному `127.0.0.1:8000`.

## Стек

- React 19
- TypeScript с strict configuration
- TanStack Start и TanStack Router
- Vite 8 / Nitro
- Tailwind CSS 4
- Radix UI primitives
- Recharts
- Sonner
- Vitest, Testing Library и ESLint
- Bun lockfile; npm также поддерживается

## Основные страницы

| Route | Назначение | Источник данных сейчас |
|---|---|---|
| `/` | Dashboard, deadlines, workload, tomorrow schedule, insights, activity | Смешанный: API Store + fixtures для activity |
| `/courses` | Course cards, поиск и progress | API |
| `/courses/:courseId` | Course overview, assignments и materials | Смешанный |
| `/assignments` | Assignment table, status/search/course filters | API dataset, фильтрация в UI |
| `/assignments/:assignmentId` | Requirements, relations, generated task proposal | Смешанный; analysis fixture |
| `/kanban` | Пять колонок, filters и generated proposals | API для существующих задач; часть create/import flows локальная |
| `/schedule` | Weekly calendar и study planning | API: события и свободные окна (`/schedule/free-time`) |
| `/workload` | Required/available hours и recommendation | API расчёт + локальный apply visualization |
| `/statistics` | Estimate/actual analytics | API summary; semester trend is a fixture |
| `/insights` | Proactive recommendations и CTA | API |
| `/knowledge` | Indexed materials and fragments | API |
| `/events` | Campus activities | API |
| `/activity` | Agent activity feed with tool calls | API (student); admin feed is a fixture |
| `/settings` | Profile, availability, AI и notifications | API |
| `/admin*` | Faculty dashboard, courses и cohort statistics | Fixtures |

Интерфейс доступен на английском, русском и казахском. Перевод применяется только на render boundary: canonical statuses и IDs остаются неизменными.

## Реальная API-интеграция

`src/lib/api.ts` отвечает за demo-session, refresh retry, загрузку workspace и mutations. `src/lib/store.tsx` гидратирует React context данными backend и оставляет fixtures как fallback.

Реально подключены:

- `GET /courses/overview`
- `GET /assignments/overview`
- `GET /kanban`
- `PATCH /kanban/tasks/{id}/move`
- `GET /schedule`
- `GET /workload`
- `GET /insights`
- `GET /statistics`, `GET /auth/me`
- `GET /knowledge`
- `GET /campus-events`, `PATCH /campus-events/{id}/save`
- `GET /agent/activity`, `POST /agent/runs`
- `POST /tasks`, `POST /schedule-events`
- `GET /schedule/free-time`
- `POST /assignments/upload`, `POST /assignments/{id}/analysis`, `PATCH/POST /task-plans/…` (анализ брифа агентом, подтверждение плана)
- `GET /agent/status`, `POST /agent/chat` (AI chat with reasoning trace when the agent is configured)
- `GET/PATCH/POST /imports/proposals…` (review and approve assignments found in Moodle)
- `PATCH /insights/{id}`
- `POST /insights/{id}/apply`
- `GET/PATCH /settings`
- `POST /assignments/upload`
- `POST /auth/demo`
- `POST /auth/refresh`

В UI подтверждена сквозная запись Settings в PostgreSQL. Профиль `Alex Morgan`, availability и server switches появляются после гидратации, а Kanban получает восемь серверных задач.

## Что пока остаётся локальным

- Generated task proposal, approval, import и scheduling частично живут в Store.
- Workload plan изменяет визуальную модель; server insight apply вызывается только из соответствующего insight flow.
- Semester trend и admin cohort/activity — fixtures; offline-режим показывает явный баннер.
- Requirements и historical hours на assignment detail — fixtures.
- Если агент не настроен, Upload показывает симулированный analysis (явно помечен); при включённом агенте анализ настоящий.
- Topbar search/chat остаются прототипными.

## Локальный запуск

Сначала запустите backend и PostgreSQL по инструкции в соседнем `campuspulse-backend/README.md`.

```bash
cp .env.example .env
bun install
bun run dev -- --host 127.0.0.1 --port 5173
```

Откройте http://127.0.0.1:5173.

Для npm:

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

## Environment

```dotenv
VITE_API_URL=http://127.0.0.1:8000/api/v1
VITE_GOOGLE_CLIENT_ID=<web client id>.apps.googleusercontent.com
VITE_ENABLE_DEMO_LOGIN=true
```

Если задан `VITE_GOOGLE_CLIENT_ID`, при запуске показывается экран входа с официальной кнопкой Google (GIS): credential обменивается на токены через `/auth/google`, новый пользователь проходит onboarding (`/auth/onboarding/options`, `/auth/onboarding`), сессия восстанавливается по refresh-токену, а выход отзывает его. Без Client ID и при `VITE_ENABLE_DEMO_LOGIN` не равном `false` приложение входит в demo-аккаунт автоматически (старое поведение); с Client ID demo доступен кнопкой на экране входа.

В local flow demo-вход использует скрытый backend endpoint `/auth/demo`. Он включён Docker Compose backend только для разработки. Production frontend должен получать Google credential через официальный GIS button и обменивать его через `/auth/google`.

## Архитектура frontend

```text
src/
  components/app/   shell, widgets, Kanban, chat and upload flows
  components/ui/    shared Radix/Tailwind components
  lib/api.ts        typed FastAPI adapter and response mapping
  lib/data.ts       canonical fixture dataset and display helpers
  lib/store.tsx     shared workspace state and backend hydration
  lib/i18n.tsx      locale subscription and translation catalog
  routes/           TanStack file routes
  test/             Store, routing and localization regression tests
```

App shell находится в `src/routes/__root.tsx`. Sidebar, topbar, chat drawer и upload dialog общие для всех страниц. Role хранится в router context и используется guards для student/admin routes; настоящая безопасность всегда остаётся на backend.

API UUID преобразуются в стабильные prototype IDs (`se`, `adb`, `se-a3` и т. п.), потому что существующие визуальные компоненты и deep links используют эти IDs. Это временный compatibility layer; в production routes должны работать с server IDs или стабильными slugs.

## Assignment upload

Диалог принимает PDF, DOCX и TXT до 20 MB, course, title и deadline. При доступном API файл отправляется multipart-запросом, после чего список assignments повторно загружается.

Экран явно сообщает, что текущий analysis является simulated fixture. Нельзя показывать имя загруженного файла как доказательство реального parsing.

## Основные команды

```bash
bun run dev       # development server
bun run build     # production client/SSR/Nitro build
bun run preview   # preview production build
bun run test      # Vitest regression suite
bun run lint      # ESLint and Prettier rules
bun run format    # apply Prettier
```

Точечная строгая проверка типов:

```bash
bun x tsc --noEmit
```

## Lovable workflow

Репозиторий подключён к Lovable. Не используйте force push, rebase, amend или squash уже опубликованной истории: это может удалить историю проекта со стороны Lovable. Обычные commits в `main` синхронизируются с editor.

Публичный Lovable preview использует собранный frontend, но локальный API `127.0.0.1:8000` ему недоступен. Для настоящего deployment необходимо:

1. развернуть backend на публичном HTTPS URL;
2. установить production `VITE_API_URL`;
3. добавить frontend origin в CORS;
4. создать Google Web OAuth client и разрешить Lovable/custom domain;
5. выключить demo-auth;
6. реализовать login и onboarding UI.

## UX-инварианты

- Просмотр, принятие, применение и отклонение recommendation — разные действия.
- Generated proposals не должны появляться в Kanban до explicit approval/import.
- Scheduling выполняется отдельно от импорта и должен быть идемпотентным.
- Course/assignment totals выводятся из сущностей, а не поддерживаются вручную.
- Completion уменьшает remaining work; schedule allocation только распределяет работу.
- Mobile sidebar открывается в Sheet, широкие таблицы и доски прокручиваются внутри layout.
- Frontend role switch предназначен для демонстрации интерфейсов и не заменяет backend authorization.

## Проверки

Перед публикацией:

```bash
bun x tsc --noEmit
bun run test
bun run build
```

Текущий regression suite проверяет localization, route access, workload invariants, proposal approval/import/scheduling и Store transitions.

## Следующие шаги

1. Добавить настоящий Google GIS login и onboarding pages.
2. Убрать silent fallback или явно показывать offline/demo mode.
3. Подключить create/edit/delete task и schedule event.
4. Перевести Statistics, Knowledge, Events, Activity и Admin routes на API.
5. Использовать server IDs/slugs без title-based compatibility mapping.
6. Добавить query cache, loading/error/empty states и mutation rollback.
7. Реализовать настоящий document ingestion и source-grounded analysis.
8. Добавить end-to-end tests против контейнерного backend.
