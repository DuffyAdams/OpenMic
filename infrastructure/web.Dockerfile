# syntax=docker/dockerfile:1.7
# Builds the SvelteKit app and serves it with Caddy, which also proxies /api to the API
# container and handles HTTPS certificates automatically. Build context: repository root.
FROM node:22-alpine AS build
WORKDIR /web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps/web/ ./
RUN npm run build

FROM caddy:2.10-alpine
COPY infrastructure/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /web/build /srv
