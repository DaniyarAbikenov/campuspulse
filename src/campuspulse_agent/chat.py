"""Run the agent locally from the terminal (needs Gemini access and the backend running).

python -m campuspulse_agent.chat "What is due this week?" --token <student access token>
"""

import argparse
import asyncio
import uuid

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from campuspulse_agent.agent import build_agent
from campuspulse_agent.campuspulse_tools import TOKEN_KEY

APP_NAME = "campuspulse"


async def ask(message: str, token: str, user_id: str = "local-student") -> None:
    sessions = InMemorySessionService()
    session_id = str(uuid.uuid4())
    await sessions.create_session(
        app_name=APP_NAME, user_id=user_id, session_id=session_id, state={TOKEN_KEY: token}
    )
    runner = Runner(agent=build_agent(), app_name=APP_NAME, session_service=sessions)
    content = types.Content(role="user", parts=[types.Part(text=message)])
    async for event in runner.run_async(
        user_id=user_id, session_id=session_id, new_message=content
    ):
        for call in event.get_function_calls():
            print(f"  → {call.name}({dict(call.args or {})})")
        for result in event.get_function_responses():
            print(f"  ← {result.name}")
        if event.is_final_response() and event.content and event.content.parts:
            print("".join(part.text or "" for part in event.content.parts))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("message")
    parser.add_argument("--token", required=True, help="CampusPulse access token of the student")
    args = parser.parse_args()
    asyncio.run(ask(args.message, args.token))


if __name__ == "__main__":
    main()
