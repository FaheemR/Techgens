import { CI_JOBS, NODE_ENGINE, WEB_PORT } from "../constants";
import type { RenderContext } from "../context";
import type { RepoFile } from "../types";

function readme(ctx: RenderContext): string {
  return `# ${ctx.name}

${ctx.description || "_Product description pending._"}

> Built by **${ctx.companyName}**, an AI-staffed product company running on Techgens. AI agents plan the work as
> GitHub issues, Copilot cloud agent implements them as pull requests, and the CEO approves releases.

## Quick start

Requires Node.js ${NODE_ENGINE.replace(">=", "")} or later.

\`\`\`bash
npm install
npm run dev        # http://localhost:${WEB_PORT} (restarts on change)
npm test
\`\`\`

| Script | Purpose |
| --- | --- |
| \`npm run dev\` | Run \`src/server.ts\` directly with Node.js type stripping and watch mode |
| \`npm run build\` / \`npm start\` | Compile to \`dist/\` and run the compiled server |
| \`npm run lint\` | Lightweight lint: strict type check plus unused-code checks |
| \`npm run typecheck\` | TypeScript type check (\`tsc --noEmit\`) |
| \`npm test\` | Vitest unit and integration tests in \`test/\` |
| \`npm run test:e2e\` | Placeholder for Playwright end-to-end tests (\`e2e/\`) |

The server exposes \`GET /health\` (\`{ "status": "ok", "version": "..." }\`) and \`GET /\`, listens on \`PORT\`
(default ${WEB_PORT}) and writes structured JSON logs to stdout.

## Container

\`\`\`bash
docker build -t ${ctx.slug} .
docker run --rm -p ${WEB_PORT}:${WEB_PORT} ${ctx.slug}
curl http://localhost:${WEB_PORT}/health
\`\`\`

## How work flows

1. Work is tracked as issues (labels: \`epic\`, \`story\`, \`task\`, \`bug\`, \`priority: p0\`–\`p3\`).
2. Copilot cloud agent (custom agents in \`.github/agents/\`) opens a pull request into \`${ctx.integrationBranch}\` with
   \`Fixes #<issue>\`; CI (\`${CI_JOBS.buildAndTest}\`, \`${CI_JOBS.dockerBuild}\`) must pass before merge.
3. Every merge to \`${ctx.integrationBranch}\` deploys to the **staging** environment.
4. A release pull request from \`${ctx.integrationBranch}\` into \`${ctx.defaultBranch}\` is approved by the CEO; the
   **production** deployment then waits for the CEO's approval in the \`production\` GitHub environment.

## Azure

Infrastructure is code: \`azure.yaml\` (Azure Developer CLI) and Bicep in \`infra/\` using pinned Azure Verified Modules
(Container Apps, Container Registry, Log Analytics + Application Insights, Key Vault, user-assigned managed identity).
GitHub Actions signs in to Azure with OpenID Connect; no cloud secrets are stored in GitHub. Each GitHub environment
(\`staging\`, \`production\`) needs these environment variables, which the Techgens Azure connection wizard creates:
\`AZURE_CLIENT_ID\`, \`AZURE_TENANT_ID\`, \`AZURE_SUBSCRIPTION_ID\`, \`AZURE_LOCATION\`, \`AZURE_ENV_NAME\` and optionally
\`AZURE_RESOURCE_GROUP\`. Until \`AZURE_CLIENT_ID\` is set, deployment jobs are skipped with a notice.

To deploy from your machine: \`azd auth login\` then \`azd up\`.

## Documentation

Product, architecture (including ADRs), QA, runbooks and release notes live in [\`docs/\`](docs/README.md).
Repository: ${ctx.repoUrl}
`;
}

const GITIGNORE = `node_modules/
dist/
coverage/
*.tsbuildinfo
*.log
.env
.env.*
!.env.example
.azure/
playwright-report/
test-results/
.DS_Store
`;

const EDITORCONFIG = `root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
`;

/** README and editor/VCS hygiene files. */
export function repoFiles(ctx: RenderContext): RepoFile[] {
  return [
    { path: "README.md", content: readme(ctx) },
    { path: ".gitignore", content: GITIGNORE },
    { path: ".editorconfig", content: EDITORCONFIG },
  ];
}
