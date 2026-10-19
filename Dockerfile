# Production image for Cloud Run: TanStack Start SSR served by Nitro's node-server preset.
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile
COPY . .
# VITE_* values are inlined at build time.
ARG VITE_API_URL
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_ENABLE_DEMO_LOGIN=false
ENV NITRO_PRESET=node-server \
    VITE_API_URL=$VITE_API_URL \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_ENABLE_DEMO_LOGIN=$VITE_ENABLE_DEMO_LOGIN
RUN bun run build

FROM node:22-slim
WORKDIR /app
COPY --from=build /app/.output ./.output
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
