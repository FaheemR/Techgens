import {
  ACTIONS,
  AVM_MODULES,
  AVM_VERIFIED_ON,
  DEPLOY_JOBS,
  NODE_MAJOR,
  PACKAGE_VERSIONS,
} from "../constants";
import type { RenderContext } from "../context";
import type { RepoFile } from "../types";

function docsIndex(ctx: RenderContext): string {
  return `# Documentation

Product and engineering documentation for ${ctx.name}, versioned with the code. Techgens publishes approved documents
to these folders automatically.

| Folder | Contents | Techgens document kinds |
| --- | --- | --- |
| [product/](product/README.md) | Charter, roadmap, research, PRDs, UX specifications | charter, roadmap, research, prd, ux_spec |
| [architecture/](architecture/README.md) | Architecture overview and threat model | architecture, threat_model |
| [architecture/adr/](architecture/adr/0000-record-architecture-decisions.md) | Architecture decision records | adr |
| [qa/](qa/README.md) | Test strategy and test plans | test_plan |
| [runbooks/](runbooks/README.md) | Operational runbooks | runbook |
| [releases/](releases/README.md) | Release notes | release_notes |
| [infra-versions.md](infra-versions.md) | Pinned infrastructure and toolchain versions | |

Other document kinds are published to \`docs/<kind>/\` (for example \`docs/plan/\`).

## Conventions

- Markdown, one document per file, kebab-case file names (\`docs/product/checkout-v2.md\`).
- Start each document with a title and a status (Draft, In review, Approved or Superseded).
- Link the related issues and pull requests; record decisions as ADRs rather than in chat threads.
`;
}

const PRODUCT_README = `# Product

Charter, roadmap, market and user research, product requirements (PRDs) and UX specifications. User stories in PRDs
carry acceptance criteria in Given/When/Then form; issues link back to the PRD they implement.
`;

const ARCHITECTURE_README = `# Architecture

System context, components, data model, APIs, deployment topology (Azure Container Apps) and the threat model.
Significant decisions are recorded as ADRs in [adr/](adr/0000-record-architecture-decisions.md).
`;

function adr0000(ctx: RenderContext): string {
  return `# 0000. Record architecture decisions

- Status: Accepted

## Context

${ctx.name} is built by a team of AI agents and humans. Decisions must be explicit, discoverable and reviewable so that
every agent works from the same assumptions and later changes can see why the system looks the way it does.

## Decision

We record architecturally significant decisions as Architecture Decision Records (ADRs), as described by Michael
Nygard, in \`docs/architecture/adr/NNNN-short-title.md\`. ADRs are numbered sequentially, use the sections Context,
Decision and Consequences, and are immutable once accepted: a change of direction is a new ADR that supersedes the old
one.

## Consequences

Reviewers and agents can trace why a choice was made. Writing an ADR is part of the definition of done for any change
to architecture, infrastructure or cross-cutting conventions.
`;
}

const QA_README = `# Quality assurance

Test strategy and test plans. Unit and integration tests use Vitest (\`test/\`, \`npm test\`); end-to-end tests for
critical user journeys use Playwright (\`e2e/\`, \`npm run test:e2e\`). Every acceptance criterion maps to at least one
automated test, and tests are deterministic: no fixed sleeps, controlled data and time, no external network calls.
`;

