/** Input of the Azure connection wizard for one product repository. */
export interface AzureSetupInput {
  subscriptionId: string;
  /** Microsoft Entra tenant; defaults to the subscription's tenant at run time. */
  tenantId?: string;
  /** Azure region, e.g. "eastus2" ("East US 2" is normalized). */
  location: string;
  githubOwner: string;
  githubRepo: string;
  productSlug: string;
  /** GitHub environments to connect (default `["staging", "production"]`). */
  environments?: string[];
  /** Resource group prefix (default "rg", giving `rg-<slug>-<environment>`). */
  resourceGroupPrefix?: string;
}

/** Names derived for one GitHub environment. */
export interface AzureEnvironmentPlan {
  environment: string;
  /** azd environment name (`AZURE_ENV_NAME`), `<slug>-<environment>`. */
  azdEnvironmentName: string;
  resourceGroup: string;
  appRegistrationName: string;
  federatedCredentialName: string;
  /** OIDC `sub` claim GitHub Actions presents for jobs that use this environment. */
  oidcSubject: string;
}

/** JSON-serialisable result of {@link generateAzureSetupScript}. */
export interface AzureSetupResult {
  /** Idempotent bash script (Azure CLI) that performs the setup. */
  script: string;
  /** GitHub environment variables per environment. Values the script discovers are `<...>` placeholder notes. */
  variables: Record<string, Record<string, string>>;
  /** Human-readable steps for the connection wizard. */
  steps: string[];
}
