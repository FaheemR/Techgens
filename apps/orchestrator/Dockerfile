# syntax=docker/dockerfile:1
# Techgens orchestrator (API + agent workers).
# Prebuilt image: ghcr.io/<owner>/techgens-orchestrator (see docker-compose.yml). To build it yourself from the
# repository root:  docker build -f apps/orchestrator/Dockerfile -t techgens-orchestrator .
# On networks that block the public npm registry, build through your organisation's npm mirror with
#   --build-arg NPM_REGISTRY=https://<mirror>/   and put its CA certificate(s) in docker/certs/*.crt if needed.
FROM node:24-bookworm-slim

ARG NPM_REGISTRY=
WORKDIR /app
COPY . .
# Installs the orchestrator and its workspace packages, including the platform package of the Copilot SDK runtime.
RUN set -eu; \
    if [ -n "$NPM_REGISTRY" ]; then printf 'registry=%s\n' "$NPM_REGISTRY" > "$HOME/.npmrc"; fi; \
    if ls docker/certs/*.crt >/dev/null 2>&1; then cat docker/certs/*.crt > /tmp/extra-ca.pem; export NODE_EXTRA_CA_CERTS=/tmp/extra-ca.pem; fi; \
    npm install -g pnpm@12.16.1; \
    pnpm install --frozen-lockfile --filter "@techgens/orchestrator..."; \
    rm -f "$HOME/.npmrc" /tmp/extra-ca.pem; \
    useradd --create-home --uid 10001 techgens; \
    mkdir -p /data; \
    chown -R techgens:techgens /data

USER 10001
ENV NODE_ENV=production \
    TECHGENS_DATA_DIR=/data \
    HOST=0.0.0.0 \
    PORT=4000
EXPOSE 4000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
WORKDIR /app/apps/orchestrator
# Run with an init process (docker-compose.yml sets `init: true`) so agent runtime child processes are reaped.
CMD ["./node_modules/.bin/tsx", "src/main.ts"]
