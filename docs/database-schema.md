# Database schema

The MVP schema has 15 tables split into identity, academic planning, content and audit domains.
Mutable domain entities use UUID primary keys plus `created_at` and `updated_at`. Session and audit
tables use explicit lifecycle timestamps instead. Values represented by Python enums are stored as
validated strings so SQLite development databases and PostgreSQL behave consistently.

## Identity and access foundation

| Table | Purpose | Main constraints and lifecycle |
|---|---|---|
| `institutions` | University or academic organization. | `name` is globally unique. |
| `users` | Product profile, separate from login identity. | Email is unique; student number is unique per institution; institution is nullable for platform users. Deleting an institution preserves users and clears their institution. |
| `identity_accounts` | Maps an external OIDC identity to a user. | `(provider, subject)` and `(user_id, provider)` are unique. Deleting a user deletes its identity mappings. No passwords or refresh tokens are stored. |
| `auth_sessions` | Revocable CampusPulse refresh sessions. | Only a SHA-256 refresh-token hash is stored. Refresh tokens rotate on use; expiry and revocation are indexed. Deleting a user deletes all sessions. |
| `roles` | Stable global role catalog. | `code` is unique. Initial codes are `student`, `academic_admin`, and `platform_admin`. |
| `user_roles` | Many-to-many role assignment. | `(user_id, role_id)` is unique. Both foreign keys cascade on deletion. |

Google ID tokens and CampusPulse session tokens are now verified. Roles are returned by `/auth/me`,
but permissions are not yet enforced on academic CRUD handlers.

## Academic planning

| Table | Purpose | Main constraints and lifecycle |
|---|---|---|
| `semesters` | Institution-specific academic periods. | Name is unique per institution; end date cannot precede start date. |
| `courses` | A course offering inside one semester. | Code is unique per semester. |
| `enrollments` | User membership in a course. | One row per `(user_id, course_id)`. |
| `assignments` | Course work with deadline, effort and progress. | Effort cannot be negative; progress is 0–100. |
| `assignment_relations` | Typed graph between assignments. | Supports `depends_on`, `extends`, and `related_to`; self-relations and duplicate typed edges are rejected. |
| `tasks` | Kanban-sized work item belonging to an assignment. | Effort cannot be negative; deleting the assignment deletes its tasks. |
| `schedule_events` | Student calendar entry, optionally linked to a course. | End must be after start; deleting a user deletes the event; deleting a course clears only the course link. |

## Content and audit

| Table | Purpose | Main constraints and lifecycle |
|---|---|---|
| `documents` | Metadata for assignment, lecture and syllabus files. | File bytes live outside the database; `storage_key` addresses them. Assignment link is optional and cleared when the assignment is deleted. |
| `audit_events` | Append-only record for future authentication and authorization activity. | Actor is optional and cleared after user deletion. Resource IDs are intentionally polymorphic and therefore have no foreign key. Application code must never update or delete audit rows. |

## Deletion strategy

Owned academic data cascades down the hierarchy: institution → semester → course → assignments →
tasks and relations. Identity mappings, role assignments, enrollments and a user's calendar entries
also cascade with their parent user. Optional historical context uses `SET NULL`, especially audit
actors, course links on events and assignment links on documents.

## Migration and seed ownership

- Alembic migrations are the only supported way to create or alter a persistent database.
- The API container runs `alembic upgrade head` before Uvicorn starts.
- `python -m app.seeds` installs deterministic demo records and can be run repeatedly without
  increasing row counts.
- Seed UUIDs are fixed so frontend fixtures and backend responses can refer to the same records.
