import { DEFAULT_ENVIRONMENTS, DEFAULT_RESOURCE_GROUP_PREFIX, azdEnvironmentName } from "./naming";
import type { AzureSetupInput } from "./types";

export interface NormalizedAzureSetupInput {
  subscriptionId: string;
  tenantId: string | undefined;
  location: string;
  githubOwner: string;
  githubRepo: string;
  productSlug: string;
  environments: string[];
  resourceGroupPrefix: string;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LOCATION = /^[a-z][a-z0-9]{1,39}$/;
const GITHUB_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const GITHUB_REPO = /^[A-Za-z0-9._-]{1,100}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ENVIRONMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESOURCE_GROUP_PREFIX = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,18}[A-Za-z0-9])?$/;
const MAX_SLUG = 60;
const MAX_ENVIRONMENT = 24;
const MAX_RESOURCE_GROUP = 90;

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** Trims and canonicalizes the input (lowercase GUIDs, "East US 2" → "eastus2", defaults). */
export function normalizeAzureSetupInput(input: AzureSetupInput): NormalizedAzureSetupInput {
  const environments = Array.isArray(input.environments)
    ? input.environments.map(text)
    : [...DEFAULT_ENVIRONMENTS];
  return {
    subscriptionId: text(input.subscriptionId).toLowerCase(),
    tenantId: text(input.tenantId).toLowerCase() || undefined,
    location: text(input.location).toLowerCase().replace(/\s+/g, ""),
    githubOwner: text(input.githubOwner),
    githubRepo: text(input.githubRepo),
    productSlug: text(input.productSlug),
    environments,
    resourceGroupPrefix: text(input.resourceGroupPrefix) || DEFAULT_RESOURCE_GROUP_PREFIX,
  };
}

/** Lists every problem with the input (empty when valid). Values are checked strictly: they end up in a shell script. */
export function validateAzureSetupInput(input: AzureSetupInput): string[] {
  const value = normalizeAzureSetupInput(input);
  const problems: string[] = [];
  if (!GUID.test(value.subscriptionId)) {
    problems.push(
      `subscriptionId must be a GUID such as 11111111-2222-3333-4444-555555555555 (got "${text(input.subscriptionId)}")`,
    );
  }
  if (value.tenantId !== undefined && !GUID.test(value.tenantId)) {
    problems.push(
      `tenantId must be a GUID (got "${text(input.tenantId)}"); omit it to use the subscription's tenant`,
    );
  }
  if (!value.location) problems.push('location is required (an Azure region such as "eastus2")');
  else if (!LOCATION.test(value.location))
    problems.push(`location "${text(input.location)}" is not an Azure region name such as "eastus2"`);
  if (!GITHUB_OWNER.test(value.githubOwner)) {
    problems.push(`githubOwner "${value.githubOwner}" is not a valid GitHub user or organization name`);
  }
  if (!GITHUB_REPO.test(value.githubRepo) || value.githubRepo === "." || value.githubRepo === "..") {
    problems.push(`githubRepo "${value.githubRepo}" is not a valid GitHub repository name`);
  }
  if (!SLUG.test(value.productSlug) || value.productSlug.length > MAX_SLUG) {
    problems.push(
      `productSlug "${value.productSlug}" must be kebab-case (lowercase letters, digits and single hyphens), at most ${MAX_SLUG} characters`,
    );
  }
  if (!RESOURCE_GROUP_PREFIX.test(value.resourceGroupPrefix)) {
    problems.push(
      `resourceGroupPrefix "${value.resourceGroupPrefix}" must be 1-20 letters, digits, "_" or "-"`,
    );
  }
  if (value.environments.length === 0)
    problems.push("environments must list at least one GitHub environment");
  const seen = new Set<string>();
  for (const environment of value.environments) {
    if (!ENVIRONMENT.test(environment) || environment.length > MAX_ENVIRONMENT) {
      problems.push(
        `environment "${environment}" must be lowercase letters, digits and hyphens, at most ${MAX_ENVIRONMENT} characters`,
      );
      continue;
    }
    if (seen.has(environment)) problems.push(`environment "${environment}" is listed twice`);
    seen.add(environment);
    const resourceGroup = `${value.resourceGroupPrefix}-${azdEnvironmentName(value.productSlug, environment)}`;
    if (resourceGroup.length > MAX_RESOURCE_GROUP) {
      problems.push(`resource group name "${resourceGroup}" exceeds ${MAX_RESOURCE_GROUP} characters`);
    }
  }
  return problems;
}
