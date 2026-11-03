import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { DomainError, slugify, truncate } from "@techgens/core";
import { loadRolesFromDir } from "@techgens/agents";
import {
  InMemoryGitHub,
  OctokitGitHub,
  buildAppManifest,
  exchangeManifestCode,
  exchangeOAuthCode,
  installationOctokit,
  manifestFormAction,
  oauthAuthorizeUrl,
  refreshUserToken,
  tokenNeedsRefresh,
  type AppCredentials,
  type GitHubPort,
  type RepoRef,
  type UserTokens,
} from "@techgens/github";
import { PRODUCT_LABELS, REQUIRED_CHECKS, docsPathForDocument, renderProductRepo } from "@techgens/repo-template";
import { CopilotAgentRuntime } from "@techgens/runtime";
import { schema, type Approval, type Product } from "@techgens/db";
import type { Techgens } from "../app";
import { DEFAULT_SETTINGS, type GitHubConnectionMeta } from "../settings";

const SECRET_PAT = "github.token";
const SECRET_APP = "github.app";
const SECRET_USER_TOKENS = "github.userTokens";

export class GitHubService {
  private ceoPort: GitHubPort | null = null;
  private botPorts = new Map<string, GitHubPort>();
  private appCreds: AppCredentials | null = null;
  private pendingStates = new Map<string, number>();
  /** Exposed for demo mode and tests. */
  memory: InMemoryGitHub | null = null;

  constructor(private readonly app: Techgens) {}

  get connected(): boolean {
    return this.ceoPort !== null;
  }

  async meta(): Promise<GitHubConnectionMeta> {
    return this.app.settings.get("github");
  }

  /** Restores the connection on startup (demo mode → in-memory GitHub). */
  async restore(): Promise<void> {
    if (this.app.config.agentRuntime === "fake") {
      this.memory = new InMemoryGitHub();
      this.ceoPort = this.memory;
      const company = await this.app.company.get();
      await this.app.settings.set("github", { ...DEFAULT_SETTINGS.github, mode: "demo", login: "ceo", userId: 1, owner: company.githubOwner ?? "acme" });
      return;
    }
    const appJson = await this.app.settings.getSecret(SECRET_APP);
    if (appJson) this.appCreds = JSON.parse(appJson) as AppCredentials;
    const tokens = await this.app.settings.getSecret(SECRET_USER_TOKENS);
    if (tokens && this.appCreds) {
      await this.useToken((await this.freshUserTokens(JSON.parse(tokens) as UserTokens)).accessToken).catch((err) => this.app.log.warn({ err: (err as Error).message }, "GitHub App user token invalid"));
      return;
    }
    const pat = (await this.app.settings.getSecret(SECRET_PAT)) ?? this.app.config.githubToken;
    if (pat) await this.connectToken(pat).catch((err) => this.app.log.warn({ err: (err as Error).message }, "stored GitHub token is invalid"));
  }

  private async useToken(token: string): Promise<{ login: string; id: number }> {
    const port = new OctokitGitHub(token);
    const viewer = await port.getViewer();
    this.ceoPort = port;
    this.botPorts.clear();
    if (this.app.runtime instanceof CopilotAgentRuntime) await this.app.runtime.reconfigure({ token });
    return viewer;
  }

  async connectToken(token: string): Promise<GitHubConnectionMeta> {
    const viewer = await this.useToken(token.trim()).catch((err) => {
      throw new DomainError(`GitHub rejected the token: ${(err as Error).message}`);
    });
    await this.app.settings.setSecret(SECRET_PAT, token.trim());
    const company = await this.app.company.get();
    const meta: GitHubConnectionMeta = { ...DEFAULT_SETTINGS.github, mode: "pat", login: viewer.login, userId: viewer.id, owner: company.githubOwner ?? viewer.login };
    await this.app.settings.set("github", meta);
    await this.app.bus.emit({ type: "github.synced", actorType: "ceo", summary: `GitHub connected as ${viewer.login}` });
    return meta;
  }

