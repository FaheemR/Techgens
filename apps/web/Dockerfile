# syntax=docker/dockerfile:1
# Techgens Command Center (Next.js, standalone output).
# Prebuilt image: ghcr.io/<owner>/techgens-web (see docker-compose.yml). To build it yourself from the repository
# root:  docker build -f apps/web/Dockerfile -t techgens-web .
# On networks that block the public npm registry, build through your organisation's npm mirror with
#   --build-arg NPM_REGISTRY=https://<mirror>/   and put its CA certificate(s) in docker/certs/*.crt if needed.
FROM node:24-bookworm-slim AS build
ARG NPM_REGISTRY=
# Empty = the browser calls this web app's /api proxy (recommended). Set only to call an orchestrator directly.
ARG NEXT_PUBLIC_API_URL=
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY . .
RUN set -eu; \
    if [ -n "$NPM_REGISTRY" ]; then printf 'registry=%s\n' "$NPM_REGISTRY" > "$HOME/.npmrc"; fi; \
    if ls docker/certs/*.crt >/dev/null 2>&1; then cat docker/certs/*.crt > /tmp/extra-ca.pem; export NODE_EXTRA_CA_CERTS=/tmp/extra-ca.pem; fi; \
    npm install -g pnpm@12.16.1; \
    pnpm install --frozen-lockfile --filter "@techgens/web..."; \
    pnpm --filter @techgens/web build; \
    mkdir -p apps/web/public; \
    rm -f "$HOME/.npmrc" /tmp/extra-ca.pem

FROM node:24-bookworm-slim
WORKDIR /app
# Where the /api proxy forwards requests (server-side, read at runtime).
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    ORCHESTRATOR_URL=http://localhost:4000
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
