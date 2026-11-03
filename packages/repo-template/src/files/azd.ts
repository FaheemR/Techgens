import type { RenderContext } from "../context";
import type { RepoFile } from "../types";

function azureYaml(ctx: RenderContext): string {
  return `# yaml-language-server: $schema=https://raw.githubusercontent.com/Azure/azure-dev/main/schemas/v1.0/azure.yaml.json
name: ${ctx.slug}
metadata:
  template: techgens-product@0.1.0
infra:
  provider: bicep
  path: infra
  module: main
services:
  web:
    project: .
    language: ts
    host: containerapp
    docker:
      path: ./Dockerfile
      context: .
      remoteBuild: false
      # Baked into the image and reported by GET /health; the deploy workflow's smoke test checks it.
      buildArgs:
        - APP_VERSION=\${GITHUB_SHA}
`;
}

function mainBicep(ctx: RenderContext): string {
  return `targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the azd environment (e.g. ${ctx.slug}-staging); names the resource group and tags every resource.')
param environmentName string

@minLength(1)
@description('Primary Azure region for all resources.')
param location string

@description('Object id of the principal running the deployment (set by azd); it may manage Key Vault secrets.')
param principalId string = ''

@description('Type of principalId (set by azd): User or ServicePrincipal.')
param principalType string = 'ServicePrincipal'

@description('Resource group to deploy into; defaults to rg-<environmentName>.')
param resourceGroupName string = ''

@description('Whether the web container app already exists (set by azd as SERVICE_WEB_RESOURCE_EXISTS).')
param webExists bool = false

@minValue(0)
@maxValue(10)
@description('Minimum replicas of the web container app: 0 lets staging scale to zero, production keeps 1 warm.')
param minReplicas int = 0

@description('Enable Key Vault purge protection (recommended for production; cannot be disabled later).')
param keyVaultPurgeProtection bool = false

var tags = {
  'azd-env-name': environmentName
  product: '${ctx.slug}'
  'managed-by': 'techgens'
}

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: !empty(resourceGroupName) ? resourceGroupName : 'rg-\${environmentName}'
  location: location
  tags: tags
}

module resources 'resources.bicep' = {
  name: 'resources'
  scope: rg
  params: {
    location: location
    tags: tags
    principalId: principalId
    principalType: principalType
    webExists: webExists
    minReplicas: minReplicas
    keyVaultPurgeProtection: keyVaultPurgeProtection
  }
}

output AZURE_LOCATION string = location
output AZURE_TENANT_ID string = tenant().tenantId
output AZURE_RESOURCE_GROUP string = rg.name
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = resources.outputs.containerRegistryLoginServer
output AZURE_CONTAINER_REGISTRY_NAME string = resources.outputs.containerRegistryName
output AZURE_CONTAINER_ENVIRONMENT_NAME string = resources.outputs.containerAppsEnvironmentName
output AZURE_KEY_VAULT_NAME string = resources.outputs.keyVaultName
output AZURE_KEY_VAULT_ENDPOINT string = resources.outputs.keyVaultEndpoint
output SERVICE_WEB_NAME string = resources.outputs.webName
output SERVICE_WEB_URI string = resources.outputs.webUri
`;
}

/** azd substitutes `${VAR}` from its environment; `${VAR=value}` supplies a default when the variable is unset. */
const MAIN_PARAMETERS = `${JSON.stringify(
  {
    $schema: "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
    contentVersion: "1.0.0.0",
    parameters: {
      environmentName: { value: "${AZURE_ENV_NAME}" },
      location: { value: "${AZURE_LOCATION}" },
      principalId: { value: "${AZURE_PRINCIPAL_ID}" },
      principalType: { value: "${AZURE_PRINCIPAL_TYPE}" },
      resourceGroupName: { value: "${AZURE_RESOURCE_GROUP}" },
      webExists: { value: "${SERVICE_WEB_RESOURCE_EXISTS=false}" },
      minReplicas: { value: "${CONTAINER_APP_MIN_REPLICAS=0}" },
      keyVaultPurgeProtection: { value: "${KEY_VAULT_PURGE_PROTECTION=false}" },
    },
  },
  null,
  2,
)}\n`;

const FETCH_CONTAINER_IMAGE = `// Reads the containers of an existing container app so re-provisioning keeps the image deployed by \`azd deploy\`
// instead of resetting it to the placeholder (azd sets SERVICE_<NAME>_RESOURCE_EXISTS before provisioning).
@description('Whether the container app already exists.')
param exists bool

@description('Name of the container app.')
param name string

resource existingApp 'Microsoft.App/containerApps@2025-01-01' existing = if (exists) {
  name: name
}

@description('Containers of the existing app; empty on first provisioning.')
output containers array = exists ? existingApp!.properties.template.containers : []
`;

/** azd project definition and the subscription-scope Bicep entry point. */
export function azdFiles(ctx: RenderContext): RepoFile[] {
  return [
    { path: "azure.yaml", content: azureYaml(ctx) },
    { path: "infra/main.bicep", content: mainBicep(ctx) },
    { path: "infra/main.parameters.json", content: MAIN_PARAMETERS },
    { path: "infra/modules/fetch-container-image.bicep", content: FETCH_CONTAINER_IMAGE },
  ];
}
