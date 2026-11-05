import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DomainError } from "@techgens/core";
import {
  AZURE_ROLE_IDS,
  NIL_GUID,
  constrainedRoleAssignmentCondition,
  generateAzureSetupScript,
  oidcSubject,
  planAzureEnvironments,
  validateAzureSetupInput,
  type AzureSetupInput,
} from "../src/index";

const input: AzureSetupInput = {
  subscriptionId: "11111111-2222-3333-4444-555555555555",
  tenantId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  location: "eastus2",
  githubOwner: "Acme-Co",
  githubRepo: "acme-notes",
  productSlug: "acme-notes",
};

describe("oidcSubject", () => {
  it("builds the GitHub Actions environment subject claim", () => {
    expect(oidcSubject("Acme-Co", "acme-notes", "production")).toBe(
      "repo:Acme-Co/acme-notes:environment:production",
    );
  });
});

describe("validateAzureSetupInput", () => {
  it("accepts valid input, the nil-GUID placeholder and display-style locations", () => {
    expect(validateAzureSetupInput(input)).toEqual([]);
    expect(
      validateAzureSetupInput({
        ...input,
        subscriptionId: NIL_GUID,
        tenantId: undefined,
        location: "East US 2",
      }),
    ).toEqual([]);
  });

  it("reports every problem with a descriptive message", () => {
    const problems = validateAzureSetupInput({
      subscriptionId: "not-a-guid",
      tenantId: "contoso.onmicrosoft.com",
      location: "",
      githubOwner: "-acme",
      githubRepo: "acme notes",
      productSlug: "Acme_Notes",
      environments: ["staging", "Prod!", "staging"],
      resourceGroupPrefix: "rg prefix",
    });
    const text = problems.join("\n");
    expect(text).toMatch(/subscriptionId must be a GUID .*"not-a-guid"/);
    expect(text).toMatch(/tenantId must be a GUID .*"contoso\.onmicrosoft\.com"/);
    expect(text).toMatch(/location is required/);
    expect(text).toMatch(/githubOwner "-acme"/);
    expect(text).toMatch(/githubRepo "acme notes"/);
    expect(text).toMatch(/productSlug "Acme_Notes" must be kebab-case/);
    expect(text).toMatch(/environment "Prod!"/);
    expect(text).toMatch(/environment "staging" is listed twice/);
    expect(text).toMatch(/resourceGroupPrefix "rg prefix"/);
    expect(validateAzureSetupInput({ ...input, environments: [] }).join()).toMatch(/at least one/);
    expect(validateAzureSetupInput({ ...input, location: "East-US" }).join()).toMatch(
      /not an Azure region name/,
    );
  });

  it("rejects shell metacharacters before they can reach the script", () => {
    for (const bad of [
      { githubRepo: "x'; rm -rf / #" },
      { productSlug: "a$(id)" },
      { githubOwner: "a`id`" },
      { location: "eastus;id" },
    ]) {
      expect(validateAzureSetupInput({ ...input, ...bad }).length, JSON.stringify(bad)).toBeGreaterThan(0);
    }
  });
});

