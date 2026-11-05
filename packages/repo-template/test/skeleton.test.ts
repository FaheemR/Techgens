import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_POLICIES, loadRolesFromDir } from "@techgens/agents";
import { renderProductRepo } from "../src/index";

/**
 * Renders a product into a git-ignored folder inside this package and runs the product's own toolchain against it
 * (lint, typecheck, Vitest suite, build, start). Dependencies resolve from the monorepo's node_modules, so no network
 * install is needed; the suite is skipped when TypeScript, Vitest or @types/node are not installed.
 */
const require = createRequire(import.meta.url);

function toolPath(pkg: string, relative: string): string | null {
  try {
    const path = join(dirname(require.resolve(`${pkg}/package.json`)), relative);
    return existsSync(path) ? path : null;
  } catch {
    return null;
  }
}

const tsc = toolPath("typescript", "bin/tsc");
const vitest = toolPath("vitest", "vitest.mjs");
const toolchain = Boolean(tsc && vitest && toolPath("@types/node", "index.d.ts"));
const PRODUCT_NAME = 'Acme "Notes" <Beta> & Friends — ünïcode';

/** Child processes must not inherit the parent Vitest worker's state, nor CI's forced colour output. */
const childEnv = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !/^(VITEST|TINYPOOL)|^NODE_OPTIONS$|^FORCE_COLOR$/.test(key),
    ),
  ),
  NO_COLOR: "1",
};
const stripAnsi = (text: string) => text.replace(/\u001b\[[0-9;]*m/g, "");

describe.skipIf(!toolchain)("generated product skeleton (built and tested with its own scripts)", () => {
  const dir = join(
    fileURLToPath(new URL("..", import.meta.url)),
    ".tmp",
    `skeleton-${process.pid}-${Date.now()}`,
  );

  function run(args: string[]): { status: number | null; output: string } {
    const result = spawnSync(process.execPath, args, {
      cwd: dir,
      env: childEnv,
      encoding: "utf8",
      timeout: 120_000,
    });
    return { status: result.status, output: stripAnsi(`${result.stdout}\n${result.stderr}`) };
  }

  beforeAll(() => {
    const files = renderProductRepo({
      productName: PRODUCT_NAME,
      productSlug: "acme-notes",
      description: "Shared notes for small teams.",
      owner: "acme-co",
      repo: "acme-notes",
      defaultBranch: "main",
      integrationBranch: "develop",
      companyName: "Acme Labs",
      policies: DEFAULT_POLICIES,
      roles: loadRolesFromDir(),
    });
    for (const file of files) {
      mkdirSync(dirname(join(dir, file.path)), { recursive: true });
      writeFileSync(join(dir, file.path), file.content);
    }
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    try {
      rmdirSync(dirname(dir));
    } catch {
      // .tmp is still used by a concurrent run (or already gone).
    }
  });

  it("passes `npm run lint` and `npm run typecheck`", { timeout: 120_000 }, () => {
    const lint = run([tsc!, "-p", "tsconfig.json", "--noEmit", "--noUnusedLocals", "--noUnusedParameters"]);
    expect(lint.status, lint.output).toBe(0);
  });

  it("passes its own Vitest suite (`npm test`)", { timeout: 120_000 }, () => {
    const test = run([vitest!, "run", "--root", dir]);
    expect(test.status, test.output).toBe(0);
    expect(test.output).toMatch(/Tests\s+4 passed/);
  });

  it(
    "builds (`npm run build`) and serves /health and / from dist (`npm start`)",
    { timeout: 120_000 },
    async () => {
      const build = run([tsc!, "-p", "tsconfig.build.json"]);
      expect(build.status, build.output).toBe(0);
      expect(existsSync(join(dir, "dist", "server.js"))).toBe(true);

      // Windows cannot deliver POSIX SIGTERM; IPC invokes the installed handler instead.
      const startArgs =
        process.platform === "win32"
          ? [
              "--import",
              `data:text/javascript,${encodeURIComponent('process.on("message", (signal) => { if (signal === "SIGTERM") process.emit("SIGTERM"); });')}`,
              "dist/server.js",
            ]
          : ["dist/server.js"];
      const server = spawn(process.execPath, startArgs, {
        cwd: dir,
        env: { ...childEnv, PORT: "0", APP_VERSION: "skeleton-sha" },
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      });
      let stdout = "";
      const exited = new Promise<number | null>((resolve) => server.once("exit", resolve));
      try {
        const output = server.stdout;
        if (!output) throw new Error("Expected the product server's piped stdout");
        const started = await new Promise<{ port: number; version: string }>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`server did not start: ${stdout}`)), 15_000);
          output.on("data", (chunk: Buffer) => {
            stdout += chunk.toString();
            const line = stdout.split("\n").find((l) => l.includes('"server started"'));
            if (line) {
              clearTimeout(timer);
              resolve(JSON.parse(line) as { port: number; version: string });
            }
          });
          server.once("exit", (code) => reject(new Error(`server exited with ${code}: ${stdout}`)));
        });
        expect(started.version).toBe("skeleton-sha");
        const base = `http://127.0.0.1:${started.port}`;
        const health = await fetch(`${base}/health`);
        expect(health.status).toBe(200);
        expect(await health.json()).toEqual({ status: "ok", version: "skeleton-sha" });
        const home = await fetch(`${base}/`);
        expect(home.headers.get("content-security-policy")).toContain("default-src 'none'");
        expect(await home.text()).toContain(
          "<h1>Acme &#34;Notes&#34; &#60;Beta&#62; &#38; Friends — ünïcode</h1>",
        );
      } finally {
        if (process.platform === "win32" && server.connected) server.send("SIGTERM");
        else server.kill("SIGTERM");
        await exited;
      }
      expect(server.exitCode).toBe(0);
      const logs = stdout
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { level: string; msg: string });
      expect(logs.map((l) => l.msg)).toEqual(
        expect.arrayContaining(["server started", "request", "shutting down"]),
      );
    },
  );
});
