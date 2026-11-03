import { customAgentPath, renderCustomAgentFile } from "@techgens/agents";
import { CI_JOBS, NODE_MAJOR, WEB_PORT } from "../constants";
import type { RenderContext } from "../context";
import type { RepoFile } from "../types";

function copilotInstructions(ctx: RenderContext): string {
  const standards = ctx.policies || "_No additional company standards have been defined yet._";
  return `# Copilot instructions: ${ctx.name}

${ctx.description || "_Product description pending._"}

${ctx.name} is built by ${ctx.companyName}, an AI-staffed product company running on Techgens. Techgens agents plan the
work as GitHub issues, Copilot cloud agent implements them as pull requests, and the CEO approves releases.

## Repository conventions

- **Branching:** \`${ctx.integrationBranch}\` is the integration branch and \`${ctx.defaultBranch}\` is production. Branch from
  \`${ctx.integrationBranch}\` and open feature and fix pull requests **into \`${ctx.integrationBranch}\`**. Only release pull
  requests go from \`${ctx.integrationBranch}\` into \`${ctx.defaultBranch}\`. Never push directly to either branch.
- **Pull requests:** one issue per pull request, small and focused. The pull request body must contain
  \`Fixes #<issue-number>\` and follow \`.github/pull_request_template.md\` (summary, testing evidence, checklist).
- **Tests are required:** every change ships with automated tests: Vitest unit and integration tests in \`test/\`, and
  Playwright end-to-end tests in \`e2e/\` for critical user journeys. Bug fixes start with a failing test.
- **Before you finish:** \`npm run lint\`, \`npm run typecheck\`, \`npm test\` and \`npm run build\` must pass. The required CI
  checks are \`${CI_JOBS.buildAndTest}\` and \`${CI_JOBS.dockerBuild}\`.
- **Documentation lives in \`docs/\`:** product (\`docs/product/\`), architecture and ADRs (\`docs/architecture/\`,
  \`docs/architecture/adr/\`), QA (\`docs/qa/\`), runbooks (\`docs/runbooks/\`) and release notes (\`docs/releases/\`).
  Update the docs when behaviour changes and record significant decisions as ADRs.
- **Infrastructure:** Azure Container Apps through azd (\`azure.yaml\`) and Bicep in \`infra/\` with pinned Azure Verified
  Modules. Deployments authenticate with OIDC. Never commit secrets or add credentials to workflows; configuration
  comes from environment variables, Key Vault or GitHub environments.

## Project layout

| Path | Purpose |
| --- | --- |
| \`src/server.ts\` | HTTP server (Node.js built-ins only); keep \`GET /health\` returning \`{ "status": "ok", "version" }\` |
| \`test/\` | Vitest tests |
| \`infra/\`, \`azure.yaml\` | Azure infrastructure (azd + Bicep) |
| \`.github/workflows/\` | CI, CodeQL, deployment and Copilot setup steps |
| \`docs/\` | Product and engineering documentation |

## Coding conventions

- TypeScript in strict mode, ES modules, Node.js ${NODE_MAJOR}. Relative imports include the \`.ts\` extension
  (\`import { x } from "./x.ts"\`); the build rewrites them to \`.js\`.
- Use only erasable TypeScript syntax (no \`enum\`, \`namespace\` or constructor parameter properties) so
  \`node src/server.ts\` keeps working.
- Log with the structured JSON \`log\` helper; never log secrets, tokens or personal data.
- Read configuration from environment variables; the server listens on \`PORT\` (default ${WEB_PORT}).
- Validate all input at the edge and return consistent JSON errors.

## Company engineering standards

${standards}
`;
}

const PULL_REQUEST_TEMPLATE = `## Summary

<!-- What changed and why? Keep pull requests small: one issue per pull request. -->

## Linked issue

Fixes #

## Testing evidence

<!-- Commands you ran and their results; screenshots or recordings for UI changes. -->

- [ ] \`npm run lint\`
- [ ] \`npm run typecheck\`
- [ ] \`npm test\`
- [ ] \`npm run build\`

## Checklist

- [ ] Targets the integration branch (only release pull requests target the default branch)
- [ ] Meets every acceptance criterion in the linked issue
- [ ] Automated tests added or updated
- [ ] Documentation updated in \`docs/\` (ADR for architectural decisions)
- [ ] No secrets, credentials or personal data in code, logs or fixtures
- [ ] Accessible (WCAG 2.2 AA) for user interface changes
`;

function dependabot(ctx: RenderContext): string {
  return `version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    target-branch: ${ctx.integrationBranch}
    open-pull-requests-limit: 5
    groups:
      development-dependencies:
        dependency-type: development
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
    target-branch: ${ctx.integrationBranch}
`;
}

const BUG_REPORT = `name: Bug report
description: Something is not working as expected
labels: ["bug"]
body:
  - type: textarea
    id: what-happened
    attributes:
      label: What happened?
      description: Steps to reproduce, expected behaviour and actual behaviour.
    validations:
      required: true
  - type: input
    id: version
    attributes:
      label: Version and environment
      description: The version reported by GET /health and the environment (staging or production).
  - type: textarea
    id: logs
    attributes:
      label: Relevant logs
      render: shell
`;

const STORY = `name: User story
description: A user-facing increment with acceptance criteria
labels: ["story"]
body:
  - type: textarea
    id: story
    attributes:
      label: User story
      placeholder: As a <persona>, I want <capability> so that <outcome>.
    validations:
      required: true
  - type: textarea
    id: acceptance-criteria
    attributes:
      label: Acceptance criteria
      placeholder: |
        Given ...
        When ...
        Then ...
    validations:
      required: true
  - type: textarea
    id: notes
    attributes:
      label: Notes, designs and links
`;

const ISSUE_CONFIG = `blank_issues_enabled: true
`;

/** Copilot configuration (instructions + custom agents for cloud-agent roles) and GitHub collaboration files. */
export function githubFiles(ctx: RenderContext): RepoFile[] {
  const agents = ctx.roles
    .filter((role) => role.executor === "cloud-agent")
    .map((role) => ({ path: customAgentPath(role.id), content: renderCustomAgentFile(role, ctx.policies) }));
  return [
    { path: ".github/copilot-instructions.md", content: copilotInstructions(ctx) },
    ...agents,
    { path: ".github/pull_request_template.md", content: PULL_REQUEST_TEMPLATE },
    { path: ".github/dependabot.yml", content: dependabot(ctx) },
    { path: ".github/ISSUE_TEMPLATE/bug_report.yml", content: BUG_REPORT },
    { path: ".github/ISSUE_TEMPLATE/story.yml", content: STORY },
    { path: ".github/ISSUE_TEMPLATE/config.yml", content: ISSUE_CONFIG },
  ];
}
