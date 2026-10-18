# Authorization

Google authenticates the person. CampusPulse then authorizes each API operation using the local
user, role assignments, institution membership, course enrollments and resource ownership. Every
academic CRUD route requires a valid CampusPulse bearer access token.

## Roles and scope

| Resource | Student | Academic admin | Platform admin |
|---|---|---|---|
| Institutions | Read | Read | Full access |
| Users | Read self | Read and manage users in own institution | Full access |
| Semesters and courses | Read enrolled courses and their semester | Manage own institution | Full access |
| Enrollments | Read own | Manage own institution | Full access |
| Assignments | Manage own assignments in enrolled courses | Manage own institution | Full access |
| Assignment relations and tasks | Inherit assignment access | Inherit assignment access | Full access |
| Documents | Manage metadata in enrolled courses, with owned assignment links | Manage own institution | Full access |
| Schedule events | Manage own calendar | Manage own institution | Full access |

List endpoints filter out inaccessible records. Direct reads and mutations return `404` when the
resource exists outside the caller's scope, so the API does not reveal its existence. Creation of a
known but forbidden resource type returns `403`.

Assignment status, progress, effort and Kanban tasks are student-specific. Therefore each assignment
has an `owner_user_id`; a student-created assignment is assigned to the current user automatically.
Administrative creation must name the owner explicitly.

## Onboarding

The first Google login creates an active user with the `student` role and no institution. The user
then calls `POST /api/v1/auth/onboarding` once with an institution, student number, program and
initial course IDs. The backend checks that every selected course belongs to that institution and
creates the enrollments atomically.

Role assignment itself is intentionally not exposed as generic CRUD. Initial administrative roles
must be provisioned through trusted database operations until a dedicated administration workflow
is implemented.
