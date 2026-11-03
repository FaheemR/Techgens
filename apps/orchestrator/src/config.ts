import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";

export interface Config {
  port: number;
  host: string;
  databaseUrl: string;
  dataDir: string;
  /** 32-byte key (hex/base64) for encrypting secrets at rest. Generated into dataDir if absent. */
  secretKey: string;
  /** "copilot" (default) or "fake" (demo mode: scripted agents + in-memory GitHub). */
  agentRuntime: "copilot" | "fake";
  /** Optional external headless Copilot runtime (`copilot --headless --port N`). */
  copilotRuntimeUrl?: string;
  copilotConnectionToken?: string;
  /** Optional bootstrap token (fine-grained PAT) used when none is stored in Settings. */
  githubToken?: string;
  /** Public URL of the orchestrator (OAuth callbacks) and of the web app (redirects, CORS). */
  publicUrl: string;
  webUrl: string;
  logLevel: string;
  turnTimeoutMs: number;
  /** Seconds between delivery monitor ticks (PR status, deployments). */
  monitorIntervalSeconds: number;
}

function loadOrCreateSecretKey(dataDir: string): string {
  const file = join(dataDir, "secret.key");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const key = randomBytes(32).toString("hex");
  writeFileSync(file, `${key}\n`, { mode: 0o600 });
  return key;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = resolve(env.TECHGENS_DATA_DIR ?? join(process.cwd(), ".data"));
  mkdirSync(dataDir, { recursive: true });
  const port = Number(env.PORT ?? 4000);
  return {
    port,
    host: env.HOST ?? "0.0.0.0",
    databaseUrl: env.DATABASE_URL ?? "postgres://techgens:techgens@localhost:5432/techgens",
    dataDir,
    secretKey: env.TECHGENS_SECRET_KEY ?? loadOrCreateSecretKey(dataDir),
    agentRuntime: env.AGENT_RUNTIME === "fake" ? "fake" : "copilot",
    copilotRuntimeUrl: env.COPILOT_RUNTIME_URL || undefined,
    copilotConnectionToken: env.COPILOT_CONNECTION_TOKEN || undefined,
    githubToken: env.GITHUB_TOKEN_BOOTSTRAP || env.COPILOT_GITHUB_TOKEN || undefined,
    publicUrl: (env.TECHGENS_PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, ""),
    webUrl: (env.TECHGENS_WEB_URL ?? "http://localhost:3000").replace(/\/$/, ""),
    logLevel: env.LOG_LEVEL ?? "info",
    turnTimeoutMs: Number(env.AGENT_TURN_TIMEOUT_MS ?? 20 * 60_000),
    monitorIntervalSeconds: Number(env.MONITOR_INTERVAL_SECONDS ?? 60),
  };
}
