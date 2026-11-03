import { AVM_MODULES, WEB_PORT } from "../constants";
import type { RenderContext } from "../context";
import type { RepoFile } from "../types";

function resourcesBicep(): string {
  return `// Resource-group scope resources for the web service, built from pinned Azure Verified Modules (AVM).
@description('Primary location for all resources.')
param location string = resourceGroup().location

@description('Tags applied to every resource.')
param tags object = {}

@description('Object id of the deploying principal; granted Key Vault Secrets Officer when set.')
param principalId string = ''

@description('Type of principalId: User or ServicePrincipal.')
param principalType string = 'ServicePrincipal'

@description('Whether the web container app already exists; its current image is kept on re-provisioning.')
param webExists bool = false

@minValue(0)
@maxValue(10)
@description('Minimum replicas of the web container app.')
param minReplicas int = 0

@minValue(1)
@maxValue(30)
@description('Maximum replicas of the web container app.')
param maxReplicas int = 3

@description('Enable Key Vault purge protection (cannot be disabled later).')
param keyVaultPurgeProtection bool = false

var resourceToken = toLower(uniqueString(subscription().id, resourceGroup().id, location))
var webAppName = 'ca-web-\${resourceToken}'
var webPort = ${WEB_PORT}
// Public placeholder served until the first \`azd deploy\` pushes the real image to the registry.
var placeholderImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
var deployerPrincipalType = principalType == 'User' ? 'User' : 'ServicePrincipal'
var roleIds = {
  acrPull: '7f951dda-4ed3-4680-a7ca-43fe172d538d'
  keyVaultSecretsUser: '4633458b-17de-408a-b874-0445c86b69e6'
  keyVaultSecretsOfficer: 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7'
}

module logAnalytics '${AVM_MODULES.logAnalytics}' = {
  name: 'log-analytics'
  params: {
    name: 'log-\${resourceToken}'
    location: location
    tags: tags
    dataRetention: 30
  }
}

module appInsights '${AVM_MODULES.appInsights}' = {
  name: 'app-insights'
  params: {
    name: 'appi-\${resourceToken}'
    location: location
    tags: tags
    workspaceResourceId: logAnalytics.outputs.resourceId
    retentionInDays: 90
  }
}

module webIdentity '${AVM_MODULES.managedIdentity}' = {
  name: 'web-identity'
  params: {
    name: 'id-web-\${resourceToken}'
    location: location
    tags: tags
  }
}

module containerRegistry '${AVM_MODULES.containerRegistry}' = {
  name: 'container-registry'
  params: {
    name: 'cr\${resourceToken}'
    location: location
    tags: tags
    acrSku: 'Basic'
    acrAdminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    zoneRedundancy: 'Disabled'
    roleAssignments: [
      {
        principalId: webIdentity.outputs.principalId
        principalType: 'ServicePrincipal'
        roleDefinitionIdOrName: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.acrPull)
      }
    ]
  }
}

module keyVault '${AVM_MODULES.keyVault}' = {
  name: 'key-vault'
  params: {
    name: 'kv-\${resourceToken}'
    location: location
    tags: tags
    sku: 'standard'
    enableRbacAuthorization: true
    enablePurgeProtection: keyVaultPurgeProtection
    publicNetworkAccess: 'Enabled'
    roleAssignments: concat(
      [
        {
          principalId: webIdentity.outputs.principalId
          principalType: 'ServicePrincipal'
          roleDefinitionIdOrName: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.keyVaultSecretsUser)
        }
      ],
      empty(principalId)
        ? []
        : [
            {
              principalId: principalId
              principalType: deployerPrincipalType
              roleDefinitionIdOrName: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.keyVaultSecretsOfficer)
            }
          ]
    )
  }
}

module containerAppsEnvironment '${AVM_MODULES.containerAppsEnvironment}' = {
  name: 'container-apps-environment'
  params: {
    name: 'cae-\${resourceToken}'
    location: location
    tags: tags
    publicNetworkAccess: 'Enabled'
    zoneRedundant: false
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsWorkspaceResourceId: logAnalytics.outputs.resourceId
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

module webFetchImage 'modules/fetch-container-image.bicep' = {
  name: 'web-fetch-image'
  params: {
    exists: webExists
    name: webAppName
  }
}

var webProbes = [
  {
    type: 'Liveness'
    httpGet: {
      path: '/health'
      port: webPort
    }
    initialDelaySeconds: 10
    periodSeconds: 30
    failureThreshold: 3
  }
  {
    type: 'Readiness'
    httpGet: {
      path: '/health'
      port: webPort
    }
    initialDelaySeconds: 3
    periodSeconds: 10
    failureThreshold: 3
  }
]

module web '${AVM_MODULES.containerApp}' = {
  name: 'web'
  params: {
    name: webAppName
    location: location
    tags: union(tags, { 'azd-service-name': 'web' })
    environmentResourceId: containerAppsEnvironment.outputs.resourceId
    workloadProfileName: 'Consumption'
    ingressExternal: true
    ingressTargetPort: webPort
    ingressAllowInsecure: false
    activeRevisionsMode: 'Single'
    maxInactiveRevisions: 10
    scaleSettings: {
      minReplicas: minReplicas
      maxReplicas: maxReplicas
    }
    managedIdentities: {
      userAssignedResourceIds: [
        webIdentity.outputs.resourceId
      ]
    }
    registries: [
      {
        server: containerRegistry.outputs.loginServer
        identity: webIdentity.outputs.resourceId
      }
    ]
    secrets: [
      {
        name: 'appinsights-connection-string'
        value: appInsights.outputs.connectionString
      }
    ]
    containers: [
      {
        name: 'web'
        image: webFetchImage.outputs.?containers[?0].?image ?? placeholderImage
        resources: {
          cpu: json('0.5')
          memory: '1Gi'
        }
        env: [
          {
            name: 'PORT'
            value: string(webPort)
          }
          {
            name: 'NODE_ENV'
            value: 'production'
          }
          {
            name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
            secretRef: 'appinsights-connection-string'
          }
          {
            name: 'AZURE_CLIENT_ID'
            value: webIdentity.outputs.clientId
          }
          {
            name: 'AZURE_KEY_VAULT_ENDPOINT'
            value: keyVault.outputs.uri
          }
        ]
        // HTTP probes only once the real image runs: the placeholder image does not serve /health on this port.
        probes: webExists ? webProbes : []
      }
    ]
  }
}

output containerRegistryLoginServer string = containerRegistry.outputs.loginServer
output containerRegistryName string = containerRegistry.outputs.name
output containerAppsEnvironmentName string = containerAppsEnvironment.outputs.name
output keyVaultName string = keyVault.outputs.name
output keyVaultEndpoint string = keyVault.outputs.uri
output webName string = web.outputs.name
output webUri string = 'https://\${web.outputs.fqdn}'
`;
}

export function resourcesBicepFile(_ctx: RenderContext): RepoFile {
  return { path: "infra/resources.bicep", content: resourcesBicep() };
}
