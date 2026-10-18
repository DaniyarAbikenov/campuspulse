# CampusPulse database ERD

This diagram is the source-of-truth overview for the schema created by the first Alembic migration.
Column-level details and deletion behavior are documented in
[database-schema.md](database-schema.md).

```mermaid
erDiagram
    INSTITUTION o|--o{ USER : groups
    INSTITUTION ||--o{ SEMESTER : defines
    USER ||--o{ IDENTITY_ACCOUNT : authenticates_with
    USER ||--o{ AUTH_SESSION : opens
    USER ||--o{ USER_ROLE : receives
    ROLE ||--o{ USER_ROLE : grants
    USER o|--o{ AUDIT_EVENT : acts_in
    SEMESTER ||--o{ COURSE : contains
    USER ||--o{ ENROLLMENT : has
    COURSE ||--o{ ENROLLMENT : includes
    COURSE ||--o{ ASSIGNMENT : contains
    ASSIGNMENT ||--o{ ASSIGNMENT_RELATION : is_source
    ASSIGNMENT ||--o{ ASSIGNMENT_RELATION : is_target
    ASSIGNMENT ||--o{ TASK : breaks_into
    COURSE ||--o{ DOCUMENT : owns
    ASSIGNMENT o|--o{ DOCUMENT : references
    USER ||--o{ SCHEDULE_EVENT : schedules
    COURSE o|--o{ SCHEDULE_EVENT : contextualizes

    INSTITUTION {
        uuid id PK
        string name UK
        string shortName
        string timezoneName
    }
    USER {
        uuid id PK
        uuid institutionId FK "Nullable for platform users"
        string email UK
        string studentNumber "Unique inside institution"
        bool isActive
    }
    IDENTITY_ACCOUNT {
        uuid id PK
        uuid userId FK
        string provider "Part of unique provider-subject pair"
        string subject "Part of unique provider-subject pair"
        datetime lastLoginAt
    }
    AUTH_SESSION {
        uuid id PK
        uuid userId FK
        string refreshTokenHash UK
        datetime expiresAt
        datetime revokedAt
        datetime lastUsedAt
    }
    ROLE {
        uuid id PK
        string code UK
        string name
    }
    USER_ROLE {
        uuid id PK
        uuid userId FK
        uuid roleId FK
    }
    AUDIT_EVENT {
        uuid id PK
        uuid actorUserId FK "Nullable after user deletion"
        string action
        string resourceType
        uuid resourceId
        string outcome
        json contextData
        datetime occurredAt
    }
    SEMESTER {
        uuid id PK
        uuid institutionId FK
        string name
        date startsOn
        date endsOn
    }
    COURSE {
        uuid id PK
        uuid semesterId FK
        string code
        string name
        string instructorName
    }
    ENROLLMENT {
        uuid id PK
        uuid userId FK
        uuid courseId FK
    }
    ASSIGNMENT {
        uuid id PK
        uuid courseId FK
        string title
        datetime dueAt
        string status
        float estimatedHours
        int progress
    }
    ASSIGNMENT_RELATION {
        uuid id PK
        uuid sourceAssignmentId FK
        uuid targetAssignmentId FK
        string relationType
    }
    TASK {
        uuid id PK
        uuid assignmentId FK
        string title
        string status
        string priority
        float estimatedHours
    }
    DOCUMENT {
        uuid id PK
        uuid courseId FK
        uuid assignmentId FK "Nullable"
        string name
        string kind
        string storageKey
    }
    SCHEDULE_EVENT {
        uuid id PK
        uuid userId FK
        uuid courseId FK "Nullable"
        string title
        string kind
        datetime startsAt
        datetime endsAt
    }
```
