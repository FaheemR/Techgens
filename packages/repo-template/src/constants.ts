import { PRIORITIES } from "@techgens/core";
import type { ProductLabel } from "./types";

const PRIORITY_LABELS: Record<(typeof PRIORITIES)[number], { color: string; description: string }> = {
  p0: { color: "B60205", description: "Critical: drop everything (outage, security, data loss)" },
  p1: { color: "D93F0B", description: "High: needed for the current milestone" },
  p2: { color: "FBCA04", description: "Normal priority" },
  p3: { color: "C2E0C6", description: "Low: nice to have" },
};

/** Labels Techgens creates in every product repository (`priority: pN` matches work item priorities). */
export const PRODUCT_LABELS: ProductLabel[] = [
  { name: "epic", color: "3E4B9E", description: "Large body of work split into stories" },
  { name: "story", color: "1D76DB", description: "User-facing increment with acceptance criteria" },
  { name: "task", color: "0E8A16", description: "Implementation task: one small pull request" },
  { name: "bug", color: "D73A4A", description: "Something isn't working" },
  { name: "techgens", color: "5319E7", description: "Planned and tracked by Techgens agents" },
  ...PRIORITIES.map((p) => ({ name: `priority: ${p}`, ...PRIORITY_LABELS[p] })),
  { name: "size: S", color: "C5DEF5", description: "Small: under a day" },
  { name: "size: M", color: "7FB3E8", description: "Medium: one to three days" },
  { name: "size: L", color: "2B6CB0", description: "Large: consider splitting" },
  { name: "area: frontend", color: "BFD4F2", description: "User interface" },
  { name: "area: backend", color: "D4C5F9", description: "APIs, data and background jobs" },
  { name: "area: infra", color: "F9D0C4", description: "CI/CD, Azure infrastructure (azd + Bicep)" },
  { name: "area: docs", color: "FEF2C0", description: "Documentation in docs/" },
  { name: "area: qa", color: "C2E0C6", description: "Automated tests and quality" },
];

/** Job ids (and `name:`s) of `.github/workflows/ci.yml`. */
export const CI_JOBS = { buildAndTest: "build-and-test", dockerBuild: "docker-build" } as const;

/**
 * Status checks that branch protection should require on the default and integration branches.
 *
 * GitHub names the check run of a GitHub Actions job after the job's `name:` (or its id when `name:` is absent). The
 * "ci / build-and-test (pull_request)" text shown in the pull request UI is display-only and is *not* a valid
 * required-check context. Both CI jobs set `name:` equal to their job id, live in `ci.yml` and run on every pull request
 * without path filters, so a required check can never stay "expected" forever. CodeQL is intentionally not required: it
 * is skipped on private repositories until GitHub Code Security is enabled (repository variable `CODEQL_ENABLED`).
 */
export const REQUIRED_CHECKS = [CI_JOBS.buildAndTest, CI_JOBS.dockerBuild] as const;

/** Deployment jobs in `.github/workflows/deploy.yml`, keyed by GitHub environment. */
export const DEPLOY_JOBS = { staging: "deploy-staging", production: "deploy-production" } as const;
export type DeployEnvironment = keyof typeof DEPLOY_JOBS;

export const WORKFLOW_FILES = {
  copilotSetupSteps: ".github/workflows/copilot-setup-steps.yml",
  ci: ".github/workflows/ci.yml",
  codeql: ".github/workflows/codeql.yml",
  deploy: ".github/workflows/deploy.yml",
} as const;

/** Node.js major used by CI, Copilot setup steps and the container image. */
export const NODE_MAJOR = 22;
/** 22.18 runs TypeScript directly (type stripping) for `npm run dev`. */
export const NODE_ENGINE = ">=22.18.0";

/** devDependencies of the generated product (validated by this package's tests with the monorepo toolchain). */
export const PACKAGE_VERSIONS = {
  "@types/node": "^22.20.5",
  typescript: "^6.0.3",
  vitest: "^5.1.0",
} as const;

/** GitHub Actions used by the generated workflows (major tags; Dependabot keeps them current). */
export const ACTIONS = {
  checkout: "actions/checkout@v7",
  setupNode: "actions/setup-node@v7",
  codeqlInit: "github/codeql-action/init@v4",
  codeqlAnalyze: "github/codeql-action/analyze@v4",
  azureLogin: "azure/login@v2",
  setupAzd: "Azure/setup-azd@v2",
} as const;

/**
 * Azure Verified Modules (public Bicep registry), pinned to exact versions. Verified on {@link AVM_VERIFIED_ON} against
 * `https://mcr.microsoft.com/v2/bicep/avm/res/<module>/tags/list` and compiled with Bicep CLI 0.48.1.
 */
export const AVM_MODULES = {
  logAnalytics: "br/public:avm/res/operational-insights/workspace:0.16.1",
  appInsights: "br/public:avm/res/insights/component:0.8.0",
  containerRegistry: "br/public:avm/res/container-registry/registry:0.13.1",
  managedIdentity: "br/public:avm/res/managed-identity/user-assigned-identity:0.6.0",
  keyVault: "br/public:avm/res/key-vault/vault:0.14.2",
  containerAppsEnvironment: "br/public:avm/res/app/managed-environment:0.16.0",
  containerApp: "br/public:avm/res/app/container-app:0.23.0",
} as const;
export const AVM_VERIFIED_ON = "2026-11-03";

export const DEFAULT_AZURE_LOCATION = "eastus2";
/** Port the web container listens on (Container Apps ingress target port). */
export const WEB_PORT = 8080;
