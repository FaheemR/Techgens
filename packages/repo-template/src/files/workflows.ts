import { ACTIONS, CI_JOBS, NODE_MAJOR, WEB_PORT, WORKFLOW_FILES } from "../constants";
import type { RenderContext } from "../context";
import type { RepoFile } from "../types";

const CHECKOUT = `      - name: Checkout code
        uses: ${ACTIONS.checkout}
`;

/** setup-node's npm cache is keyed on package-lock.json, so it switches on once a lockfile is committed. */
const SETUP_NODE = `      - name: Set up Node.js ${NODE_MAJOR}
        uses: ${ACTIONS.setupNode}
        with:
          node-version: ${NODE_MAJOR}
          cache: \${{ hashFiles('package-lock.json') != '' && 'npm' || '' }}
`;

const INSTALL = `      - name: Install dependencies
        run: |
          if [ -f package-lock.json ]; then
            npm ci --no-audit --no-fund
          else
            echo "::notice title=No package-lock.json::Using npm install; commit the generated package-lock.json."
            npm install --no-audit --no-fund
          fi
`;

function copilotSetupSteps(): string {
  return `name: Copilot Setup Steps

# Prepares the Copilot cloud agent environment before the agent starts working. Runs automatically when this file
# changes so the setup can be validated, and can be run manually from the Actions tab.
on:
  workflow_dispatch:
  push:
    paths:
      - ${WORKFLOW_FILES.copilotSetupSteps}
  pull_request:
    paths:
      - ${WORKFLOW_FILES.copilotSetupSteps}

jobs:
  # The job MUST be called \`copilot-setup-steps\` or Copilot cloud agent will not pick it up.
  copilot-setup-steps:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    # Lowest permissions needed by these steps; Copilot is given its own token for its work.
    permissions:
      contents: read
    steps:
${CHECKOUT}${SETUP_NODE}${INSTALL}      - name: Install Playwright browsers (once the project uses Playwright)
        run: |
          if grep -q '"@playwright/test"' package.json; then
            npx playwright install --with-deps chromium
          else
            echo "Playwright is not a dependency yet; skipping browser installation."
          fi
`;
}

function ci(ctx: RenderContext): string {
  return `name: ci

# Required status checks: ${CI_JOBS.buildAndTest}, ${CI_JOBS.dockerBuild} (check runs are named after each job's \`name:\`).
# No path filters: required checks must report on every pull request.
on:
  pull_request:
  push:
    branches:
      - ${ctx.integrationBranch}
      - ${ctx.defaultBranch}
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ci-\${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  ${CI_JOBS.buildAndTest}:
    name: ${CI_JOBS.buildAndTest}
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
${CHECKOUT}${SETUP_NODE}${INSTALL}      - name: Lint
        run: npm run lint
      - name: Type check
        run: npm run typecheck
      - name: Test
        run: npm test
      - name: Build
        run: npm run build

  ${CI_JOBS.dockerBuild}:
    name: ${CI_JOBS.dockerBuild}
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
${CHECKOUT}      - name: Build container image (no push)
        run: docker build --build-arg APP_VERSION="$GITHUB_SHA" --tag "${ctx.slug}:ci" .
      - name: Smoke test the container
        run: |
          docker run --detach --name app --publish ${WEB_PORT}:${WEB_PORT} "${ctx.slug}:ci"
          for attempt in $(seq 1 30); do
            if curl --fail --silent --show-error http://127.0.0.1:${WEB_PORT}/health; then
              echo
              exit 0
            fi
            echo "Waiting for the container (attempt $attempt)"
            sleep 1
          done
          docker logs app
          exit 1
`;
}

function codeql(ctx: RenderContext): string {
  return `name: codeql

on:
  pull_request:
  push:
    branches:
      - ${ctx.integrationBranch}
      - ${ctx.defaultBranch}
  workflow_dispatch:

permissions:
  contents: read

jobs:
  analyze:
    name: codeql
    # Code scanning is free for public repositories; private repositories need GitHub Code Security, so there the scan
    # runs only when the repository variable CODEQL_ENABLED is "true" ("false" opts a public repository out).
    if: vars.CODEQL_ENABLED == 'true' || (vars.CODEQL_ENABLED != 'false' && !github.event.repository.private)
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      actions: read
      contents: read
      security-events: write
    steps:
${CHECKOUT}      - name: Initialize CodeQL
        uses: ${ACTIONS.codeqlInit}
        with:
          languages: javascript-typescript
          build-mode: none
          queries: security-extended
      - name: Perform CodeQL analysis
        uses: ${ACTIONS.codeqlAnalyze}
        with:
          category: /language:javascript-typescript
`;
}

/** Copilot setup steps, CI and CodeQL workflows. */
export function workflowFiles(ctx: RenderContext): RepoFile[] {
  return [
    { path: WORKFLOW_FILES.copilotSetupSteps, content: copilotSetupSteps() },
    { path: WORKFLOW_FILES.ci, content: ci(ctx) },
    { path: WORKFLOW_FILES.codeql, content: codeql(ctx) },
  ];
}