  async disconnect(): Promise<void> {
    for (const key of [SECRET_PAT, SECRET_APP, SECRET_USER_TOKENS]) await this.app.settings.deleteSecret(key);
    this.ceoPort = null;
    this.botPorts.clear();
    this.appCreds = null;
    await this.app.settings.set("github", { ...DEFAULT_SETTINGS.github });
    if (this.app.runtime instanceof CopilotAgentRuntime) await this.app.runtime.reconfigure({ token: undefined });
  }

  // ---- GitHub App (manifest flow) ---------------------------------------------------------------------------------
  private newState(): string {
    const state = randomBytes(16).toString("hex");
    this.pendingStates.set(state, Date.now() + 30 * 60_000);
    return state;
  }

  private consumeState(state: string): void {
    const exp = this.pendingStates.get(state);
    this.pendingStates.delete(state);
    if (!exp || exp < Date.now()) throw new DomainError("GitHub flow expired or invalid state; start again from Settings.", "forbidden");
  }

  async startAppManifest(owner?: string | null): Promise<{ action: string; manifest: string; state: string }> {
    const company = await this.app.company.get();
    const { publicUrl, webUrl } = this.app.config;
    const name = `${truncate(company.name, 18)} Techgens ${randomBytes(2).toString("hex")}`;
    const manifest = {
      ...buildAppManifest({ name, homepageUrl: webUrl, redirectUrl: `${publicUrl}/api/github/app/callback`, callbackUrl: `${publicUrl}/api/github/oauth/callback` }),
      setup_url: `${publicUrl}/api/github/app/installed`,
      setup_on_update: true,
    };
    const state = this.newState();
    if (owner) await this.app.company.update({ githubOwner: owner });
    return { action: `${manifestFormAction(owner)}?state=${state}`, manifest: JSON.stringify(manifest), state };
  }

  /** Manifest conversion → app created; continue with installation on the owner account. */
  async handleAppCreated(code: string, state: string): Promise<string> {
    this.consumeState(state);
    this.appCreds = await exchangeManifestCode(code);
    await this.app.settings.setSecret(SECRET_APP, JSON.stringify(this.appCreds));
    const meta = await this.meta();
    await this.app.settings.set("github", { ...meta, appSlug: this.appCreds.slug, appId: this.appCreds.id });
    return `https://github.com/apps/${this.appCreds.slug}/installations/new`;
  }

  /** After installation GitHub calls the setup URL → authorise the CEO (user-to-server token). */
  async handleAppInstalled(): Promise<string> {
    if (!this.appCreds) throw new DomainError("GitHub App not configured", "unavailable");
    return oauthAuthorizeUrl(this.appCreds.clientId, `${this.app.config.publicUrl}/api/github/oauth/callback`, this.newState());
  }

  async handleOAuthCallback(code: string, state: string): Promise<void> {
    this.consumeState(state);
    if (!this.appCreds) throw new DomainError("GitHub App not configured", "unavailable");
    const tokens = await exchangeOAuthCode(this.appCreds, code, `${this.app.config.publicUrl}/api/github/oauth/callback`);
    await this.app.settings.setSecret(SECRET_USER_TOKENS, JSON.stringify(tokens));
    const viewer = await this.useToken(tokens.accessToken);
    const company = await this.app.company.get();
    await this.app.settings.set("github", { mode: "app", login: viewer.login, userId: viewer.id, owner: company.githubOwner ?? viewer.login, appSlug: this.appCreds.slug, appId: this.appCreds.id });
    await this.app.bus.emit({ type: "github.synced", actorType: "ceo", summary: `GitHub App connected as ${viewer.login}` });
  }

  private async freshUserTokens(tokens: UserTokens): Promise<UserTokens> {
    if (!this.appCreds || !tokens.refreshToken || !tokenNeedsRefresh(tokens)) return tokens;
    const next = await refreshUserToken(this.appCreds, tokens.refreshToken);
    await this.app.settings.setSecret(SECRET_USER_TOKENS, JSON.stringify(next));
    return next;
  }

