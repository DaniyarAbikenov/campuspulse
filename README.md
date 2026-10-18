# Pixel True Design Recreation

Implement exactly the screenshot and nothing else

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://pixel-true-design-recreation.lovable.app

## CampusPulse backend integration

The prototype reads its workspace from the local FastAPI service at
`http://127.0.0.1:8000/api/v1`. Copy `.env.example` to `.env` to override that URL. Start the
backend Compose stack and its seed data before running `bun run dev -- --host 127.0.0.1 --port
5173`. If the API is unavailable, the original in-browser fixtures remain available as a visual
fallback.

Local development uses the backend's hidden demo session endpoint. Production authentication stays
on the Google Identity flow and the demo endpoint is disabled by default in the backend settings.

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2728f8d3-304a-4c3a-a810-81996ddf67a3).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
