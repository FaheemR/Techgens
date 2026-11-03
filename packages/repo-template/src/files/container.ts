import { NODE_MAJOR, WEB_PORT } from "../constants";
import type { RenderContext } from "../context";
import type { RepoFile } from "../types";

const DOCKERFILE = `# syntax=docker/dockerfile:1
# Multi-stage build: compile TypeScript with dev dependencies, ship only runtime files as a non-root user.
ARG NODE_VERSION=${NODE_MAJOR}

FROM node:\${NODE_VERSION}-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
# npm ci needs a committed package-lock.json; fall back to npm install until one exists.
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:\${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production \\
    PORT=${WEB_PORT}
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# Reported by GET /health; CI and azd pass the commit SHA.
ARG APP_VERSION=dev
ENV APP_VERSION=\${APP_VERSION}
USER node
EXPOSE ${WEB_PORT}
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \\
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || ${WEB_PORT}) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/server.js"]
`;

const DOCKERIGNORE = `**/node_modules
**/dist
**/coverage
.git
.github
.azure
.vscode
docs
infra
test
e2e
playwright-report
test-results
*.log
.env
.env.*
azure.yaml
`;

/** Container image definition (also used by azd to build the image deployed to Azure Container Apps). */
export function containerFiles(_ctx: RenderContext): RepoFile[] {
  return [
    { path: "Dockerfile", content: DOCKERFILE },
    { path: ".dockerignore", content: DOCKERIGNORE },
  ];
}