  /** Periodic maintenance: refresh expiring GitHub App user tokens. */
  async maintain(): Promise<void> {
    const raw = this.appCreds ? await this.app.settings.getSecret(SECRET_USER_TOKENS) : null;
    if (!raw) return;
    const before = JSON.parse(raw) as UserTokens;
    const after = await this.freshUserTokens(before);
    if (after.accessToken !== before.accessToken) await this.useToken(after.accessToken);
  }

  // ---- Ports ---------------------------------------------------------------------------------------------------------
  port(): GitHubPort {
    if (!this.ceoPort) throw new DomainError("GitHub is not connected. Connect it in Settings.", "unavailable");
    return this.ceoPort;
  }

  /** Identity for agent-authored comments/reviews/issues: the GitHub App bot when installed, else the CEO token. */
  async botPort(owner: string): Promise<GitHubPort> {
    if (!this.appCreds || this.memory) return this.port();
    const cached = this.botPorts.get(owner);
    if (cached) return cached;
    const octokit = await installationOctokit(this.appCreds, owner).catch(() => null);
    const port = octokit ? new OctokitGitHub(octokit) : this.port();
    this.botPorts.set(owner, port);
    return port;
  }

  repoOf(product: Pick<Product, "repoOwner" | "repoName">): RepoRef | null {
    return product.repoOwner && product.repoName ? { owner: product.repoOwner, name: product.repoName } : null;
  }

  async bootstrapProductRepo(productId: string, options: { private?: boolean } = {}): Promise<Product> {
    const port = this.port();
    let product = await this.app.company.getProduct(productId);
    const company = await this.app.company.get();
    const viewer = await port.getViewer();
    const meta = await this.meta();
    const repo: RepoRef = this.repoOf(product) ?? { owner: company.githubOwner ?? meta.owner ?? viewer.login, name: product.slug || slugify(product.name) };
    let info = await port.getRepository(repo);
    if (!info) {
      info = await port.createRepository({ owner: repo.owner, name: repo.name, description: truncate(product.description || product.name, 300), private: options.private ?? true, ownerIsOrg: repo.owner.toLowerCase() !== viewer.login.toLowerCase() });
    }
    const ref = { owner: info.owner, name: info.name };
    const files = renderProductRepo({
      productName: product.name,
      productSlug: product.slug,
      description: product.description,
      owner: info.owner,
      repo: info.name,
      defaultBranch: info.defaultBranch,
      integrationBranch: product.integrationBranch,
      companyName: company.name,
      policies: company.policies,
      roles: loadRolesFromDir(),
    });
    // Approved specs (PRD, UX, architecture, ADRs…) ship with the skeleton so coding agents have full context.
    const approvedDocs = (await this.app.docs.list({ limit: 500 })).filter((d) => d.productId === product.id && d.status === "approved");
    for (const d of approvedDocs) files.push({ path: docsPathForDocument(d.kind as never, d.title), content: `${d.content.trim()}\n` });
    await port.commitFiles(ref, { branch: info.defaultBranch, message: "chore: bootstrap product repository (Techgens)", files });
    await port.createBranch(ref, product.integrationBranch, info.defaultBranch);
    await port.ensureLabels(ref, PRODUCT_LABELS);
    await port.ensureEnvironment(ref, "staging", { branches: [product.integrationBranch] });
    await port.ensureEnvironment(ref, "production", { reviewerUserIds: [viewer.id], branches: [info.defaultBranch] });
    for (const branch of [product.integrationBranch, info.defaultBranch]) {
      await port.protectBranch(ref, branch, { requiredChecks: [...REQUIRED_CHECKS], requireReviews: false }).catch((err) => this.app.log.warn({ err: (err as Error).message, branch }, "branch protection not applied"));
    }
    product = await this.app.company.updateProduct(product.id, { repoOwner: info.owner, repoName: info.name, defaultBranch: info.defaultBranch });
    await this.app.bus.emit({ type: "github.synced", summary: `Repository ${info.owner}/${info.name} bootstrapped`, subjectType: "product", subjectId: product.id, data: { url: info.url } });
    return product;
  }

