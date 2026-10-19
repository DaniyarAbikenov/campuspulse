# CampusPulse MCP

MCP (Model Context Protocol) servers that give the CampusPulse agent controlled access to the
systems a student already uses. The first server is **Moodle**; GitHub and filesystem servers
from the hackathon stack are consumed as-is and described in [`docs/design.md`](docs/design.md).

The server is used by the CampusPulse agent ([`agent`](../agent))
over MCP streamable HTTP, and by any MCP client over stdio. Part of the CampusPulse system:
[frontend](../frontend) · [backend](../backend) · [agent](../agent) · this module.

Everything here is **read-only**: the agent can look at courses, deadlines and materials but can
never submit work, change grades or write to Moodle.

## Moodle tools

| Tool | Moodle web-service function | Purpose |
|---|---|---|
| `moodle_site_info` | `core_webservice_get_site_info` | Site, release and token owner |
| `moodle_list_courses` | `core_enrol_get_users_courses` | Enrolled courses and progress |
| `moodle_get_course_contents` | `core_course_get_contents` | Sections and activities |
| `moodle_list_course_files` | `core_course_get_contents` | Downloadable materials |
| `moodle_list_assignments` | `mod_assign_get_assignments` | Assignments, plain text, due dates |
| `moodle_get_submission_status` | `mod_assign_get_submission_status` | New, drafted, submitted, graded |
| `moodle_get_calendar_events` | `core_calendar_get_action_events_by_timesort` | Upcoming deadlines |
| `moodle_read_file` | pluginfile download | Small text files only |

## Moodle setup

1. Site administration → Server → Web services → enable web services and the REST protocol.
2. Create an external service (or use *Moodle mobile web service*) that includes the functions
   above, and a user with the *Create a web service token* capability.
3. Create a token for the student account under Manage tokens.
4. `cp .env.example .env` and set `CAMPUSPULSE_MOODLE_URL` and `CAMPUSPULSE_MOODLE_TOKEN`.
   The token is a secret: never commit it, paste it into chat or log it.

## Run

```bash
python3.12 -m venv .venv && source .venv/bin/activate
pip install -e '.[dev]'
python -m campuspulse_mcp                      # stdio, for local agents and MCP inspectors
CAMPUSPULSE_MCP_TRANSPORT=streamable-http python -m campuspulse_mcp   # http://127.0.0.1:8001/mcp
```

Claude Code / any MCP client (stdio):

```json
{ "mcpServers": { "moodle": { "command": "/abs/path/.venv/bin/python",
  "args": ["-m", "campuspulse_mcp"], "env": { "CAMPUSPULSE_MOODLE_URL": "...",
  "CAMPUSPULSE_MOODLE_TOKEN": "..." } } } }
```

### HTTP transport and authentication

With `CAMPUSPULSE_MCP_TRANSPORT=streamable-http` the server **requires** a shared secret:
set `CAMPUSPULSE_MCP_API_KEY` and clients send `Authorization: Bearer <key>`; without a key the
server refuses to start over HTTP. The deployed agent reads the key from Secret Manager at run
time (never baked into the agent). A request without the key gets `401`.

| Variable | Purpose | Default |
|---|---|---|
| `CAMPUSPULSE_MOODLE_URL`, `CAMPUSPULSE_MOODLE_TOKEN` | Moodle site and web-service token | required |
| `CAMPUSPULSE_MCP_TRANSPORT` | `stdio` or `streamable-http` | `stdio` |
| `CAMPUSPULSE_MCP_HOST`, `CAMPUSPULSE_MCP_PORT` | HTTP bind address | `127.0.0.1`, `8001` |
| `CAMPUSPULSE_MCP_API_KEY` | Bearer key for HTTP clients | required over HTTP |
| `CAMPUSPULSE_MAX_FILE_BYTES` | Cap for `moodle_read_file` | `2000000` |
| `CAMPUSPULSE_BACKEND_URL`, `CAMPUSPULSE_BACKEND_TOKEN` | Target of the sync CLI | local backend |

## Deploy to Cloud Run

```bash
gcloud run deploy campuspulse-moodle-mcp --source . --region REGION --allow-unauthenticated \
  --set-env-vars CAMPUSPULSE_MOODLE_URL=https://<moodle>,CAMPUSPULSE_MCP_TRANSPORT=streamable-http,CAMPUSPULSE_MCP_HOST=0.0.0.0 \
  --set-secrets CAMPUSPULSE_MOODLE_TOKEN=moodle-token:latest,CAMPUSPULSE_MCP_API_KEY=mcp-api-key:latest
```

`--allow-unauthenticated` only lifts Cloud Run's own IAM check; access is still guarded by the
bearer key above. The MCP endpoint is `https://<service-url>/mcp`. Connect it to the agent with
`--moodle-mcp-url` when deploying the agent (see the agent's `docs/deployment.md`).

## Import into CampusPulse

```bash
CAMPUSPULSE_BACKEND_DEMO_LOGIN=true python -m campuspulse_mcp.sync   # local dev
```

`campuspulse-moodle-sync` reads Moodle assignments and posts an **import proposal** to the
CampusPulse backend. Nothing is created until the student reviews it in the app (Assignments →
Import from Moodle), picks the target course and estimate, and approves. Repeated syncs skip
assignments that were already imported. Use `CAMPUSPULSE_BACKEND_TOKEN` with the student's access
token outside local development.

## Checks

```bash
pytest && ruff check src tests && mypy src
```

Tests run against a mocked Moodle (`httpx.MockTransport`), including the MCP tool registry.

## Layout

```text
src/campuspulse_mcp/
  server.py          FastMCP tool registry, bearer-key middleware, transports
  moodle/            REST client, typed models, tool services
  sync.py            campuspulse-moodle-sync CLI (posts import proposals)
docs/design.md       MCP layer design and the hackathon MCP stack
docs/moodle-seed/    sample assignments and lecture notes for a test Moodle
Dockerfile           production image
```

## Known limits

- One Moodle token serves everyone who can reach the server; per-student tokens are not built yet.
- Only a test Moodle (`moodlecloud`) has been connected; the university LMS needs its own token.
- Files are read as text only (small text files); other formats are listed but not ingested.

## Security notes

- Token only goes to the configured Moodle host; file downloads to any other host are refused.
- Moodle text (assignment intros, file contents) is untrusted. Tool output is marked as data and
  the server instructions tell the model not to follow instructions found in it.
- Errors never include the token. Downloads are capped by `CAMPUSPULSE_MAX_FILE_BYTES`.
