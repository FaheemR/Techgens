import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { DOCUMENT_KINDS, DomainError, type DocumentKind } from "@techgens/core";
import { DEFAULT_POLICIES, loadRolesFromDir } from "@techgens/agents";
import {
  AVM_MODULES,
  CI_JOBS,
  DEPLOY_JOBS,
  PRODUCT_LABELS,
  REQUIRED_CHECKS,
  azdEnvironmentName,
  docsPathForDocument,
  renderProductRepo,
  validateProductRepoInput,
  type ProductRepoInput,
} from "../src/index";

// Parsed YAML/JSON documents are inspected loosely in assertions.
type Json = Record<string, any>;

const roles = loadRolesFromDir();
const input: ProductRepoInput = {
  productName: "Acme Notes",
  productSlug: "acme-notes",
  description: "Shared notes for small teams.",
  owner: "acme-co",
  repo: "acme-notes",
  defaultBranch: "main",
  integrationBranch: "develop",
  companyName: "Acme Labs",
  policies: DEFAULT_POLICIES,
  roles,
};
const files = renderProductRepo(input);
const byPath = new Map(files.map((f) => [f.path, f.content]));

function file(path: string): string {
  const content = byPath.get(path);
  if (content === undefined) throw new Error(`missing ${path}`);
  return content;
}

function yaml(path: string): Json {
  const doc = parseDocument(file(path));
  expect(doc.errors, path).toEqual([]);
  expect(doc.warnings, path).toEqual([]);
  return doc.toJS() as Json;
}

const stepWith = (job: Json, pattern: RegExp): Json | undefined =>
  (job.steps as Json[]).find((s) => pattern.test(String(s.uses ?? "")) || pattern.test(String(s.run ?? "")));

describe("renderProductRepo: files", () => {
  it("renders every expected path exactly once", () => {
    const expected = [
      "README.md",
      ".gitignore",
      ".editorconfig",
      ".dockerignore",
      "Dockerfile",
      "package.json",
      "tsconfig.json",
      "tsconfig.build.json",
      "vitest.config.ts",
      "src/server.ts",
      "test/health.test.ts",
      ".github/copilot-instructions.md",
      ".github/agents/backend-engineer.agent.md",
      ".github/agents/frontend-engineer.agent.md",
      ".github/agents/qa-engineer.agent.md",
      ".github/workflows/copilot-setup-steps.yml",
      ".github/workflows/ci.yml",
      ".github/workflows/codeql.yml",
      ".github/workflows/deploy.yml",
      ".github/dependabot.yml",
      ".github/pull_request_template.md",
      ".github/ISSUE_TEMPLATE/bug_report.yml",
      ".github/ISSUE_TEMPLATE/story.yml",
      "azure.yaml",
      "infra/main.bicep",
      "infra/main.parameters.json",
      "infra/resources.bicep",
      "infra/modules/fetch-container-image.bicep",
      "docs/README.md",
      "docs/product/README.md",
      "docs/architecture/README.md",
      "docs/architecture/adr/0000-record-architecture-decisions.md",
      "docs/qa/README.md",
      "docs/runbooks/README.md",
      "docs/releases/README.md",
      "docs/infra-versions.md",
    ];
    for (const path of expected) expect(byPath.has(path), path).toBe(true);
    expect(new Set(files.map((f) => f.path)).size).toBe(files.length);
  });

  it("produces clean text files (trailing newline, no template escapes leaking)", () => {
    for (const { path, content } of files) {
      expect(content.endsWith("\n"), path).toBe(true);
      expect(content, path).not.toContain("\\${");
      expect(content, path).not.toContain("[object Object]");
      expect(content, path).not.toMatch(/\r/);
    }
  });

  it("parses every YAML file", () => {
    const yamlFiles = files.filter((f) => /\.ya?ml$/.test(f.path));
    expect(yamlFiles.length).toBeGreaterThanOrEqual(8);
    for (const f of yamlFiles) yaml(f.path);
  });

  it("parses every JSON file", () => {
    for (const f of files.filter((x) => x.path.endsWith(".json")))
      expect(() => JSON.parse(f.content), f.path).not.toThrow();
  });
});

