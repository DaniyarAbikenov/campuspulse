# Deploying CampusPulse on Google Cloud

Order matters: the agent needs public URLs for the backend and the Moodle MCP server.

```
Firebase Hosting / Cloud Run (frontend) → Cloud Run (backend) → Cloud SQL (PostgreSQL)
                                                  ↓ Vertex AI SDK
                                       Agent Engine (ADK agent + Gemini)
                                                  ↓ HTTPS
                       Cloud Run (backend API)   Cloud Run (Moodle MCP) → Moodle
```

Replace `PROJECT`, `REGION` (for example `us-central1`) below.

## 0. One-time setup

```bash
gcloud auth login && gcloud auth application-default login
gcloud config set project PROJECT
gcloud services enable aiplatform.googleapis.com run.googleapis.com sqladmin.googleapis.com \
  secretmanager.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
gsutil mb -l REGION gs://PROJECT-campuspulse-staging
```

## 1. Secrets

Store secrets in Secret Manager, never in the repository or in environment files that are committed:
`campuspulse-jwt-secret` (32+ random bytes), `moodle-token`, `database-url`.

## 2. Moodle MCP server (Cloud Run)

```bash
cd campuspulse-mcp
gcloud run deploy campuspulse-moodle-mcp --source . --region REGION --allow-unauthenticated \
  --set-env-vars CAMPUSPULSE_MOODLE_URL=https://YOUR-MOODLE \
  --set-secrets CAMPUSPULSE_MOODLE_TOKEN=moodle-token:latest
```

For the hackathon demo the service is public but read-only; for anything real, remove
`--allow-unauthenticated` and let the agent send an identity token
(`CAMPUSPULSE_MOODLE_MCP_TOKEN`).

## 3. Backend (Cloud Run + Cloud SQL)

```bash
gcloud sql instances create campuspulse-db --database-version=POSTGRES_17 --region REGION --tier=db-f1-micro
cd campuspulse-backend
gcloud run deploy campuspulse-api --source . --region REGION --allow-unauthenticated \
  --add-cloudsql-instances PROJECT:REGION:campuspulse-db \
  --set-env-vars CAMPUSPULSE_GOOGLE_CLIENT_ID=OAUTH_CLIENT_ID,CAMPUSPULSE_CORS_ORIGINS='["https://FRONTEND"]' \
  --set-secrets CAMPUSPULSE_JWT_SECRET=campuspulse-jwt-secret:latest,CAMPUSPULSE_DATABASE_URL=database-url:latest
```

The container runs `alembic upgrade head` before starting. Leave `CAMPUSPULSE_ENABLE_DEMO_AUTH` unset.

## 4. Agent Engine

```bash
cd campuspulse-agent && pip install -e '.[deploy]'
python deploy/deploy_agent_engine.py --project PROJECT --location REGION \
  --staging-bucket gs://PROJECT-campuspulse-staging \
  --backend-url https://BACKEND-URL/api/v1 --moodle-mcp-url https://MOODLE-MCP-URL/mcp
```

Then update the backend service:

```bash
gcloud run services update campuspulse-api --region REGION \
  --update-env-vars CAMPUSPULSE_AGENT_MODE=vertex,CAMPUSPULSE_AGENT_PROJECT=PROJECT,\
CAMPUSPULSE_AGENT_LOCATION=REGION,CAMPUSPULSE_AGENT_RESOURCE=projects/PROJECT/locations/REGION/reasoningEngines/ID
```

The backend's service account needs `roles/aiplatform.user`.

## 5. Frontend

Build with `VITE_API_URL=https://BACKEND-URL/api/v1` and `VITE_GOOGLE_CLIENT_ID=OAUTH_CLIENT_ID`,
then deploy to Firebase Hosting or Cloud Run, and add its origin to the backend CORS list and the
OAuth client's authorised JavaScript origins.

## Smoke test

1. Open the app, sign in with Google.
2. Ask "What is due this week?" — the chat shows tool calls (`list_assignments`, …) and an answer.
3. Ask "Import my Moodle assignments" — a proposal appears under Assignments; nothing is created
   until you approve.

## Lessons from the first deployment

- **Package layout.** `extra_packages` archives are extracted as-is, so the deploy script stages
  `campuspulse_agent/` at the archive root; passing `src/campuspulse_agent` makes the import fail
  and Agent Engine only reports "failed to deploy" with no logs.
- **Pin versions.** The script pins the runtime requirements to the versions installed locally.
- **No empty env vars.** Agent Engine rejects `""`; optional variables are omitted instead.
- **Secrets.** Pass `--mcp-key-secret mcp-api-key`. The Reasoning Engine service agent
  (`service-PROJECT_NUMBER@gcp-sa-aiplatform-re.iam.gserviceaccount.com`) needs
  `roles/secretmanager.secretAccessor` on that secret, and it only exists after the first
  deployment attempt, so a first run may fail with PERMISSION_DENIED.
- **MCP auth at runtime.** The MCP key is read from the environment on every call
  (`header_provider`), never baked into the pickled agent.
- **zsh.** Write `${PROJECT}:us-central1:db`, not `$PROJECT:us-central1:db` (`:u` upper-cases).

## Current deployment (project-474b28ac-4d07-464f-a44, us-central1)

| Component | Identifier |
|---|---|
| Backend | Cloud Run `campuspulse-api` |
| Moodle MCP | Cloud Run `campuspulse-moodle-mcp` (API key required) |
| Database | Cloud SQL `campuspulse-db` (Postgres 17, db-f1-micro, no backups) |
| Agent | Agent Engine `projects/694651486934/locations/us-central1/reasoningEngines/2986893980475588608` |
| Seed | Cloud Run job `campuspulse-seed` |
| Secrets | `campuspulse-jwt-secret`, `campuspulse-database-url`, `campuspulse-db-password`, `moodle-token`, `mcp-api-key` |

Tear down when finished: `gcloud run services delete campuspulse-api campuspulse-moodle-mcp`,
`gcloud run jobs delete campuspulse-seed`, `gcloud sql instances delete campuspulse-db`, and delete
the Agent Engine from the console or REST API.
