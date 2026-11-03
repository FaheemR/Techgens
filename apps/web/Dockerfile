# syntax=docker/dockerfile:1
# Techgens Command Center (Next.js, standalone output). Build from the repository root:
#   docker build -f apps/web/Dockerfile -t techgens-web .
FROM node:24-bookworm-slim AS build
RUN npm install -g pnpm@12.16.1
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter "@techgens/web..."
# The browser talks to the orchestrator directly; this URL is inlined at build time.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @techgens/web build \
 && mkdir -p apps/web/public

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