describe("Copilot configuration", () => {
  it("writes a custom agent file for every cloud-agent role and only those", () => {
    const agentFiles = files.filter((f) => f.path.startsWith(".github/agents/")).map((f) => f.path);
    const cloudRoles = roles
      .filter((r) => r.executor === "cloud-agent")
      .map((r) => `.github/agents/${r.id}.agent.md`);
    expect(agentFiles.sort()).toEqual(cloudRoles.sort());
    const backend = file(".github/agents/backend-engineer.agent.md");
    expect(backend).toMatch(/^---\nname: "backend-engineer"\ndescription: ".+"\n---\n/);
    expect(backend).toContain("Company engineering standards");
  });

  it("generates copilot-instructions.md from policies, description and repository conventions", () => {
    const instructions = file(".github/copilot-instructions.md");
    expect(instructions).toContain("Shared notes for small teams.");
    expect(instructions).toContain("### Engineering standards");
    expect(instructions).toContain("into `develop`");
    expect(instructions).toContain("Fixes #<issue-number>");
    expect(instructions).toMatch(/Tests are required/);
    expect(instructions).toContain("docs/architecture/adr/");
  });

  it("defines the copilot-setup-steps workflow in the shape Copilot requires", () => {
    const wf = yaml(".github/workflows/copilot-setup-steps.yml");
    expect(Object.keys(wf.jobs)).toEqual(["copilot-setup-steps"]);
    expect(wf.on).toHaveProperty("workflow_dispatch");
    expect(wf.on.push.paths).toEqual([".github/workflows/copilot-setup-steps.yml"]);
    expect(wf.on.pull_request.paths).toEqual([".github/workflows/copilot-setup-steps.yml"]);
    const job = wf.jobs["copilot-setup-steps"];
    expect(job["runs-on"]).toBe("ubuntu-latest");
    expect(job.permissions).toEqual({ contents: "read" });
    expect(job["timeout-minutes"]).toBeLessThanOrEqual(59);
    expect(stepWith(job, /^actions\/checkout@/)).toBeDefined();
    const node = stepWith(job, /^actions\/setup-node@/)!;
    expect(node.with["node-version"]).toBe(22);
    expect(node.with.cache).toContain("hashFiles('package-lock.json')");
    const install = stepWith(job, /npm ci/)!;
    expect(install.run).toContain("npm install");
  });
});

describe("CI, CodeQL and deploy workflows", () => {
  it("names CI jobs exactly like REQUIRED_CHECKS and runs them on every pull request", () => {
    const wf = yaml(".github/workflows/ci.yml");
    expect(REQUIRED_CHECKS).toEqual([CI_JOBS.buildAndTest, CI_JOBS.dockerBuild]);
    expect(Object.values(wf.jobs).map((j) => (j as Json).name)).toEqual([...REQUIRED_CHECKS]);
    expect(wf.on.pull_request ?? {}).not.toHaveProperty("paths");
    expect(wf.on.push.branches).toEqual(["develop", "main"]);
    const build = wf.jobs["build-and-test"];
    for (const script of ["npm run lint", "npm run typecheck", "npm test", "npm run build"]) {
      expect(stepWith(build, new RegExp(`^${script}$`)), script).toBeDefined();
    }
    const docker = wf.jobs["docker-build"];
    expect(stepWith(docker, /docker build/)).toBeDefined();
    expect(file(".github/workflows/ci.yml")).not.toMatch(/docker push|--push/);
  });

  it("runs CodeQL v4 for javascript-typescript", () => {
    const wf = yaml(".github/workflows/codeql.yml");
    const job = wf.jobs.analyze;
    expect(job.permissions["security-events"]).toBe("write");
    expect(stepWith(job, /^github\/codeql-action\/init@v4$/)!.with.languages).toBe("javascript-typescript");
    expect(stepWith(job, /^github\/codeql-action\/analyze@v4$/)).toBeDefined();
  });

  it("deploys develop to staging and main to production with OIDC", () => {
    const text = file(".github/workflows/deploy.yml");
    const wf = yaml(".github/workflows/deploy.yml");
    expect(wf.permissions).toEqual({ "id-token": "write", contents: "read" });
    expect(text).not.toMatch(/secrets\./);
    const cases = [
      { job: DEPLOY_JOBS.staging, env: "staging", branch: "develop", min: "0" },
      { job: DEPLOY_JOBS.production, env: "production", branch: "main", min: "1" },
    ];
    for (const c of cases) {
      const job = wf.jobs[c.job];
      expect(job.name).toBe(c.job);
      expect(job.environment.name).toBe(c.env);
      expect(job.if).toBe(`github.ref == 'refs/heads/${c.branch}'`);
      expect(job.concurrency).toEqual({ group: `deploy-${c.env}`, "cancel-in-progress": false });
      expect(job.env.CONTAINER_APP_MIN_REPLICAS).toBe(c.min);
      expect(job.env.AZURE_ENV_NAME).toBe(`\${{ vars.AZURE_ENV_NAME || 'acme-notes-${c.env}' }}`);
      const login = stepWith(job, /^azure\/login@v2$/)!;
      expect(login.with).toEqual({
        "client-id": "${{ vars.AZURE_CLIENT_ID }}",
        "tenant-id": "${{ vars.AZURE_TENANT_ID }}",
        "subscription-id": "${{ vars.AZURE_SUBSCRIPTION_ID }}",
      });
      expect(stepWith(job, /^Azure\/setup-azd@v2$/)).toBeDefined();
      expect(stepWith(job, /azd auth login .*--federated-credential-provider github/)).toBeDefined();
      expect(
        stepWith(job, /azd env new "\$AZURE_ENV_NAME" --location "\$AZURE_LOCATION" --subscription/),
      ).toBeDefined();
      expect(stepWith(job, /^azd provision --no-prompt$/)).toBeDefined();
      expect(stepWith(job, /azd deploy --all --no-prompt/)!.run).toContain("SERVICE_WEB_URI");
      expect(stepWith(job, /\$SERVICE_URI\/health/)).toBeDefined();
      // Skips gracefully (with a notice) until Azure is connected: every later step is gated on the check.
      const check = (job.steps as Json[])[0]!;
      expect(check.run).toContain('[ -z "$AZURE_CLIENT_ID" ]');
      expect(check.run).toContain("::notice");
      for (const step of (job.steps as Json[]).slice(1))
        expect(step.if, step.name).toBe("steps.azure.outputs.connected == 'true'");
    }
  });

  it("configures Dependabot for npm and GitHub Actions against the integration branch", () => {
    const config = yaml(".github/dependabot.yml");
    expect(config.updates.map((u: Json) => u["package-ecosystem"])).toEqual(["npm", "github-actions"]);
    for (const update of config.updates) {
      expect(update.schedule.interval).toBe("weekly");
      expect(update["target-branch"]).toBe("develop");
    }
  });
});

