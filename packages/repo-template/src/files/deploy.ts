import { ACTIONS, DEPLOY_JOBS, NODE_MAJOR, WORKFLOW_FILES, type DeployEnvironment } from "../constants";
import { azdEnvironmentName, type RenderContext } from "../context";
import type { RepoFile } from "../types";

interface DeployTarget {
  environment: DeployEnvironment;
  branch: string;
  /** 0 lets staging scale to zero; production keeps a warm replica. */
  minReplicas: number;
  keyVaultPurgeProtection: boolean;
}

const CONNECTED = "steps.azure.outputs.connected == 'true'";

function deployJob(ctx: RenderContext, target: DeployTarget): string {
  const { environment } = target;
  return `  ${DEPLOY_JOBS[environment]}:
    name: ${DEPLOY_JOBS[environment]}
    if: github.ref == 'refs/heads/${target.branch}'
    runs-on: ubuntu-latest
    timeout-minutes: 45
    environment:
      name: ${environment}
      url: \${{ steps.deploy.outputs.uri }}
    concurrency:
      group: deploy-${environment}
      cancel-in-progress: false
    env:
      # GitHub environment *variables* (not secrets) written by the Techgens Azure connection wizard.
      AZURE_CLIENT_ID: \${{ vars.AZURE_CLIENT_ID }}
      AZURE_TENANT_ID: \${{ vars.AZURE_TENANT_ID }}
      AZURE_SUBSCRIPTION_ID: \${{ vars.AZURE_SUBSCRIPTION_ID }}
      AZURE_ENV_NAME: \${{ vars.AZURE_ENV_NAME || '${azdEnvironmentName(ctx.slug, environment)}' }}
      AZURE_LOCATION: \${{ vars.AZURE_LOCATION || '${ctx.location}' }}
      AZURE_RESOURCE_GROUP: \${{ vars.AZURE_RESOURCE_GROUP }}
      CONTAINER_APP_MIN_REPLICAS: "${target.minReplicas}"
      KEY_VAULT_PURGE_PROTECTION: "${target.keyVaultPurgeProtection}"
    steps:
      - name: Check Azure connection
        id: azure
        run: |
          if [ -z "$AZURE_CLIENT_ID" ] || [ -z "$AZURE_TENANT_ID" ] || [ -z "$AZURE_SUBSCRIPTION_ID" ]; then
            echo "::notice title=${environment} deployment skipped::Azure is not connected for the ${environment} environment yet. Run the Techgens Azure connection wizard to set AZURE_CLIENT_ID, AZURE_TENANT_ID and AZURE_SUBSCRIPTION_ID."
            echo "connected=false" >> "$GITHUB_OUTPUT"
          else
            echo "connected=true" >> "$GITHUB_OUTPUT"
          fi
      - name: Checkout code
        if: ${CONNECTED}
        uses: ${ACTIONS.checkout}
      - name: Set up Node.js ${NODE_MAJOR}
        if: ${CONNECTED}
        uses: ${ACTIONS.setupNode}
        with:
          node-version: ${NODE_MAJOR}
          # No dependency cache in jobs that can mint Azure tokens (cache-poisoning hardening).
          package-manager-cache: false
      - name: Azure login (OIDC)
        if: ${CONNECTED}
        uses: ${ACTIONS.azureLogin}
        with:
          client-id: \${{ vars.AZURE_CLIENT_ID }}
          tenant-id: \${{ vars.AZURE_TENANT_ID }}
          subscription-id: \${{ vars.AZURE_SUBSCRIPTION_ID }}
      - name: Install azd
        if: ${CONNECTED}
        uses: ${ACTIONS.setupAzd}
      - name: azd login (OIDC)
        if: ${CONNECTED}
        run: azd auth login --client-id "$AZURE_CLIENT_ID" --federated-credential-provider github --tenant-id "$AZURE_TENANT_ID"
      - name: Select azd environment
        if: ${CONNECTED}
        run: |
          azd env select "$AZURE_ENV_NAME" --no-prompt 2>/dev/null || azd env new "$AZURE_ENV_NAME" --location "$AZURE_LOCATION" --subscription "$AZURE_SUBSCRIPTION_ID" --no-prompt
          azd env set AZURE_LOCATION "$AZURE_LOCATION"
          azd env set AZURE_SUBSCRIPTION_ID "$AZURE_SUBSCRIPTION_ID"
          azd env set CONTAINER_APP_MIN_REPLICAS "$CONTAINER_APP_MIN_REPLICAS"
          azd env set KEY_VAULT_PURGE_PROTECTION "$KEY_VAULT_PURGE_PROTECTION"
          if [ -n "$AZURE_RESOURCE_GROUP" ]; then azd env set AZURE_RESOURCE_GROUP "$AZURE_RESOURCE_GROUP"; fi
      - name: Provision infrastructure
        if: ${CONNECTED}
        run: azd provision --no-prompt
      - name: Deploy application
        id: deploy
        if: ${CONNECTED}
        run: |
          azd deploy --all --no-prompt
          echo "uri=$(azd env get-value SERVICE_WEB_URI)" >> "$GITHUB_OUTPUT"
      - name: Smoke test /health
        if: ${CONNECTED}
        env:
          SERVICE_URI: \${{ steps.deploy.outputs.uri }}
        run: |
          if [ -z "$SERVICE_URI" ]; then
            echo "::error::azd did not report SERVICE_WEB_URI"
            exit 1
          fi
          for attempt in $(seq 1 30); do
            body="$(curl --silent --show-error --fail --max-time 10 "$SERVICE_URI/health" || true)"
            if [ -n "$body" ] && echo "$body" | jq -e --arg version "$GITHUB_SHA" '.status == "ok" and .version == $version' > /dev/null; then
              echo "Healthy: $body"
              exit 0
            fi
            echo "Attempt $attempt: waiting for $SERVICE_URI/health to report version $GITHUB_SHA (got: \${body:-no response})"
            sleep 10
          done
          echo "::error title=Smoke test failed::$SERVICE_URI/health did not report status ok for version $GITHUB_SHA"
          exit 1
`;
}

function deployWorkflow(ctx: RenderContext): string {
  const staging = deployJob(ctx, {
    environment: "staging",
    branch: ctx.integrationBranch,
    minReplicas: 0,
    keyVaultPurgeProtection: false,
  });
  const production = deployJob(ctx, {
    environment: "production",
    branch: ctx.defaultBranch,
    minReplicas: 1,
    keyVaultPurgeProtection: true,
  });
  return `name: deploy

# Continuous delivery to Azure Container Apps with azd + Bicep.
#   push to ${ctx.integrationBranch} -> ${DEPLOY_JOBS.staging} (environment: staging)
#   push to ${ctx.defaultBranch} -> ${DEPLOY_JOBS.production} (environment: production; GitHub pauses for the CEO's approval)
# Authentication uses OpenID Connect federated credentials: no Azure secrets are stored in GitHub. Until the Azure
# connection wizard has set the environment variables, the jobs skip deployment with a notice so the run stays green.
on:
  push:
    branches:
      - ${ctx.integrationBranch}
      - ${ctx.defaultBranch}
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

jobs:
${staging}
${production}`;
}

export function deployWorkflowFile(ctx: RenderContext): RepoFile {
  return { path: WORKFLOW_FILES.deploy, content: deployWorkflow(ctx) };
}