function runbooksReadme(ctx: RenderContext): string {
  return `# Runbooks

Operational procedures for ${ctx.name}. Add one runbook per alert or operational task (\`docs/runbooks/<topic>.md\`).

## Environments

| Environment | Branch | Deployed by | Approval |
| --- | --- | --- | --- |
| staging | \`${ctx.integrationBranch}\` | \`${DEPLOY_JOBS.staging}\` on every push | None |
| production | \`${ctx.defaultBranch}\` | \`${DEPLOY_JOBS.production}\` on every push | CEO, via the \`production\` GitHub environment |

Resource names are outputs of \`azd provision\`: run \`azd env get-values\` (\`AZURE_RESOURCE_GROUP\`, \`SERVICE_WEB_NAME\`,
\`SERVICE_WEB_URI\`).

## Health and logs

- \`GET /health\` returns \`{ "status": "ok", "version": "<commit SHA>" }\`; the deploy workflow smoke-tests it.
- Structured JSON logs go to Log Analytics (table \`ContainerAppConsoleLogs_CL\`); telemetry to Application Insights.
- Stream logs: \`az containerapp logs show --name <app> --resource-group <rg> --follow\`.

## Roll back

The app runs in single-revision mode and keeps its last 10 inactive revisions.

1. List revisions and images:
   \`az containerapp revision list --name <app> --resource-group <rg> --all --query "[].{revision:name, image:properties.template.containers[0].image, created:properties.createdTime}" -o table\`
2. Redeploy the previous image: \`az containerapp update --name <app> --resource-group <rg> --image <previous image>\`.
3. Revert the faulty change on \`${ctx.integrationBranch}\` (and \`${ctx.defaultBranch}\`) so the next deployment does not
   reintroduce it.

## Tear down (staging only)

\`azd down --purge\` deletes the environment's resources and purges the Key Vault. Production enables Key Vault purge
protection, so its vault cannot be purged for 90 days after deletion.
`;
}

const RELEASES_README = `# Release notes

One file per release (\`docs/releases/<version-or-date>.md\`): highlights, changes with links to issues and pull
requests, known issues, and upgrade or rollback notes. Release notes are written during verification and linked from
the release pull request.
`;

function infraVersions(): string {
  const avm = Object.values(AVM_MODULES)
    .map((ref) => {
      const [path, version] = ref.replace("br/public:", "").split(":");
      return `| \`${path}\` | ${version} |`;
    })
    .join("\n");
  const actions = Object.values(ACTIONS)
    .map((ref) => {
      const [name, version] = ref.split("@");
      return `| \`${name}\` | ${version} |`;
    })
    .join("\n");
  const packages = Object.entries(PACKAGE_VERSIONS)
    .map(([name, version]) => `| \`${name}\` | ${version} |`)
    .join("\n");
  return `# Infrastructure and toolchain versions

Dependabot keeps npm packages and GitHub Actions current. Azure Verified Module (AVM) versions are bumped by hand:
Dependabot does not track the public Bicep registry.

## Azure Verified Modules (\`infra/resources.bicep\`)

Verified on ${AVM_VERIFIED_ON} against the public Bicep registry and compiled with Bicep CLI 0.48.1. Re-verify when
upgrading: read the module changelog, then run \`az bicep build --file infra/main.bicep\` and \`azd provision --preview\`.

| Module | Version |
| --- | --- |
${avm}

List the published versions of a module:
\`curl -s https://mcr.microsoft.com/v2/bicep/avm/res/app/container-app/tags/list\`

## GitHub Actions

| Action | Version |
| --- | --- |
${actions}

## Runtime and tooling

Node.js ${NODE_MAJOR} (CI, Copilot setup steps and the \`node:${NODE_MAJOR}-alpine\` container image).

| Package | Version |
| --- | --- |
${packages}
`;
}

/** The docs/ skeleton, matching the folders used by docsPathForDocument. */
export function docsFiles(ctx: RenderContext): RepoFile[] {
  return [
    { path: "docs/README.md", content: docsIndex(ctx) },
    { path: "docs/product/README.md", content: PRODUCT_README },
    { path: "docs/architecture/README.md", content: ARCHITECTURE_README },
    { path: "docs/architecture/adr/0000-record-architecture-decisions.md", content: adr0000(ctx) },
    { path: "docs/qa/README.md", content: QA_README },
    { path: "docs/runbooks/README.md", content: runbooksReadme(ctx) },
    { path: "docs/releases/README.md", content: RELEASES_README },
    { path: "docs/infra-versions.md", content: infraVersions() },
  ];
}
