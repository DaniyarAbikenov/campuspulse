#!/usr/bin/env bash
# Run the agent locally as an ADK API server for the CampusPulse backend (mode "adk_server").
#
# Needs: `gcloud auth application-default login`, the project's Vertex AI access, and the
# backend running on http://127.0.0.1:8000. The Moodle MCP key is read from Secret Manager into
# this process only; it is never written to disk.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="${GOOGLE_CLOUD_PROJECT:-project-474b28ac-4d07-464f-a44}"
export GOOGLE_GENAI_USE_VERTEXAI=TRUE
export GOOGLE_CLOUD_PROJECT="$PROJECT"
export GOOGLE_CLOUD_LOCATION="${GOOGLE_CLOUD_LOCATION:-us-central1}"
export CAMPUSPULSE_BACKEND_URL="${CAMPUSPULSE_BACKEND_URL:-http://127.0.0.1:8000/api/v1}"
export CAMPUSPULSE_MOODLE_MCP_URL="${CAMPUSPULSE_MOODLE_MCP_URL:-}"
if [[ -n "$CAMPUSPULSE_MOODLE_MCP_URL" ]]; then
  CAMPUSPULSE_MOODLE_MCP_TOKEN="$(gcloud secrets versions access latest --secret mcp-api-key --project "$PROJECT")"
  export CAMPUSPULSE_MOODLE_MCP_TOKEN
fi

exec "${ADK:-adk}" api_server src --host 127.0.0.1 --port "${PORT:-8002}"
