import { App, type Octokit } from "octokit";

/**
 * GitHub App support (manifest flow). The app provides:
 *  - a user-to-server token for the CEO (Copilot SDK, Copilot cloud agent assignment, CEO approvals), and
 *  - installation tokens so agent comments/reviews/issues are attributed to `<app>[bot]`.
 * Webhooks are disabled: Techgens runs locally and polls.
 */
export interface AppManifestInput {
  name: string;
  homepageUrl: string;
  /** Where GitHub redirects after the app is created (manifest conversion). */
  redirectUrl: string;
  /** OAuth callback for user authorisation. */
  callbackUrl: string;
}

export function buildAppManifest(input: AppManifestInput): Record<string, unknown> {
  return {
    name: input.name,
    url: input.homepageUrl,
    redirect_url: input.redirectUrl,
    callback_urls: [input.callbackUrl],
    request_oauth_on_install: false,
    public: false,
    hook_attributes: { url: `${input.homepageUrl}/webhooks/github`, active: false },
    default_permissions: {
      metadata: "read",
      contents: "write",
      issues: "write",
      pull_requests: "write",
      actions: "write",
      checks: "read",
      statuses: "read",
      deployments: "write",
      environments: "write",
      administration: "write",
      workflows: "write",
      actions_variables: "write",
      repository_projects: "write",
      organization_projects: "write",
    },
    default_events: [],
  };
}

export function manifestFormAction(org?: string | null): string {
  return org ? `https://github.com/organizations/${encodeURIComponent(org)}/settings/apps/new` : "https://github.com/settings/apps/new";
}

export interface AppCredentials {
  id: number;
  slug: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
  htmlUrl: string;
}

export async function exchangeManifestCode(code: string, fetchImpl: typeof fetch = fetch): Promise<AppCredentials> {
  const res = await fetchImpl(`https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`, {
    method: "POST",
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
  });
  if (!res.ok) throw new Error(`manifest conversion failed: ${res.status} ${await res.text()}`);
  const d = (await res.json()) as Record<string, any>;
  return { id: d.id, slug: d.slug, clientId: d.client_id, clientSecret: d.client_secret, privateKey: d.pem, htmlUrl: d.html_url };
}

export function oauthAuthorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, state });
  return `https://github.com/login/oauth/authorize?${q}`;
}

export interface UserTokens {
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms. */
  expiresAt?: number;
  refreshExpiresAt?: number;
}

async function tokenRequest(body: Record<string, string>, fetchImpl: typeof fetch): Promise<UserTokens> {
  const res = await fetchImpl("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = (await res.json()) as Record<string, any>;
  if (!res.ok || d.error) throw new Error(`token exchange failed: ${d.error_description ?? d.error ?? res.status}`);
  const now = Date.now();
  return {
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    expiresAt: d.expires_in ? now + d.expires_in * 1000 : undefined,
    refreshExpiresAt: d.refresh_token_expires_in ? now + d.refresh_token_expires_in * 1000 : undefined,
  };
}

export function exchangeOAuthCode(app: Pick<AppCredentials, "clientId" | "clientSecret">, code: string, redirectUri: string, fetchImpl: typeof fetch = fetch) {
  return tokenRequest({ client_id: app.clientId, client_secret: app.clientSecret, code, redirect_uri: redirectUri }, fetchImpl);
}

export function refreshUserToken(app: Pick<AppCredentials, "clientId" | "clientSecret">, refreshToken: string, fetchImpl: typeof fetch = fetch) {
  return tokenRequest({ client_id: app.clientId, client_secret: app.clientSecret, grant_type: "refresh_token", refresh_token: refreshToken }, fetchImpl);
}

/** True when the token expires within `marginMs`. */
export function tokenNeedsRefresh(tokens: UserTokens, marginMs = 5 * 60_000): boolean {
  return Boolean(tokens.expiresAt && tokens.expiresAt - Date.now() < marginMs);
}

/** Octokit authenticated as the app installation for `owner` (org or user), or null if not installed there. */
export async function installationOctokit(app: Pick<AppCredentials, "id" | "privateKey">, owner: string): Promise<Octokit | null> {
  const ghApp = new App({ appId: app.id, privateKey: app.privateKey });
  for (const route of ["GET /orgs/{owner}/installation", "GET /users/{owner}/installation"] as const) {
    try {
      const { data } = await ghApp.octokit.request(route as "GET /orgs/{owner}/installation", { owner } as never);
      return (await ghApp.getInstallationOctokit((data as { id: number }).id)) as unknown as Octokit;
    } catch (err) {
      if ((err as { status?: number }).status !== 404) throw err;
    }
  }
  return null;
}
