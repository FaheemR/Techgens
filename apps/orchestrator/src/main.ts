import { join } from "node:path";
import { PgBoss } from "pg-boss";
import { createDb, runMigrations } from "@techgens/db";
import { CopilotAgentRuntime, FakeAgentRuntime, type AgentRuntime } from "@techgens/runtime";
import { loadConfig } from "./config";
import { Techgens } from "./app";
import { buildServer } from "./api/server";
import { installDemoScripts } from "./demo/scripts";
import type { JobDispatcher } from "./engine/jobs";

const AGENT_QUEUE = "agent-turn";
const ROUTINE_QUEUE = "routine";

async function main() {
  const config = loadConfig();
  const { db, pool, close } = createDb(config.databaseUrl);
  await runMigrations(db);

  let runtime: AgentRuntime;
  if (config.agentRuntime === "fake") {
    const fake = new FakeAgentRuntime();
    runtime = fake;
    installDemoScripts(fake, { paceMs: 700 });
  } else {
    runtime = new CopilotAgentRuntime({
      runtimeUrl: config.copilotRuntimeUrl,
      connectionToken: config.copilotConnectionToken,
      baseDirectory: join(config.dataDir, "copilot"),
      workingDirectory: join(config.dataDir, "agent-workspace"),
    });
  }

  const boss = new PgBoss({ connectionString: config.databaseUrl, schema: "pgboss" });
  boss.on("error", (err) => console.error("[pg-boss]", err));
  await boss.start();
  await boss.createQueue(AGENT_QUEUE, { retryLimit: 0, expireInSeconds: 4 * 3600 });
  await boss.createQueue(ROUTINE_QUEUE, { retryLimit: 1 });

  const dispatcher: JobDispatcher = {
    async enqueue(jobId, delaySeconds) {
      await boss.send(AGENT_QUEUE, { jobId }, delaySeconds ? { startAfter: delaySeconds } : {});
    },
  };
  const app = new Techgens({ config, db, runtime, dispatcher });
  await app.init();

  const recovered = await app.engine.recoverInterrupted();
  if (recovered) app.log.info({ recovered }, "re-queued interrupted agent jobs");

  const concurrency = await app.settings.get("maxConcurrentJobs");
  await boss.work<{ jobId: string }>(AGENT_QUEUE, { localConcurrency: concurrency, pollingIntervalSeconds: 2 }, async ([job]) => {
    if (job) await app.engine.processJob(job.data.jobId);
  });
  await boss.work<{ routineId: string }>(ROUTINE_QUEUE, async ([job]) => {
    if (job) await app.routines.run(job.data.routineId);
  });
  app.routines.scheduler = {
    schedule: (key, cron, routineId) => boss.schedule(ROUTINE_QUEUE, cron, { routineId }, { key, tz: "UTC" }),
    unschedule: (key) => boss.unschedule(ROUTINE_QUEUE, key),
  };
  await app.routines.applyAll();
  await app.engine.requeueAll();

  let ticking = false;
  const monitor = setInterval(async () => {
    if (ticking) return;
    ticking = true;
    try {
      await app.delivery.tick();
      await app.github.maintain();
    } catch (err) {
      app.log.warn({ err: (err as Error).message }, "delivery monitor tick failed");
    } finally {
      ticking = false;
    }
  }, (config.agentRuntime === "fake" ? Math.min(config.monitorIntervalSeconds, 10) : config.monitorIntervalSeconds) * 1000);

  const server = await buildServer(app);
  await server.listen({ port: config.port, host: config.host });
  app.log.info({ port: config.port, runtime: runtime.kind, demo: config.agentRuntime === "fake" }, "Techgens orchestrator listening");

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    clearInterval(monitor);
    await server.close().catch(() => undefined);
    await boss.stop({ graceful: true, timeout: 10_000 }).catch(() => undefined);
    await runtime.stop().catch(() => undefined);
    await close().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  void pool;
}

main().catch((err) => {
  console.error("Techgens failed to start:", err);
  process.exit(1);
});