describe("generateAzureSetupScript", () => {
  const result = generateAzureSetupScript(input);
  const { script } = result;

  it("throws a DomainError listing all problems for invalid input", () => {
    expect(() =>
      generateAzureSetupScript({ ...input, subscriptionId: "nope", tenantId: "also-bad" }),
    ).toThrow(DomainError);
    expect(() =>
      generateAzureSetupScript({ ...input, subscriptionId: "nope", tenantId: "also-bad" }),
    ).toThrow(/subscriptionId.*tenantId/);
  });

  it("returns a JSON-serialisable result", () => {
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("is a strict bash script that parses", () => {
    expect(script.startsWith("#!/usr/bin/env bash\n")).toBe(true);
    expect(script).toContain("\nset -euo pipefail\n");
    const check = spawnSync("bash", ["-n"], { input: script, encoding: "utf8" });
    expect(check.stderr).toBe("");
    expect(check.status).toBe(0);
  });

  it("creates a federated credential per environment with the right issuer, subject and audience", () => {
    for (const env of ["staging", "production"]) {
      expect(script).toContain(
        `setup_environment '${env}' 'acme-notes-${env}' 'rg-acme-notes-${env}' 'techgens-acme-notes-${env}' 'github-${env}' 'repo:Acme-Co/acme-notes:environment:${env}'`,
      );
    }
    expect(script).toContain("OIDC_ISSUER='https://token.actions.githubusercontent.com'");
    expect(script).toContain("OIDC_AUDIENCE='api://AzureADTokenExchange'");
    expect(script).toContain("az ad app federated-credential create");
  });

  it("checks for existing resources before creating them", () => {
    const pairs: Array<[string, string]> = [
      ["az group exists", "az group create"],
      ["az ad app list --filter", "az ad app create"],
      ["az ad sp list --filter", "az ad sp create"],
      ["az ad app federated-credential list", "az ad app federated-credential create"],
      ["az role assignment list", "az role assignment create"],
      ["az role definition list", "az role definition create"],
      ["az provider show", "az provider register"],
    ];
    for (const [query, create] of pairs) {
      expect(script, query).toContain(query);
      expect(script.indexOf(query), `${query} before ${create}`).toBeLessThan(script.indexOf(create));
    }
  });

  it("assigns least-privilege roles scoped to the resource group", () => {
    expect(script).toContain(`CONTRIBUTOR_ROLE_ID='${AZURE_ROLE_IDS.contributor}'`);
    expect(script).toContain(`RBAC_ADMIN_ROLE_ID='${AZURE_ROLE_IDS.roleBasedAccessControlAdministrator}'`);
    expect(script).toContain('rg_scope="$SUBSCRIPTION_SCOPE/resourceGroups/$resource_group"');
    expect(script).toContain(constrainedRoleAssignmentCondition());
    expect(constrainedRoleAssignmentCondition()).toContain(AZURE_ROLE_IDS.acrPull);
    expect(script).toContain("Microsoft.Resources/deployments/*");
    expect(script).not.toMatch(/User Access Administrator"? --scope|--role Owner|--role "Owner"/);
    expect(script).not.toMatch(/client-secret|credential reset|--create-password|--years/);
  });

  it("prints gh variable set commands for every variable", () => {
    for (const name of [
      "AZURE_CLIENT_ID",
      "AZURE_TENANT_ID",
      "AZURE_SUBSCRIPTION_ID",
      "AZURE_LOCATION",
      "AZURE_ENV_NAME",
    ]) {
      expect(script).toContain(`add_variable "$environment" ${name} `);
    }
    expect(script).toContain("gh variable set $2 --env $1 --repo $GITHUB_REPOSITORY --body");
  });

  it("returns the GitHub environment variables per environment", () => {
    expect(Object.keys(result.variables)).toEqual(["staging", "production"]);
    expect(result.variables.staging).toEqual({
      AZURE_CLIENT_ID: expect.stringMatching(/^<printed by the setup script/),
      AZURE_TENANT_ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      AZURE_SUBSCRIPTION_ID: "11111111-2222-3333-4444-555555555555",
      AZURE_LOCATION: "eastus2",
      AZURE_ENV_NAME: "acme-notes-staging",
      AZURE_RESOURCE_GROUP: "rg-acme-notes-staging",
    });
    const unknownTenant = generateAzureSetupScript({
      ...input,
      tenantId: undefined,
      subscriptionId: NIL_GUID,
    });
    expect(unknownTenant.variables.production!.AZURE_TENANT_ID).toMatch(/^<printed by the setup script/);
    expect(unknownTenant.variables.production!.AZURE_SUBSCRIPTION_ID).toMatch(
      /^<printed by the setup script/,
    );
    expect(result.steps.length).toBeGreaterThanOrEqual(4);
    for (const step of result.steps) expect(step.length).toBeGreaterThan(20);
  });

  it("honours custom environments and resource group prefixes", () => {
    const custom = { ...input, environments: ["qa"], resourceGroupPrefix: "acme" };
    expect(planAzureEnvironments(custom)).toEqual([
      {
        environment: "qa",
        azdEnvironmentName: "acme-notes-qa",
        resourceGroup: "acme-acme-notes-qa",
        appRegistrationName: "techgens-acme-notes-qa",
        federatedCredentialName: "github-qa",
        oidcSubject: "repo:Acme-Co/acme-notes:environment:qa",
      },
    ]);
    expect(Object.keys(generateAzureSetupScript(custom).variables)).toEqual(["qa"]);
  });
});

/** A file avoids Bash's platform-dependent handling of extra Node pipe descriptors on Windows. */
const FAKE_AZ = String.raw`
az() {
  printf 'AZ %s\n' "$*" >> "$FAKE_AZ_LOG"
  case "$*" in
    "account show --output none") ;;
    "account show --query id --output tsv") echo 99999999-9999-9999-9999-999999999999 ;;
    "account show --query tenantId --output tsv") echo "$FAKE_TENANT" ;;
    "account set "*|"provider register "*|"role definition create "*|"group create "*|"role assignment create "*) ;;
    "ad app federated-credential create "*|"ad app federated-credential update "*) ;;
    "provider show "*) if [ "$FAKE_STATE" = existing ]; then echo Registered; else echo NotRegistered; fi ;;
    "role definition list "*) if [ "$FAKE_STATE" = existing ]; then echo role-guid; fi ;;
    "group exists "*) if [ "$FAKE_STATE" = existing ]; then echo true; else echo false; fi ;;
    "group show "*) echo eastus2 ;;
    "ad app list "*) if [ "$FAKE_STATE" = existing ]; then echo existing-app-id; fi ;;
    "ad app create "*) echo new-app-id ;;
    "ad sp list "*) if [ "$FAKE_STATE" = existing ]; then echo existing-sp-id; fi ;;
    "ad sp create "*) echo new-sp-id ;;
    "ad app federated-credential list "*)
      if [ "$FAKE_STATE" = existing ]; then
        echo "repo:Acme-Co/acme-notes:environment:$(printf '%s' "$*" | sed -n "s/.*github-\([a-z0-9-]*\)'.*/\1/p")"
      fi ;;
    "role assignment list "*) if [ "$FAKE_STATE" = existing ]; then echo 1; else echo 0; fi ;;
    *) echo "unexpected az call: $*" >&2; return 1 ;;
  esac
}
export -f az
bash -s
`;

function runWithFakeAz(script: string, state: "fresh" | "existing", env: Record<string, string> = {}) {
  const directory = mkdtempSync(join(tmpdir(), "techgens-fake-az-"));
  const log = join(directory, "az-calls.log");
  writeFileSync(log, "");
  try {
    const result = spawnSync("bash", ["-c", FAKE_AZ], {
      cwd: directory,
      input: script,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        FAKE_AZ_LOG: "az-calls.log",
        FAKE_STATE: state,
        FAKE_TENANT: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        ...env,
      },
    });
    if (result.error) throw result.error;
    const calls = readFileSync(log, "utf8")
      .split("\n")
      .filter((line) => line.startsWith("AZ "))
      .map((line) => line.slice(3));
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, calls };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("setup script behaviour (fake az)", () => {
  const { script } = generateAzureSetupScript(input);

  it("creates everything on a fresh subscription and prints the GitHub variables", () => {
    const run = runWithFakeAz(script, "fresh");
    expect(run.stderr).not.toContain("unexpected az call");
    expect(run.status).toBe(0);
    const creates = run.calls.filter((c) => / (create|register) /.test(` ${c} `));
    expect(creates.filter((c) => c.startsWith("group create"))).toEqual([
      "group create --name rg-acme-notes-staging --location eastus2 --tags azd-env-name=acme-notes-staging managed-by=techgens --output none",
      "group create --name rg-acme-notes-production --location eastus2 --tags azd-env-name=acme-notes-production managed-by=techgens --output none",
    ]);
    expect(creates.filter((c) => c.startsWith("ad app create"))).toHaveLength(2);
    expect(creates.filter((c) => c.startsWith("role assignment create"))).toHaveLength(6);
    expect(creates.filter((c) => c.startsWith("role definition create"))).toHaveLength(1);
    expect(creates.filter((c) => c.startsWith("provider register"))).toHaveLength(6);

    const credentials = run.calls
      .filter((c) => c.startsWith("ad app federated-credential create"))
      .map((c) => JSON.parse(c.slice(c.indexOf("--parameters ") + 13, c.lastIndexOf(" --output none"))));
    expect(credentials).toEqual([
      expect.objectContaining({
        name: "github-staging",
        issuer: "https://token.actions.githubusercontent.com",
        subject: "repo:Acme-Co/acme-notes:environment:staging",
        audiences: ["api://AzureADTokenExchange"],
      }),
      expect.objectContaining({
        name: "github-production",
        subject: "repo:Acme-Co/acme-notes:environment:production",
      }),
    ]);
    const roleDefinition = run.calls.find((c) => c.startsWith("role definition create"))!;
    expect(JSON.parse(roleDefinition.slice(roleDefinition.indexOf("--role-definition ") + 18))).toMatchObject(
      {
        Actions: ["Microsoft.Resources/deployments/*"],
        AssignableScopes: ["/subscriptions/11111111-2222-3333-4444-555555555555"],
      },
    );
    const constrained = run.calls.find(
      (c) =>
        c.startsWith("role assignment create") &&
        c.includes(`--role ${AZURE_ROLE_IDS.roleBasedAccessControlAdministrator}`),
    )!;
    expect(constrained).toContain(
      "--scope /subscriptions/11111111-2222-3333-4444-555555555555/resourceGroups/rg-acme-notes-staging",
    );
    expect(constrained).toContain(
      `--condition ${constrainedRoleAssignmentCondition()} --condition-version 2.0`,
    );

    expect(run.stdout).toContain(
      'gh variable set AZURE_CLIENT_ID --env staging --repo Acme-Co/acme-notes --body "new-app-id"',
    );
    expect(run.stdout).toContain(
      'gh variable set AZURE_ENV_NAME --env production --repo Acme-Co/acme-notes --body "acme-notes-production"',
    );
    const resultLine = run.stdout.split("\n").find((l) => l.startsWith("TECHGENS_AZURE_SETUP_RESULT="))!;
    const parsed = JSON.parse(resultLine.slice("TECHGENS_AZURE_SETUP_RESULT=".length));
    expect(parsed.environments.production).toMatchObject({
      AZURE_CLIENT_ID: "new-app-id",
      AZURE_RESOURCE_GROUP: "rg-acme-notes-production",
    });
  });

  it("is idempotent: a second run against existing resources creates nothing", () => {
    const run = runWithFakeAz(script, "existing");
    expect(run.stderr).not.toContain("unexpected az call");
    expect(run.status).toBe(0);
    expect(run.calls.filter((c) => /\b(create|register|update)\b/.test(c))).toEqual([]);
    expect(run.stdout).toContain('--body "existing-app-id"');
  });

  it("falls back to the signed-in subscription for the nil-GUID placeholder", () => {
    const run = runWithFakeAz(
      generateAzureSetupScript({ ...input, subscriptionId: NIL_GUID }).script,
      "existing",
    );
    expect(run.status).toBe(0);
    expect(run.calls).toContain("account set --subscription 99999999-9999-9999-9999-999999999999");
  });

  it("refuses to run against a subscription in another tenant", () => {
    const run = runWithFakeAz(script, "fresh", { FAKE_TENANT: "ffffffff-ffff-ffff-ffff-ffffffffffff" });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/belongs to tenant ffffffff-ffff-ffff-ffff-ffffffffffff/);
    expect(run.calls.some((c) => c.startsWith("group create"))).toBe(false);
  });

  it("stops when an existing resource group is in a different region", () => {
    const run = runWithFakeAz(
      generateAzureSetupScript({ ...input, location: "westeurope" }).script,
      "existing",
    );
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/already exists in eastus2/);
  });
});
