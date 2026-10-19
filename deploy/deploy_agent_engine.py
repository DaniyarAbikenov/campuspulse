"""Deploy the CampusPulse agent to Vertex AI Agent Engine.

    python deploy/deploy_agent_engine.py --project P --location us-central1 \\
        --staging-bucket gs://P-campuspulse-staging \\
        --backend-url https://campuspulse-api-xxxx.run.app/api/v1 \\
        --moodle-mcp-url https://campuspulse-moodle-mcp-xxxx.run.app/mcp

Requires `pip install -e '.[deploy]'` and `gcloud auth application-default login`.
Prints the Agent Engine resource name to put into CAMPUSPULSE_AGENT_RESOURCE on the backend.
"""

import argparse

import vertexai
from vertexai import agent_engines
from vertexai.preview.reasoning_engines import AdkApp

from campuspulse_agent.agent import build_agent
from campuspulse_agent.config import Settings


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--location", default="us-central1")
    parser.add_argument("--staging-bucket", required=True)
    parser.add_argument("--backend-url", required=True, help="Public HTTPS CampusPulse API URL")
    parser.add_argument("--moodle-mcp-url", default="", help="Public HTTPS Moodle MCP URL")
    parser.add_argument("--model", default="gemini-2.5-flash")
    parser.add_argument("--display-name", default="campuspulse-agent")
    parser.add_argument("--update", help="Resource name of an existing engine to update")
    args = parser.parse_args()

    vertexai.init(project=args.project, location=args.location, staging_bucket=args.staging_bucket)
    settings = Settings(
        agent_model=args.model,
        backend_url=args.backend_url,
        moodle_mcp_url=args.moodle_mcp_url or None,
    )
    app = AdkApp(agent=build_agent(settings), enable_tracing=True)
    options = {
        "requirements": [
            "google-cloud-aiplatform[agent_engines,adk]",
            "httpx",
            "mcp>=1.9,<2",
            "pydantic-settings",
        ],
        "extra_packages": ["src/campuspulse_agent"],
        "env_vars": {
            "CAMPUSPULSE_AGENT_MODEL": args.model,
            "CAMPUSPULSE_BACKEND_URL": args.backend_url,
            "CAMPUSPULSE_MOODLE_MCP_URL": args.moodle_mcp_url,
        },
        "display_name": args.display_name,
    }
    remote = (
        agent_engines.update(resource_name=args.update, agent_engine=app, **options)
        if args.update
        else agent_engines.create(app, **options)
    )
    print(remote.resource_name)


if __name__ == "__main__":
    main()
