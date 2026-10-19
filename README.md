# CampusPulse MCP

MCP (Model Context Protocol) servers that give the CampusPulse agent controlled access to the
systems a student already uses. The first server is **Moodle**; GitHub and filesystem servers
from the hackathon stack are consumed as-is and described in [`docs/design.md`](docs/design.md).

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

## Security notes

- Token only goes to the configured Moodle host; file downloads to any other host are refused.
- Moodle text (assignment intros, file contents) is untrusted. Tool output is marked as data and
  the server instructions tell the model not to follow instructions found in it.
- Errors never include the token. Downloads are capped by `CAMPUSPULSE_MAX_FILE_BYTES`.
