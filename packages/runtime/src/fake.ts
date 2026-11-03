import { randomUUID } from "node:crypto";
import {
  SessionNotFoundError,
  type AgentEventHandler,
  type AgentRuntime,
  type AgentSession,
  type AgentSessionConfig,
  type AgentTurnResult,
  type ModelSummary,
  type RuntimeStatus,
} from "./types";

export interface FakeTurnContext {
  sessionId: string;
  prompt: string;
  systemPrompt: string;
  labels: Record<string, string>;
  /** 0-based index of this turn within the session (resumes continue counting). */
  turn: number;
  /** Prompts of all turns so far, including this one. */
  history: string[];
  toolNames: string[];
  /** Invokes a Techgens tool exactly as the real runtime would. Returns the tool's text result. */
  callTool(name: string, args?: Record<string, unknown>): Promise<string>;
  say(text: string): void;
  usage(nanoAiu: number, model?: string): void;
}

export type FakeScript = (ctx: FakeTurnContext) => Promise<void> | void;

interface StoredSession {
  config: AgentSessionConfig;
  history: string[];
}

/**
 * Deterministic, zero-credit runtime for tests and demo mode. Scripts are registered per role id (labels.roleId);
 * unscripted agents acknowledge and call complete_task.
 */
export class FakeAgentRuntime implements AgentRuntime {
  readonly kind = "fake" as const;
  readonly sessions = new Map<string, StoredSession>();
  readonly turns: Array<{ sessionId: string; labels: Record<string, string>; prompt: string }> = [];
  private scripts = new Map<string, FakeScript>();
  /** Usage emitted automatically for each turn (nano-AIU). */
  defaultTurnUsageNano = 2_000_000;

  on(roleId: string, script: FakeScript): this {
    this.scripts.set(roleId, script);
    return this;
  }

  scriptFor(labels: Record<string, string>): FakeScript {
    return this.scripts.get(labels.roleId ?? "") ?? this.scripts.get("*") ?? defaultScript;
  }

  async createSession(config: AgentSessionConfig, onEvent: AgentEventHandler): Promise<AgentSession> {
    const sessionId = config.sessionId ?? `fake-${randomUUID()}`;
    this.sessions.set(sessionId, { config, history: [] });
    return new FakeSession(this, sessionId, onEvent);
  }

  async resumeSession(sessionId: string, config: AgentSessionConfig, onEvent: AgentEventHandler): Promise<AgentSession> {
    const stored = this.sessions.get(sessionId);
    if (!stored) throw new SessionNotFoundError(sessionId);
    stored.config = config;
    return new FakeSession(this, sessionId, onEvent);
  }

  async listModels(): Promise<ModelSummary[]> {
    return [
      { id: "fake-standard", name: "Fake Standard", multiplier: 1, enabled: true },
      { id: "fake-mini", name: "Fake Mini", multiplier: 0, enabled: true },
    ];
  }

  async status(): Promise<RuntimeStatus> {
    return { ready: true, kind: "fake", authenticated: true, login: "demo", message: "Demo mode (scripted agents)" };
  }

  async stop(): Promise<void> {}
}

const defaultScript: FakeScript = async (ctx) => {
  ctx.say(`Acknowledged: ${ctx.prompt.slice(0, 80)}`);
  if (ctx.toolNames.includes("complete_task")) {
    await ctx.callTool("complete_task", { summary: `Completed: ${ctx.prompt.slice(0, 120)}` });
  }
};

class FakeSession implements AgentSession {
  constructor(
    private readonly runtime: FakeAgentRuntime,
    readonly sessionId: string,
    private readonly onEvent: AgentEventHandler,
  ) {}

  async run(prompt: string, options: { signal?: AbortSignal } = {}): Promise<AgentTurnResult> {
    const stored = this.runtime.sessions.get(this.sessionId);
    if (!stored) throw new SessionNotFoundError(this.sessionId);
    stored.history.push(prompt);
    const labels = stored.config.labels ?? {};
    this.runtime.turns.push({ sessionId: this.sessionId, labels, prompt });
    let finalMessage = "";
    let ended = false;
    let toolSeq = 0;
    const ctx: FakeTurnContext = {
      sessionId: this.sessionId,
      prompt,
      systemPrompt: stored.config.systemPrompt,
      labels,
      turn: stored.history.length - 1,
      history: [...stored.history],
      toolNames: stored.config.tools.map((t) => t.name),
      callTool: async (name, args = {}) => {
        if (options.signal?.aborted) throw new Error("aborted");
        if (ended) throw new Error(`turn already ended; cannot call ${name}`);
        const tool = stored.config.tools.find((t) => t.name === name);
        if (!tool) throw new Error(`tool ${name} is not available to this agent`);
        const toolCallId = `call-${++toolSeq}`;
        this.onEvent({ type: "tool_start", toolName: name, toolCallId, args });
        const result = await tool.handler(args, { sessionId: this.sessionId, toolCallId, signal: options.signal });
        const text = typeof result === "string" ? result : result.text;
        const failed = typeof result !== "string" && Boolean(result.failed);
        this.onEvent({ type: "tool_complete", toolName: name, toolCallId, success: !failed });
        if (tool.isTerminal && !failed) ended = true;
        return text;
      },
      say: (text) => {
        if (ended) return;
        finalMessage = text;
        for (const chunk of text.match(/.{1,40}/gs) ?? []) this.onEvent({ type: "message_delta", content: chunk });
        this.onEvent({ type: "message", content: text });
      },
      usage: (nanoAiu, model = "fake-standard") =>
        this.onEvent({ type: "usage", model, nanoAiu, premiumRequests: 1, inputTokens: 100, outputTokens: 50 }),
    };
    await this.runtime.scriptFor(labels)(ctx);
    if (this.runtime.defaultTurnUsageNano > 0) ctx.usage(this.runtime.defaultTurnUsageNano);
    return { finalMessage };
  }

  async abort(): Promise<void> {}
  async close(): Promise<void> {}
}