  /** Mirrors a work item as a GitHub issue (sub-issue of its parent's issue). Non-fatal. */
  async syncWorkItemToIssue(itemId: string): Promise<{ githubUrl: string } | null> {
    if (!this.connected) return null;
    const item = await this.app.work.get(itemId);
    if (item.githubIssueNumber || !item.productId || !["epic", "story", "task", "bug"].includes(item.kind)) return null;
    const product = await this.app.company.getProduct(item.productId);
    const repo = this.repoOf(product);
    if (!repo) return null;
    try {
      const port = await this.botPort(repo.owner);
      const labels = [item.kind, "techgens", `priority: ${item.priority}`].filter((l) => PRODUCT_LABELS.some((p: { name: string }) => p.name === l));
      const body = `${item.description}\n\n---\n_Managed by Techgens · work item \`${item.id}\`${item.forCodingAgent ? " · implemented by Copilot coding agent" : ""}_`;
      const issue = await port.createIssue(repo, { title: item.title, body, labels });
      if (item.parentId) {
        const parent = await this.app.work.get(item.parentId);
        if (parent.githubIssueNumber) await port.addSubIssue(repo, parent.githubIssueNumber, issue.id).catch((err) => this.app.log.warn({ err: (err as Error).message }, "sub-issue link failed"));
      }
      await this.app.work.update(item.id, { githubRepo: `${repo.owner}/${repo.name}`, githubIssueNumber: issue.number, githubIssueNodeId: issue.nodeId, githubUrl: issue.url });
      return { githubUrl: issue.url };
    } catch (err) {
      this.app.log.warn({ err: (err as Error).message, itemId }, "issue sync failed");
      return null;
    }
  }

  /** Publishes approved documents into the product repository's docs/ folder on the integration branch. */
  async publishDocuments(approval: Approval): Promise<string> {
    if (!this.connected || !approval.initiativeId || !approval.documentIds.length) return "";
    const ini = await this.app.lifecycle.get(approval.initiativeId);
    if (!ini.productId) return "";
    const product = await this.app.company.getProduct(ini.productId);
    const repo = this.repoOf(product);
    if (!repo) return "Approved documents will be published once the repository exists.";
    const docs = await this.app.docs.list({ ids: approval.documentIds });
    const files = docs.map((d) => ({ path: docsPathForDocument(d.kind as never, d.title), content: `${d.content.trim()}\n` }));
    const port = await this.botPort(repo.owner);
    const message = `docs: ${approval.kind} approved — ${truncate(approval.title, 60)}`;
    try {
      await port.commitFiles(repo, { branch: product.integrationBranch, message, files });
      return `Published ${files.length} document(s) to ${repo.owner}/${repo.name}@${product.integrationBranch}.`;
    } catch {
      const branch = `techgens/docs-${Date.now()}`;
      await port.commitFiles(repo, { branch, baseBranch: product.integrationBranch, message, files });
      const pr = await port.createPullRequest(repo, { head: branch, base: product.integrationBranch, title: message, body: "Approved documents published by Techgens." });
      return `Opened ${pr.url} to publish ${files.length} approved document(s).`;
    }
  }

  async productForInitiative(initiativeId: string | null): Promise<{ product: Product; repo: RepoRef } | null> {
    if (!initiativeId) return null;
    const [row] = await this.app.db.select({ productId: schema.initiatives.productId }).from(schema.initiatives).where(eq(schema.initiatives.id, initiativeId));
    if (!row?.productId) return null;
    const product = await this.app.company.getProduct(row.productId);
    const repo = this.repoOf(product);
    return repo ? { product, repo } : null;
  }
}
