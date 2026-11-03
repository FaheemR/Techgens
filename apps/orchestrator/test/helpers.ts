import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pino from "pino";
import type { DbHandle } from "@techgens/db";
import { TEST_DATABASE_URL } from "@techgens/db/testing";
import { FakeAgentRuntime } from "@techgens/runtime";
import { Techgens } from "../src/app";
import { loadConfig } from "../src/config";
import { installDemoScripts } from "../src/demo/scripts";
import { ManualDispatcher } from "../src/engine/jobs";

export async function createTestApp(h: DbHandle, runtime = installDemoScripts(new FakeAgentRuntime())): Promise<{ app: Techgens; runtime: FakeAgentRuntime }> {
  const config = loadConfig({
    AGENT_RUNTIME: "fake",
    DATABASE_URL: TEST_DATABASE_URL,
    TECHGENS_DATA_DIR: mkdtempSync(join(tmpdir(), "techgens-test-")),
    TECHGENS_SECRET_KEY: "a".repeat(64),
    LOG_LEVEL: "silent",
  });
  const app = new Techgens({ config, db: h.db, runtime, dispatcher: new ManualDispatcher(), logger: pino({ level: "silent" }) });
  await app.init();
  return { app, runtime };
}