describe("Node.js application", () => {
  it("declares the npm scripts, Node 22+ and strict TypeScript", () => {
    const pkg = JSON.parse(file("package.json"));
    expect(pkg.name).toBe("acme-notes");
    expect(pkg.type).toBe("module");
    expect(pkg.engines.node).toMatch(/^>=22\./);
    for (const script of ["build", "start", "dev", "lint", "typecheck", "test", "test:e2e"])
      expect(pkg.scripts).toHaveProperty(script);
    expect(pkg.scripts.test).toBe("vitest run");
    expect(Object.keys(pkg.devDependencies).sort()).toEqual(["@types/node", "typescript", "vitest"]);
    expect(JSON.parse(file("tsconfig.json")).compilerOptions.strict).toBe(true);
  });

  it("serves /health and / on PORT (default 8080) without framework dependencies", () => {
    const server = file("src/server.ts");
    expect(server).toContain('"/health"');
    expect(server).toContain('status: "ok", version');
    expect(server).toContain("parsePort(process.env.PORT)");
    expect(server).toContain("fallback = 8080");
    expect(server.match(/^import .* from "([^"]+)";$/gm)?.every((line) => /"node:/.test(line))).toBe(true);
    expect(file("test/health.test.ts")).toContain("server.listen(0");
  });

  it("embeds product text safely", () => {
    const tricky = renderProductRepo({
      ...input,
      productName: 'Acme "Notes" </script> ${x}',
      description: "Line `one`\nline two",
    });
    const server = tricky.find((f) => f.path === "src/server.ts")!.content;
    expect(server).toContain(`name: ${JSON.stringify('Acme "Notes" </script> ${x}')},`);
    expect(server).toContain(`description: ${JSON.stringify("Line `one`\nline two")},`);
  });

  it("builds a multi-stage, non-root container image with a health check", () => {
    const dockerfile = file("Dockerfile");
    expect(dockerfile.match(/^FROM node:\$\{NODE_VERSION\}-alpine AS /gm)).toHaveLength(2);
    expect(dockerfile).toContain("ARG NODE_VERSION=22");
    expect(dockerfile).toMatch(/^USER node$/m);
    expect(dockerfile).toMatch(/^HEALTHCHECK /m);
    expect(dockerfile).toContain("/health");
    expect(dockerfile).toContain("EXPOSE 8080");
    expect(file(".dockerignore")).toContain("**/node_modules");
  });
});

