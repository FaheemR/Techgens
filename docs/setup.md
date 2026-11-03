# Setup: GitHub, Copilot and Azure

## 1. GitHub & Copilot prerequisites
* A Copilot plan that includes **Copilot CLI/SDK** usage and **Copilot cloud agent** (Copilot Business or Enterprise
  recommended). In your organisation's Copilot policies enable: Copilot CLI, Copilot cloud agent (for the product
  repositories), and optionally Copilot code review.
* Product repositories are created **private** in the owner you set (Settings or `Strategy → GitHub owner`).
  *Required reviewers on environments for private repositories need GitHub Enterprise* (Team/Pro only support
  them on public repos) — without them, production deploys are not gated by GitHub, only by Techgens.
* Copilot cloud agent assignment uses the public-preview `agent_assignment` API and a **user** token.

## 2. Connect Techgens
**Option A — fine-grained personal access token (quickest)**
1. GitHub → Settings → Developer settings → Fine-grained tokens → *Generate new token*, resource owner = **your user**.
2. Account permissions: **Copilot Requests** (read). Repository access: all repositories of the product owner (or the
   org via an org-approved token) with read/write on Administration, Contents, Issues, Pull requests, Actions,
   Environments, Variables, Workflows, and read on Metadata/Checks.
3. Paste it in **Settings → GitHub**. Techgens validates it, stores it encrypted, and starts the agents.

**Option B — GitHub App (bot identity, auto-refreshing tokens)**
Click **Create GitHub App** in Settings (optionally for an organisation). GitHub creates the app from Techgens'
manifest, asks you to install it on the owner, then to authorise it; you are redirected back to Settings. Agent
comments and reviews are then authored by `<app>[bot]`; Copilot work and CEO-approved actions use your user token.

Check the Copilot connection without spending credits:
`GH_TOKEN=<token> pnpm --filter @techgens/orchestrator exec tsx ../../packages/runtime/scripts/smoke.ts`.

## 3. Azure (per product)
Products deploy with **azd + Bicep** through GitHub Actions using **OIDC** (no secrets stored in GitHub).
1. Set the product's Azure subscription/tenant/location (`PATCH /api/products/:id` `{ azure: {...} }` or Strategy →
   Products).
2. Open **Strategy → Products → Azure setup** (or `GET /api/products/:id/azure-setup`) and run the generated script with
   an account that can create resource groups, Entra app registrations and role assignments
   (`az login` first). Per environment it creates a resource group, an Entra app + service principal with a federated
   credential for `repo:<owner>/<repo>:environment:<env>`, least-privilege role assignments, and sets the GitHub
   environment variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_LOCATION`, `AZURE_ENV_NAME`.
3. Until these variables exist, the generated deploy workflow skips deployment with a notice (CI stays green).

## 4. Running
```sh
cp .env.example .env    # optional: GITHUB_TOKEN_BOOTSTRAP, TECHGENS_SECRET_KEY
docker compose up -d --build
```
Data lives in the `pgdata` and `techgens-data` volumes (back up both; `techgens-data` holds the secret key and Copilot
session state). To use a separate headless Copilot runtime instead of the bundled one:
`COPILOT_RUNTIME_URL=copilot-runtime:4321 COPILOT_CONNECTION_TOKEN=$(openssl rand -hex 32) docker compose --profile external-runtime up -d`.
