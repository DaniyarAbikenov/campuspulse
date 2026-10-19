# CampusPulse Frontend

Веб-интерфейс **CampusPulse AI** — умного помощника студента для планирования учёбы. Студент видит
курсы, задания, дедлайны, нагрузку и свободное время в одном месте, а ИИ-агент (Gemini) читает
документы, предлагает план работы и показывает каждый шаг своих рассуждений. Агент только
предлагает: любое изменение (задачи, события календаря, отмена задания) происходит после явного
подтверждения студентом.

- Repository: https://github.com/DaniyarAbikenov/pixel-true-design-recreation
- Lovable preview: https://pixel-true-design-recreation.lovable.app
- Развёрнутый сайт (Cloud Run): https://campuspulse-web-694651486934.us-central1.run.app

## Как устроена вся система

```text
Браузер (этот репозиторий)
   │  HTTPS, Bearer JWT, SSE
   ▼
campuspulse-backend  (FastAPI, PostgreSQL)  ──►  Vertex AI Agent Engine: campuspulse-agent (Gemini + ADK)
                                                         │ MCP по HTTP
                                                         ▼
                                                  campuspulse-mcp  ──►  Moodle
```

| Репозиторий | Роль |
|---|---|
| `campuspulse-frontend` | этот интерфейс |
| [`backend`](../backend) | API, база, авторизация, шлюз к агенту |
| [`agent`](../agent) | агент на Google ADK, деплой в Agent Engine |
| [`mcp`](../mcp) | MCP-сервер Moodle (только чтение) |

## Что умеет интерфейс

| Сценарий | Где |
|---|---|
| Вход через Google, выбор вуза и курсов при первом входе | экран входа, onboarding |
| Обзор недели: дедлайны, нагрузка, свободные окна, insights | `/` |
| Чат с ассистентом: ответ приходит вместе с **шагами агента в реальном времени** (вызовы инструментов, результаты, ошибки) | кнопка «Ask CampusPulse» |
| Предложения агента в чате (событие в календарь, задача, смена статуса, отмена задания) открываются окном **«Apply: …»** и выполняются только после подтверждения | чат |
| Загрузка условия задания (PDF/DOCX/TXT): агент находит требования с цитатами и страницами, предлагает 5–8 подзадач; в Kanban они попадают только после подтверждения | Upload Assignment, страница задания |
| Ручное добавление задания (в том числе внутри курса), **отмена** (подзадачи и будущие учебные сессии исчезают), возврат, удаление | курс, список заданий, страница задания |
| Kanban подзадач, новая задача | `/kanban` |
| Календарь недели, **Add to calendar**: учебная сессия (сначала задание, затем подзадача), разовое занятие, **повторяющееся** (тренировки, работа) и **семестровые предметы** | `/schedule` |
| План на неделю: предпросмотр и применение (идемпотентно) | `/workload` |
| «Review my week»: агент анализирует дедлайны, нагрузку и окна и создаёт insights с причиной и источниками; применение — отдельным шагом | `/insights` |
| События кампуса: добавление, правка и удаление своих событий, сохранение | `/events` |
| База знаний: загрузка лекций, силлабусов и других материалов, правка, удаление; поиск по понятиям, фрагменты по страницам | `/knowledge` |
| Импорт заданий из Moodle через предложение → подтверждение | `/assignments` |
| История работы агента с вызовами инструментов | `/activity` |
| Статистика точности оценок | `/statistics` |
| Анонимные агрегаты факультета (роль `academic_admin`, минимальный размер когорты) | `/admin*` |

Интерфейс доступен на английском, русском и казахском. Перевод применяется на render boundary;
статусы и идентификаторы остаются каноническими.

## Режимы работы

- **Live** — есть API: данные, мутации и агент настоящие. Для входа нужен Google или (только в
  разработке) demo-аккаунт.
- **Offline demo** — API недоступен: явный баннер и данные из `src/lib/data.ts`. Здесь функции,
  требующие сервера (повторяющиеся занятия, загрузка материалов, CRUD событий), скрыты или
  отключены.

## Стек

React 19 · TypeScript (strict) · TanStack Start/Router · Vite 8 + Nitro · Tailwind CSS 4 ·
Radix UI · Recharts · Sonner · Vitest + Testing Library · ESLint/Prettier.

## Быстрый старт

Сначала запустите backend ([инструкция](../backend/README.md)).

```bash
cp .env.example .env
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Откройте http://127.0.0.1:5173. Bun тоже поддерживается (`bun install`, `bun run dev`).

### Переменные окружения

Все значения `VITE_*` вшиваются на этапе сборки.

| Переменная | Назначение | Пример |
|---|---|---|
| `VITE_API_URL` | Базовый URL API | `http://127.0.0.1:8000/api/v1` |
| `VITE_GOOGLE_CLIENT_ID` | Web client ID для Google Identity Services | `….apps.googleusercontent.com` |
| `VITE_ENABLE_DEMO_LOGIN` | Кнопка/автовход в demo-аккаунт; в продакшене `false` | `true` |