describe("Azure infrastructure (azd + Bicep)", () => {
  it("declares the azd project with a containerapp service named web", () => {
    const azure = yaml("azure.yaml");
    expect(azure.name).toBe("acme-notes");
    expect(azure.infra).toMatchObject({ provider: "bicep", path: "infra" });
    expect(azure.services.web).toMatchObject({ project: ".", language: "ts", host: "containerapp" });
    expect(azure.services.web.docker.path).toBe("./Dockerfile");
  });

  it("references only pinned Azure Verified Modules", () => {
    const bicepFiles = files.filter((f) => f.path.endsWith(".bicep"));
    const refs = bicepFiles.flatMap((f) =>
      [...f.content.matchAll(/^module \w+ '([^']+)'/gm)].map((m) => m[1]!),
    );
    const registryRefs = refs.filter((ref) => !ref.endsWith(".bicep"));
    for (const ref of registryRefs)
      expect(ref).toMatch(/^br\/public:avm\/res\/[a-z0-9-]+\/[a-z0-9-]+:\d+\.\d+\.\d+$/);
    expect(registryRefs.sort()).toEqual(Object.values(AVM_MODULES).sort());
    for (const local of refs.filter((ref) => ref.endsWith(".bicep")))
      expect(byPath.has(`infra/${local}`), local).toBe(true);
    for (const f of bicepFiles) expect(f.content, f.path).not.toMatch(/br\/public:[^'\s]*:latest|br:/);
  });

  it("follows azd conventions in main.bicep and its parameters file", () => {
    const main = file("infra/main.bicep");
    expect(main).toMatch(/^targetScope = 'subscription'$/m);
    expect(main).toContain("'rg-${environmentName}'");
    for (const output of ["AZURE_CONTAINER_REGISTRY_ENDPOINT", "SERVICE_WEB_URI", "AZURE_RESOURCE_GROUP"]) {
      expect(main).toMatch(new RegExp(`^output ${output} string = `, "m"));
    }
    const declared = [...main.matchAll(/^param (\w+) \w+( = .+)?$/gm)].map((m) => ({
      name: m[1]!,
      optional: Boolean(m[2]),
    }));
    const parameters = JSON.parse(file("infra/main.parameters.json")).parameters as Record<
      string,
      { value: string }
    >;
    expect(declared.map((p) => p.name)).toEqual(
      expect.arrayContaining(["environmentName", "location", "principalId"]),
    );
    expect(Object.keys(parameters).sort()).toEqual(declared.map((p) => p.name).sort());
    expect(parameters.environmentName!.value).toBe("${AZURE_ENV_NAME}");
    expect(parameters.webExists!.value).toBe("${SERVICE_WEB_RESOURCE_EXISTS=false}");
  });

  it("configures the container app: identity with AcrPull, ingress 8080, /health probes, scale and telemetry", () => {
    const resources = file("infra/resources.bicep");
    expect(resources).toContain("'azd-service-name': 'web'");
    expect(resources).toContain("ingressTargetPort: webPort");
    expect(resources).toContain("var webPort = 8080");
    expect(resources).toContain("roleIds.acrPull");
    expect(resources).toContain("7f951dda-4ed3-4680-a7ca-43fe172d538d");
    expect(resources).toContain("userAssignedResourceIds");
    expect(resources).toContain("identity: webIdentity.outputs.resourceId");
    expect(resources).toMatch(/path: '\/health'/);
    expect(resources).toContain("minReplicas: minReplicas");
    expect(resources).toContain("APPLICATIONINSIGHTS_CONNECTION_STRING");
    expect(resources).not.toMatch(/acrAdminUserEnabled: true/);
  });
});

describe("labels, checks and docs paths", () => {
  it("defines unique, valid labels including the ones Techgens applies to issues", () => {
    const names = PRODUCT_LABELS.map((l) => l.name);
    expect(new Set(names).size).toBe(names.length);
    for (const label of PRODUCT_LABELS) {
      expect(label.color).toMatch(/^[0-9A-F]{6}$/);
      expect(label.description.length).toBeLessThanOrEqual(100);
    }
    expect(names).toEqual(
      expect.arrayContaining([
        "epic",
        "story",
        "task",
        "bug",
        "techgens",
        "priority: p0",
        "priority: p1",
        "priority: p2",
        "priority: p3",
        "size: S",
        "size: M",
        "size: L",
        "area: frontend",
        "area: backend",
        "area: infra",
        "area: docs",
        "area: qa",
      ]),
    );
  });

  it("maps document kinds to repository paths", () => {
    const cases: Array<[DocumentKind, string, string]> = [
      ["prd", "Checkout v2", "docs/product/checkout-v2.md"],
      ["ux_spec", "Checkout flows", "docs/product/checkout-flows.md"],
      ["research", "Market scan", "docs/product/market-scan.md"],
      ["charter", "Acme Notes charter", "docs/product/acme-notes-charter.md"],
      ["roadmap", "2027 Roadmap", "docs/product/2027-roadmap.md"],
      ["architecture", "System Design", "docs/architecture/system-design.md"],
      ["threat_model", "Threat model", "docs/architecture/threat-model.md"],
      ["adr", "Use PostgreSQL", "docs/architecture/adr/use-postgresql.md"],
      ["adr", "ADR 7: Use PostgreSQL", "docs/architecture/adr/0007-use-postgresql.md"],
      ["adr", "0012 Adopt OpenTelemetry", "docs/architecture/adr/0012-adopt-opentelemetry.md"],
      ["test_plan", "Release 1.0 test plan", "docs/qa/release-10-test-plan.md"],
      ["runbook", "Database failover", "docs/runbooks/database-failover.md"],
      ["release_notes", "v1.2.0", "docs/releases/v120.md"],
      ["plan", "Delivery plan", "docs/plan/delivery-plan.md"],
      ["report", "Weekly report", "docs/report/weekly-report.md"],
      ["policy", "Security policy", "docs/policy/security-policy.md"],
      ["other", "Notes", "docs/other/notes.md"],
    ];
    for (const [kind, title, path] of cases)
      expect(docsPathForDocument(kind, title), `${kind}: ${title}`).toBe(path);
  });

  it("always yields a safe Markdown path inside docs/", () => {
    for (const kind of DOCUMENT_KINDS) {
      for (const title of ["", "../../etc/passwd", "日本語のタイトル", "  Spaces  &  Symbols!  "]) {
        const path = docsPathForDocument(kind, title);
        expect(path).toMatch(/^docs\/[a-z0-9/-]+\/[a-z0-9-]+\.md$/);
        expect(path).not.toContain("..");
      }
    }
    expect(docsPathForDocument("prd", "日本語")).toBe(docsPathForDocument("prd", "日本語"));
    expect(docsPathForDocument("prd", "日本語")).not.toBe(docsPathForDocument("prd", "中文"));
  });

  it("ships a README for every docs folder that documents land in", () => {
    for (const kind of ["prd", "architecture", "test_plan", "runbook", "release_notes"] as const) {
      const folder = docsPathForDocument(kind, "x").replace(/\/[^/]+$/, "");
      expect(byPath.has(`${folder}/README.md`), folder).toBe(true);
    }
  });
});

describe("input validation", () => {
  it("rejects inputs that would produce a broken or unsafe repository", () => {
    const bad = {
      ...input,
      productSlug: "Acme Notes",
      owner: "-acme",
      defaultBranch: "main\n  evil: true",
      integrationBranch: "develop",
    };
    const problems = validateProductRepoInput(bad);
    expect(problems.join("\n")).toMatch(/productSlug/);
    expect(problems.join("\n")).toMatch(/owner/);
    expect(problems.join("\n")).toMatch(/defaultBranch/);
    expect(() => renderProductRepo(bad)).toThrow(DomainError);
    expect(validateProductRepoInput({ ...input, integrationBranch: "main" }).join()).toMatch(/must differ/);
    expect(validateProductRepoInput(input)).toEqual([]);
  });

  it("normalizes the Azure location and keeps azd environment names within 64 characters", () => {
    const deploy = renderProductRepo({ ...input, azure: { location: "West Europe" } }).find((f) =>
      f.path.endsWith("deploy.yml"),
    )!;
    expect(deploy.content).toContain("vars.AZURE_LOCATION || 'westeurope'");
    expect(file(".github/workflows/deploy.yml")).toContain("vars.AZURE_LOCATION || 'eastus2'");
    const long = "a".repeat(58) + "-bcd";
    expect(azdEnvironmentName(long, "production").length).toBeLessThanOrEqual(64);
    expect(azdEnvironmentName("acme-notes", "staging")).toBe("acme-notes-staging");
  });
});
