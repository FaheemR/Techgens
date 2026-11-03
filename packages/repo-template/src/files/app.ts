import { NODE_ENGINE, PACKAGE_VERSIONS, WEB_PORT } from "../constants";
import type { RenderContext } from "../context";
import type { RepoFile } from "../types";

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

function packageJson(ctx: RenderContext): string {
  return json({
    name: ctx.slug,
    version: "0.1.0",
    private: true,
    description: ctx.description || ctx.name,
    type: "module",
    engines: { node: NODE_ENGINE },
    scripts: {
      build: "tsc -p tsconfig.build.json",
      start: "node dist/server.js",
      dev: "node --watch src/server.ts",
      lint: "tsc -p tsconfig.json --noEmit --noUnusedLocals --noUnusedParameters",
      typecheck: "tsc -p tsconfig.json --noEmit",
      test: "vitest run",
      "test:watch": "vitest",
      "test:e2e": 'echo "No end-to-end tests yet: add Playwright tests under e2e/ (see docs/qa/README.md)"',
    },
    devDependencies: { ...PACKAGE_VERSIONS },
  });
}

const TSCONFIG = json({
  compilerOptions: {
    target: "ES2023",
    lib: ["ES2023"],
    module: "NodeNext",
    moduleResolution: "NodeNext",
    types: ["node"],
    strict: true,
    noUncheckedIndexedAccess: true,
    noImplicitOverride: true,
    noImplicitReturns: true,
    noFallthroughCasesInSwitch: true,
    verbatimModuleSyntax: true,
    erasableSyntaxOnly: true,
    rewriteRelativeImportExtensions: true,
    isolatedModules: true,
    skipLibCheck: true,
    noEmit: true,
  },
  include: ["src", "test", "vitest.config.ts"],
});

const TSCONFIG_BUILD = json({
  extends: "./tsconfig.json",
  compilerOptions: { noEmit: false, rootDir: "src", outDir: "dist", sourceMap: true },
  include: ["src"],
  exclude: ["src/**/*.test.ts"],
});

const VITEST_CONFIG = `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit and integration tests only; Playwright end-to-end tests live in e2e/ (npm run test:e2e).
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
  },
});
`;

function serverTs(ctx: RenderContext): string {
  return `import { realpathSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

/** Product metadata shown on the home page. */
export const PRODUCT = {
  name: ${JSON.stringify(ctx.name)},
  description: ${JSON.stringify(ctx.description)},
} as const;

export type LogLevel = "debug" | "info" | "warn" | "error";
export type Logger = (level: LogLevel, message: string, fields?: Record<string, unknown>) => void;

/** Structured JSON logs, one line per event. Never log secrets or personal data. */
export const log: Logger = (level, message, fields = {}) => {
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg: message, ...fields });
  if (level === "warn" || level === "error") console.error(line);
  else console.log(line);
};

export interface AppOptions {
  /** Reported by GET /health; defaults to APP_VERSION (baked into the container image at build time). */
  version?: string;
  logger?: Logger;
}

const JSON_TYPE = "application/json; charset=utf-8";
const HTML_SECURITY_HEADERS = {
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => \`&#\${ch.charCodeAt(0)};\`);
}

export function parsePort(value: string | undefined, fallback = ${WEB_PORT}): number {
  if (value === undefined || value.trim() === "") return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(\`Invalid PORT "\${value}"\`);
  return port;
}

function send(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  contentType: string,
  body: string,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    ...headers,
  });
  res.end(req.method === "HEAD" ? undefined : body);
}

function homePage(): string {
  const name = escapeHtml(PRODUCT.name);
  const description = escapeHtml(PRODUCT.description);
  return \`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>\${name}</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; }
  main { max-width: 40rem; padding: 2rem; text-align: center; }
</style>
</head>
<body>
<main>
  <h1>\${name}</h1>
  <p>\${description}</p>
</main>
</body>
</html>
\`;
}

function route(req: IncomingMessage, res: ServerResponse, version: string): void {
  const path = (req.url ?? "/").split("?")[0];
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(req, res, 405, JSON_TYPE, JSON.stringify({ error: "method_not_allowed" }), { allow: "GET, HEAD" });
    return;
  }
  if (path === "/health") {
    send(req, res, 200, JSON_TYPE, JSON.stringify({ status: "ok", version }));
    return;
  }
  if (path === "/") {
    send(req, res, 200, "text/html; charset=utf-8", homePage(), HTML_SECURITY_HEADERS);
    return;
  }
  send(req, res, 404, JSON_TYPE, JSON.stringify({ error: "not_found" }));
}

/** Creates the HTTP server without listening, so tests can bind it to an ephemeral port. */
export function createAppServer(options: AppOptions = {}): Server {
  const version = options.version ?? (process.env.APP_VERSION || "dev");
  const logger = options.logger ?? log;
  return createServer((req, res) => {
    const started = performance.now();
    res.on("finish", () => {
      logger("info", "request", {
        method: req.method,
        path: (req.url ?? "/").split("?")[0],
        status: res.statusCode,
        durationMs: Math.round((performance.now() - started) * 10) / 10,
      });
    });
    try {
      route(req, res, version);
    } catch (error) {
      logger("error", "request failed", { error: error instanceof Error ? error.message : String(error) });
      if (res.headersSent) res.destroy();
      else send(req, res, 500, JSON_TYPE, JSON.stringify({ error: "internal_error" }));
    }
  });
}

export async function startServer(port = parsePort(process.env.PORT), options: AppOptions = {}): Promise<Server> {
  const server = createAppServer(options);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const server = await startServer().catch((error: unknown) => {
    log("error", "server failed to start", { error: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  });
  const address = server.address();
  log("info", "server started", {
    port: typeof address === "object" && address ? address.port : address,
    version: process.env.APP_VERSION || "dev",
  });
  const shutdown = (signal: NodeJS.Signals): void => {
    log("info", "shutting down", { signal });
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
`;
}

const HEALTH_TEST = `import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PRODUCT, createAppServer, escapeHtml } from "../src/server.ts";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  server = createAppServer({ version: "1.2.3-test", logger: () => {} });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = \`http://127.0.0.1:\${port}\`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

describe("GET /health", () => {
  it("reports status ok and the version", async () => {
    const response = await fetch(\`\${baseUrl}/health\`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ status: "ok", version: "1.2.3-test" });
  });
});

describe("GET /", () => {
  it("renders the product home page", async () => {
    const response = await fetch(\`\${baseUrl}/\`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain(\`<h1>\${escapeHtml(PRODUCT.name)}</h1>\`);
  });
});

describe("unknown routes and methods", () => {
  it("returns 404 JSON for unknown paths", async () => {
    const response = await fetch(\`\${baseUrl}/does-not-exist\`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });

  it("rejects unsupported methods", async () => {
    const response = await fetch(\`\${baseUrl}/health\`, { method: "POST" });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
  });
});
`;

/** package.json, TypeScript config, the HTTP server and its Vitest tests. */
export function appFiles(ctx: RenderContext): RepoFile[] {
  return [
    { path: "package.json", content: packageJson(ctx) },
    { path: "tsconfig.json", content: TSCONFIG },
    { path: "tsconfig.build.json", content: TSCONFIG_BUILD },
    { path: "vitest.config.ts", content: VITEST_CONFIG },
    { path: "src/server.ts", content: serverTs(ctx) },
    { path: "test/health.test.ts", content: HEALTH_TEST },
  ];
}
