import { DomainError, type RoleDefinition } from "@techgens/core";
import { DEFAULT_AZURE_LOCATION } from "./constants";
import type { ProductRepoInput } from "./types";

/** Validated, normalized input shared by all file renderers. */
export interface RenderContext {
  name: string;
  slug: string;
  description: string;
  owner: string;
  repo: string;
  repoUrl: string;
  defaultBranch: string;
  integrationBranch: string;
  companyName: string;
  policies: string;
  roles: readonly RoleDefinition[];
  location: string;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const GITHUB_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const GITHUB_REPO = /^[A-Za-z0-9._-]{1,100}$/;
const BRANCH_CHARS = /^[A-Za-z0-9._/-]{1,100}$/;
const LOCATION = /^[a-z][a-z0-9]{1,39}$/;

function branchProblem(field: string, branch: string): string | null {
  const invalid =
    !BRANCH_CHARS.test(branch) ||
    /^[-./]/.test(branch) ||
    /(?:\/|\.|\.lock)$/.test(branch) ||
    branch.includes("..") ||
    branch.includes("//");
  return invalid
    ? `${field} "${branch}" is not a valid branch name (letters, digits, ".", "_", "-", "/")`
    : null;
}

/** Azure region names are lowercase without spaces ("East US 2" is accepted and normalized to "eastus2"). */
export function normalizeLocation(location: string | undefined): string {
  const normalized = (location ?? "").trim().toLowerCase().replace(/\s+/g, "");
  return normalized || DEFAULT_AZURE_LOCATION;
}

/** Lists problems with a {@link ProductRepoInput}; empty when the input can be rendered. */
export function validateProductRepoInput(input: ProductRepoInput): string[] {
  const problems: string[] = [];
  if (!input.productName?.trim()) problems.push("productName is required");
  if (!SLUG.test(input.productSlug ?? "") || input.productSlug.length > 60) {
    problems.push(
      `productSlug "${input.productSlug}" must be kebab-case (a-z, 0-9, "-"), at most 60 characters`,
    );
  }
  if (!GITHUB_OWNER.test(input.owner ?? ""))
    problems.push(`owner "${input.owner}" is not a valid GitHub user or organization`);
  if (!GITHUB_REPO.test(input.repo ?? "") || input.repo === "." || input.repo === "..") {
    problems.push(`repo "${input.repo}" is not a valid GitHub repository name`);
  }
  const defaultProblem = branchProblem("defaultBranch", input.defaultBranch ?? "");
  const integrationProblem = branchProblem("integrationBranch", input.integrationBranch ?? "");
  if (defaultProblem) problems.push(defaultProblem);
  if (integrationProblem) problems.push(integrationProblem);
  if (!defaultProblem && !integrationProblem && input.defaultBranch === input.integrationBranch) {
    problems.push(
      "integrationBranch must differ from defaultBranch (staging deploys from one, production from the other)",
    );
  }
  const location = normalizeLocation(input.azure?.location);
  if (!LOCATION.test(location))
    problems.push(`azure.location "${input.azure?.location}" is not an Azure region name such as "eastus2"`);
  if (!Array.isArray(input.roles)) problems.push("roles must be an array of role definitions");
  return problems;
}

export function buildRenderContext(input: ProductRepoInput): RenderContext {
  const problems = validateProductRepoInput(input);
  if (problems.length)
    throw new DomainError(`Invalid product repository input: ${problems.join("; ")}`, "invalid");
  return {
    name: input.productName.trim(),
    slug: input.productSlug,
    description: input.description?.trim() ?? "",
    owner: input.owner,
    repo: input.repo,
    repoUrl: `https://github.com/${input.owner}/${input.repo}`,
    defaultBranch: input.defaultBranch,
    integrationBranch: input.integrationBranch,
    companyName: input.companyName?.trim() || "Techgens",
    policies: input.policies?.trim() ?? "",
    roles: input.roles,
    location: normalizeLocation(input.azure?.location),
  };
}

/**
 * azd environment name for a GitHub environment: `<slug>-<environment>`, truncated to azd's 64-character limit.
 * Must match `@techgens/azure` (AZURE_ENV_NAME); the resource group defaults to `rg-<azd environment name>`.
 */
export function azdEnvironmentName(slug: string, environment: string): string {
  const room = Math.max(1, 64 - environment.length - 1);
  const base = slug.slice(0, room).replace(/-+$/, "") || "app";
  return `${base}-${environment}`;
}
