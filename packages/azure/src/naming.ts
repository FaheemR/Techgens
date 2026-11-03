import type { AzureEnvironmentPlan } from "./types";
import type { NormalizedAzureSetupInput } from "./validation";

export const DEFAULT_ENVIRONMENTS = ["staging", "production"] as const;
export const DEFAULT_RESOURCE_GROUP_PREFIX = "rg";
export const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
export const AZURE_TOKEN_EXCHANGE_AUDIENCE = "api://AzureADTokenExchange";
/** Placeholder subscription id used before the CEO picks a subscription; the script then uses the signed-in one. */
export const NIL_GUID = "00000000-0000-0000-0000-000000000000";

/**
 * Subject claim of GitHub Actions OIDC tokens for jobs bound to a GitHub environment. Entra ID matches it
 * case-sensitively, so pass the owner and repository names exactly as GitHub reports them.
 */
export function oidcSubject(owner: string, repo: string, environment: string): string {
  return `repo:${owner}/${repo}:environment:${environment}`;
}

/**
 * azd environment name (`AZURE_ENV_NAME`) for a GitHub environment: `<slug>-<environment>`, truncated to azd's
 * 64-character limit. Must match `azdEnvironmentName` in @techgens/repo-template (the deploy workflow's fallback).
 */
export function azdEnvironmentName(slug: string, environment: string): string {
  const room = Math.max(1, 64 - environment.length - 1);
  const base = slug.slice(0, room).replace(/-+$/, "") || "app";
  return `${base}-${environment}`;
}

/** Resource group, app registration, federated credential and OIDC subject for each environment. */
export function planEnvironments(input: NormalizedAzureSetupInput): AzureEnvironmentPlan[] {
  return input.environments.map((environment) => {
    const envName = azdEnvironmentName(input.productSlug, environment);
    return {
      environment,
      azdEnvironmentName: envName,
      resourceGroup: `${input.resourceGroupPrefix}-${envName}`,
      appRegistrationName: `techgens-${envName}`,
      federatedCredentialName: `github-${environment}`,
      oidcSubject: oidcSubject(input.githubOwner, input.githubRepo, environment),
    };
  });
}
