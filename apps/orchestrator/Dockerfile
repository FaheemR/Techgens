# syntax=docker/dockerfile:1
# Techgens orchestrator (API + agent workers). Build from the repository root:
#   docker build -f apps/orchestrator/Dockerfile -t techgens-orchestrator .
FROM node:24-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates git tini \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@12.16.1

WORKDIR /app
COPY . .
# Installs the orchestrator and its workspace packages, including the platform package of the Copilot SDK runtime.
RUN pnpm install --frozen-lockfile --filter "@techgens/orchestrator..." \
 && useradd --create-home --uid 10001 techgens \
 && mkdir -p /data && chown -R techgens:techgens /data

USER 10001
ENV NODE_ENV=production \
    TECHGENS_DATA_DIR=/data \
    HOST=0.0.0.0 \
    PORT=4000
EXPOSE 4000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
WORKDIR /app/apps/orchestrator
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["./node_modules/.bin/tsx", "src/main.ts"]
