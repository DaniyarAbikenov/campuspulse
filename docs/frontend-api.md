# Frontend API map

All endpoints below require a CampusPulse bearer token. They are shaped around the current
CampusPulse prototype rather than forcing the frontend to join raw CRUD responses.

| Prototype page | Endpoint | Returned or performed data |
|---|---|---|
| My Schedule | `GET /api/v1/schedule?week_start=YYYY-MM-DD` | Week events, computed free slots, scheduled study hours, available hours and unscheduled work. |
| Free time this week | `GET /api/v1/schedule/free-time?week_start=YYYY-MM-DD` | Start, end and duration for each available slot. Availability respects the user's earliest start, latest end and daily study limit. |
| Courses | `GET /api/v1/courses/overview` | Course cards with assignment completion, remaining hours and next deadline. Supports `q`, `semester_id` and `has_open_assignments`. |
| Assignments | `GET /api/v1/assignments/overview` | Status-tab counts plus assignment rows with course identity, task/document counts and remaining hours. Supports `q`, `course_id`, repeated `assignment_status`, `due_from` and `due_to`. |
| Upload Assignment | `POST /api/v1/assignments/upload` | Multipart PDF, DOCX or TXT upload up to 20 MB. Atomically creates the assignment and linked document metadata. |
| Download document | `GET /api/v1/documents/{id}/download` | Streams an authorized uploaded file. |
| Kanban Board | `GET /api/v1/kanban` | Five columns, counts and estimated hours. Supports text, course, assignment, priority and completed filters. |
| Move Kanban card | `PATCH /api/v1/kanban/tasks/{id}/move` | Changes a task column. Generic task CRUD remains available for creating and editing cards. |
| My Workload | `GET /api/v1/workload?week_start=YYYY-MM-DD` | Required, available, overload, scheduled and unscheduled hours plus daily and course breakdowns. |
| Study Statistics | `GET /api/v1/statistics` | Reported completion hours, estimate accuracy and completed-assignment comparison rows. |
| AI Insights | `GET /api/v1/insights` | Recommendations with confidence, state, CTA label/action/style and action payload. Filter with `insight_status`. |
| Insight state | `PATCH /api/v1/insights/{id}` | Accepts, dismisses or snoozes a recommendation. |
| Apply insight | `POST /api/v1/insights/{id}/apply` | Executes its configured action transactionally: create a study session, import Kanban tasks or update an assignment. Reapplying is idempotent. |
| Configure insight | `POST /api/v1/insights` | Academic/platform administrator or future internal agent creates the recommendation, CTA and executable action. |
| Knowledge Base | `GET /api/v1/knowledge?course_id=` | Readable documents with indexed concepts, plus the cited fragments (page, concept, text, optional assignment and requirement id). |
| Campus Events | `GET /api/v1/campus-events` | Institution events ordered by start with the student's match percent, reason and saved flag. |
| Save event | `PATCH /api/v1/campus-events/{id}/save` | Sets `saved` for the current student; idempotent. |
| Agent Activity | `GET /api/v1/agent/activity?limit=` | The student's agent runs, newest first, each with its ordered tool calls (the reasoning trace). |
| Record agent run | `POST /api/v1/agent/runs` | Persists a run and its tool calls for the current user; used by the future agent and by frontend actions. |
| Settings | `GET /api/v1/settings`, `PATCH /api/v1/settings` | Profile, language, group, availability, proactive insight, task generation, anonymous statistics and notification settings. |

The existing raw CRUD endpoints remain available for detail views and direct edits. Uploaded files
are stored under the configured `CAMPUSPULSE_UPLOAD_DIRECTORY`; Docker persists the default
directory through the local `storage/` bind mount.
