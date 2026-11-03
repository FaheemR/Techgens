import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FakeAgentRuntime, SessionNotFoundError, defineAgentTool, type AgentRuntimeEvent } from "../src/index";

const echo = defineAgentTool({
  name: "echo",
  description: "Echo text",
  schema: z.object({ text: z.string().min(1) }),
  handler: ({ text }) => `echo:${text}`,
});
const finish = defineAgentTool({
  name: "complete_task",
  description: "Finish",
  schema: z.object({ summary: z.string() }),
  isTerminal: true,
  handler: ({ summary }) => `done:${summary}`,
});

describe("defineAgentTool", () => {
  it("emits JSON schema and validates arguments", async () => {
    expect(echo.parameters).toMatchObject({ type: "object", properties: { text: { type: "string" } } });
    expect(await echo.handler({ text: "hi" }, { sessionId: "s", toolCallId: "c" })).toBe("echo:hi");
    const bad = await echo.handler({ text: "" }, { sessionId: "s", toolCallId: "c" });
    expect(bad).toMatchObject({ failed: true });
  });
});

describe("FakeAgentRuntime", () => {
  it("runs role scripts, records usage and enforces terminal tools", async () => {
    const rt = new FakeAgentRuntime();
    rt.on("cpo", async (ctx) => {
      expect(await ctx.callTool("echo", { text: "a" })).toBe("echo:a");
      await ctx.callTool("complete_task", { summary: "ok" });
      await expect(ctx.callTool("echo", { text: "b" })).rejects.toThrow(/turn already ended/);
      ctx.say("should be ignored");
    });
    const events: AgentRuntimeEvent[] = [];
    const s = await rt.createSession(
      { systemPrompt: "sys", tools: [echo, finish], labels: { roleId: "cpo" } },
      (e) => events.push(e),
    );
    const res = await s.run("do it");
    expect(res.finalMessage).toBe("");
    expect(events.filter((e) => e.type === "tool_complete")).toHaveLength(2);
    expect(events.some((e) => e.type === "usage")).toBe(true);
  });

  it("resumes known sessions and rejects unknown ones", async () => {
    const rt = new FakeAgentRuntime();
    const s = await rt.createSession({ systemPrompt: "", tools: [finish], labels: { roleId: "x" } }, () => {});
    await s.run("first");
    const resumed = await rt.resumeSession(s.sessionId, { systemPrompt: "", tools: [finish], labels: { roleId: "x" } }, () => {});
    rt.on("x", (ctx) => {
      expect(ctx.turn).toBe(1);
      ctx.say("second turn");
    });
    expect((await resumed.run("second")).finalMessage).toBe("second turn");
    await expect(rt.resumeSession("nope", { systemPrompt: "", tools: [] }, () => {})).rejects.toBeInstanceOf(
      SessionNotFoundError,
    );
  });
});
