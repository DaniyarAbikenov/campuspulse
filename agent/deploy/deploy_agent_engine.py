"""Deploy the CampusPulse agent to Vertex AI Agent Engine.

    python deploy/deploy_agent_engine.py --project P --location us-central1 \\
        --staging-bucket gs://P-campuspulse-staging \\
        --backend-url https://campuspulse-api-xxxx.run.app/api/v1 \\
        --moodle-mcp-url https://campuspulse-moodle-mcp-xxxx.run.app/mcp

Requires `pip install -e '.[deploy]'` and `gcloud auth application-default login`.
Prints the Agent Engine resource name to put into CAMPUSPULSE_AGENT_RESOURCE on the backend.
"""

import argparse
import os
import shutil
import tempfile
from importlib.metadata import version
from pathlib import Path

import vertexai
from vertexai import agent_engines
from vertexai.preview.reasoning_engines import AdkApp

from campuspulse_agent.agent import build_agent
from campuspulse_agent.config import Settings


def pinned_requirements() -> list[str]:
    """Pin the runtime to the versions the agent was pickled with, so both sides match."""
    pins = ["google-adk", "mcp", "httpx", "pydantic", "pydantic-settings", "cloudpickle"]
    return [
        f"google-cloud-aiplatform[agent_engines,adk]=={version('google-cloud-aiplatform')}",
        *[f"{name}=={version(name)}" for name in pins],
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--location", default="us-central1")
    parser.add_argument("--staging-bucket", required=True)
    parser.add_argument("--backend-url", required=True, help="Public HTTPS CampusPulse API URL")
    parser.add_argument("--moodle-mcp-url", default="", help="Public HTTPS Moodle MCP URL")
    parser.add_argument(
        "--mcp-key-secret",
        default="",
        help="Secret Manager secret holding the Moodle MCP API key (read at runtime, not stored)",
    )
    parser.add_argument("--model", default="gemini-2.5-flash")
    parser.add_argument("--display-name", default="campuspulse-agent")
    parser.add_argument("--update", help="Resource name of an existing engine to update")
    parser.add_argument("--min-instances", type=int, default=0, help="0 = scale to zero (cheapest)")
    parser.add_argument("--max-instances", type=int, default=3)
    parser.add_argument("--cpu", default="1")
    parser.add_argument("--memory", default="2Gi")
    args = parser.parse_args()

    vertexai.init(project=args.project, location=args.location, staging_bucket=args.staging_bucket)
    settings = Settings(
        agent_model=args.model,
        backend_url=args.backend_url,
        moodle_mcp_url=args.moodle_mcp_url or None,
    )
    app = AdkApp(agent=build_agent(settings), enable_tracing=True)
    options = {
        "requirements": pinned_requirements(),
        # The archive must contain `campuspulse_agent/` at its top level to be importable remotely.
        "extra_packages": ["campuspulse_agent"],
        "env_vars": {
            "CAMPUSPULSE_AGENT_MODEL": args.model,
            "CAMPUSPULSE_BACKEND_URL": args.backend_url,
            **({"CAMPUSPULSE_MOODLE_MCP_URL": args.moodle_mcp_url} if args.moodle_mcp_url else {}),
            **(
                {
                    "CAMPUSPULSE_MOODLE_MCP_TOKEN": {
                        "secret": args.mcp_key_secret,
                        "version": "latest",
                    }
                }
                if args.mcp_key_secret
                else {}
            ),
        },
        "display_name": args.display_name,
        # Keep the cost predictable: scale to zero and cap the size of each instance.
        "min_instances": args.min_instances,
        "max_instances": args.max_instances,
        "resource_limits": {"cpu": args.cpu, "memory": args.memory},
    }
    source = Path(__file__).resolve().parents[1] / "src" / "campuspulse_agent"
    with tempfile.TemporaryDirectory() as staging:
        shutil.copytree(
            source,
            Path(staging) / "campuspulse_agent",
            ignore=shutil.ignore_patterns("__pycache__"),
        )
        previous = os.getcwd()
        os.chdir(staging)
        try:
            remote = (
                agent_engines.update(resource_name=args.update, agent_engine=app, **options)
                if args.update
                else agent_engines.create(app, **options)
            )
        finally:
            os.chdir(previous)
    print(remote.resource_name)


if __name__ == "__main__":
    main()
