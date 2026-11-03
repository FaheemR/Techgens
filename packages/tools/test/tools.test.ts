import { describe, expect, it, vi } from "vitest";
import { AGENT_TOOL_NAMES } from "@techgens/core";
import { TOOL_FACTORIES, buildAgentTools, type ToolCaller, type ToolServices } from "../src/index";

const caller: ToolCaller = {
  jobId: "j1",
  agentId: "a1",
  agentName: "Priya",
  roleId: "cpo",
  initiativeId: "i1",
  workItemId: "w1",
  depth: 0,
};

function fakeServices(): ToolServices {
  const cache = new Map<string, ReturnType<typeof vi.fn>>();
  const handler = {
    get: (_: unknown, prop: string) => {
      if (!cache.has(prop)) cache.set(prop, vi.fn(async () => (prop.startsWith("get") ? `${prop} ok` : {})));
      return cache.get(prop);
    },
  };
  return new Proxy({}, handler) as unknown as ToolServices;
}

describe("agent tools", () => {
  it("implements every declared tool name", () => {
    expect(Object.keys(TOOL_FACTORIES).sort()).toEqual([...AGENT_TOOL_NAMES].sort());
  });

  it("builds only allowlisted tools with valid JSON schemas", () => {
    const tools = buildAgentTools(["write_document", "complete_task", "write_document"], caller, fakeServices());
    expect(tools.map((t) => t.name)).toEqual(["write_document", "complete_task"]);
    for (const t of tools) expect(t.parameters).toMatchObject({ type: "object" });
    expect(tools.find((t) => t.name === "complete_task")?.isTerminal).toBe(true);
  });

  it("passes validated arguments and the caller to services", async () => {
    const services = fakeServices();
    const [tool] = buildAgentTools(["request_approval"], caller, services);
    const ok = await tool!.handler({ kind: "spec", title: "PRD", summary: "Please approve the PRD" }, { sessionId: "s", toolCallId: "t" });
    expect(String(typeof ok === "string" ? ok : ok.text)).toMatch(/requested/);
    expect(services.requestApproval).toHaveBeenCalledWith(caller, expect.objectContaining({ kind: "spec", documentIds: [] }));
    const bad = await tool!.handler({ kind: "nope", title: "x", summary: "y" }, { sessionId: "s", toolCallId: "t" });
    expect(bad).toMatchObject({ failed: true });
  });

  it("surfaces service errors as failed tool results", async () => {
    const services = { writeDocument: async () => { throw new Error("db down"); } } as unknown as ToolServices;
    const [tool] = buildAgentTools(["write_document"], caller, services);
    const res = await tool!.handler({ title: "PRD", kind: "prd", content: "x".repeat(30) }, { sessionId: "s", toolCallId: "t" });
    expect(res).toEqual({ text: "write_document failed: db down", failed: true });
  });
});