Если задан `VITE_GOOGLE_CLIENT_ID`, показывается экран входа с кнопкой Google: credential
обменивается на токены через `/auth/google`, новый пользователь проходит onboarding, сессия
восстанавливается по refresh-токену, выход его отзывает. Без Client ID и при
`VITE_ENABLE_DEMO_LOGIN` ≠ `false` приложение входит в demo-аккаунт автоматически (`/auth/demo`,
этот endpoint включён на backend только для разработки).

## Деплой в Cloud Run

```bash
PROJECT=<gcp-project>; REGION=us-central1
IMG=$REGION-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/campuspulse-web:v1

# Vite вшивает VITE_* при сборке, поэтому образ собирается через Cloud Build с build-args
gcloud builds submit --config cloudbuild.yaml --project $PROJECT \
  --substitutions=_IMAGE=$IMG,_API_URL=https://<backend>/api/v1,_GOOGLE_CLIENT_ID=<client-id> .

gcloud run deploy campuspulse-web --image $IMG --region $REGION --project $PROJECT --allow-unauthenticated
```

После деплоя:

1. добавьте адрес сайта в `CAMPUSPULSE_CORS_ORIGINS` backend;
2. добавьте его в **Authorized JavaScript origins** OAuth-клиента Google;
3. если OAuth consent screen в режиме Testing, добавьте тестовых пользователей.

`Dockerfile` собирает Nitro в режиме `node-server` (`NITRO_PRESET`), `.dockerignore` исключает
`node_modules` и `.env`.

## Структура

```text
src/
  components/app/   оболочка, виджеты, Kanban, чат, диалоги (календарь, задания, события,
                    материалы, действия агента), AgentTrace
  components/ui/    общие Radix/Tailwind компоненты
  lib/api.ts        типизированный адаптер FastAPI: токены, SSE-стрим агента, мутации, маппинг
  lib/agentSteps.ts шаги агента → строки трассы (вызов ↔ результат)
  lib/store.tsx     общее состояние workspace и гидратация данными backend
  lib/week.ts       календарные хелперы (зона Asia/Almaty)
  lib/data.ts       фикстуры offline-режима и типы отображения
  lib/i18n.tsx      локаль и каталог переводов (lib/locales/catalog.json)
  routes/           файловые маршруты TanStack
  test/             регрессионные тесты
```

Оболочка (sidebar, topbar, чат, диалог загрузки) смонтирована в `src/routes/__root.tsx`. Роль
хранится в router context и используется guard’ами; настоящая авторизация — только на backend.

### Как показываются шаги агента

Чат, анализ задания и «Review my week» вызывают `…/stream`-эндпоинты backend
(Server-Sent Events). `streamRequest` в `api.ts` читает поток: событие `step` приходит на каждый
вызов инструмента и результат, `done` — итог, `error` — причина отказа. `AgentTrace` рисует вызов
как «крутящуюся» строку, которая становится галочкой при получении результата; ошибки
инструмента отмечаются предупреждением.

## Команды

```bash
npm run dev       # dev-сервер
npm run build     # production-сборка client/SSR/Nitro
npm run preview   # предпросмотр сборки
npm run test      # Vitest
npm run lint      # ESLint + Prettier
npx tsc --noEmit  # строгая проверка типов
```

Перед публикацией: `npx tsc --noEmit && npm run test && npm run build`.

## Lovable

Репозиторий связан с Lovable: коммиты в подключённую ветку синхронизируются с редактором. Не
используйте force push, rebase, amend и squash для уже опубликованной истории — Lovable потеряет
историю проекта. Публичный Lovable preview не может обратиться к локальному API.

## UX-инварианты

- Просмотр, принятие, применение и отклонение рекомендации — разные действия.
- Предложения (план задач, импорт, действия чата, insights) ничего не меняют до явного
  подтверждения; повторное применение безопасно (идемпотентно).
- Итоги по курсам и заданиям выводятся из сущностей, а не хранятся вручную.
- Завершение работы уменьшает остаток; расписание лишь распределяет работу по времени.
- Отменённое задание не входит в дедлайны и нагрузку.
- Мобильное меню открывается в Sheet; широкие таблицы и доска прокручиваются внутри layout.

## Известные ограничения

- Refresh-токен хранится в `localStorage` (для продакшена нужна HttpOnly cookie).
- Вход через Google нельзя проверить во встроенных браузерах без загрузки скрипта GIS.
- Новые тексты интерфейса переведены на ru/kk, но переводы не вычитывались носителем.
- Offline-фикстуры остаются в коде как запасной режим.
