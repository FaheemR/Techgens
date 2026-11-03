/** Built-in Azure role definition ids (stable across clouds and tenants). */
export const AZURE_ROLE_IDS = {
  contributor: "b24988ac-6180-42a0-ab88-20f7382dd24c",
  roleBasedAccessControlAdministrator: "f58310d9-a9f6-439a-9e8d-f62e7b41a168",
  acrPull: "7f951dda-4ed3-4680-a7ca-43fe172d538d",
  keyVaultSecretsUser: "4633458b-17de-408a-b874-0445c86b69e6",
  keyVaultSecretsOfficer: "b86a8fe4-44ce-4948-aee5-eccb2c155cd7",
} as const;

/**
 * Roles the deployment identity may hand out: exactly the role assignments `infra/` of a Techgens product creates
 * (AcrPull for the app's managed identity, Key Vault Secrets User for the app, Key Vault Secrets Officer for the
 * deploying principal).
 */
export const DELEGATED_ROLE_IDS: readonly string[] = [
  AZURE_ROLE_IDS.acrPull,
  AZURE_ROLE_IDS.keyVaultSecretsUser,
  AZURE_ROLE_IDS.keyVaultSecretsOfficer,
];

/**
 * ABAC condition (version 2.0) for a "Role Based Access Control Administrator" assignment: the delegate may only
 * create or delete assignments of `roleIds` to principals of `principalTypes`.
 */
export function constrainedRoleAssignmentCondition(
  roleIds: readonly string[] = DELEGATED_ROLE_IDS,
  principalTypes: readonly string[] = ["ServicePrincipal"],
): string {
  const roles = roleIds.join(", ");
  const types = principalTypes.map((type) => `'${type}'`).join(", ");
  const constraint = (source: "Request" | "Resource") =>
    `@${source}[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${roles}} AND ` +
    `@${source}[Microsoft.Authorization/roleAssignments:PrincipalType] ForAnyOfAnyValues:StringEqualsIgnoreCase {${types}}`;
  return (
    `((!(ActionMatches{'Microsoft.Authorization/roleAssignments/write'})) OR (${constraint("Request")})) AND ` +
    `((!(ActionMatches{'Microsoft.Authorization/roleAssignments/delete'})) OR (${constraint("Resource")}))`
  );
}

/** Actions of the subscription-level custom role that lets azd run subscription-scope deployments. */
export const DEPLOYMENT_OPERATOR_ACTIONS: readonly string[] = ["Microsoft.Resources/deployments/*"];

/** Resource providers used by the product templates; registering them needs subscription-level rights. */
export const RESOURCE_PROVIDERS: readonly string[] = [
  "Microsoft.App",
  "Microsoft.ContainerRegistry",
  "Microsoft.Insights",
  "Microsoft.KeyVault",
  "Microsoft.ManagedIdentity",
  "Microsoft.OperationalInsights",
];
