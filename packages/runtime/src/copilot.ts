import { mkdirSync } from "node:fs";
import {
  CopilotClient,
  RuntimeConnection,
  ToolSet,
  type CopilotSession,
  type PermissionHandler,
  type SessionConfig,
  type SessionEvent,
  type Tool,
} from "@github/copilot-sdk";
import {
  RuntimeUnavailableError,
  SessionNotFoundError,
  TurnTimeoutError,
  type AgentEventHandler,
  type AgentRuntime,
  type AgentSession,
  type AgentSessionConfig,
  type AgentTurnResult,
  type ModelSummary,
  type RuntimeStatus,
} from "./types";

export interface CopilotRuntimeOptions {
  /** GitHub user token (fine-grained PAT with "Copilot Requests", or GitHub App user-to-server token). */
  token?: string;
  /** URL of an external headless runtime (`copilot --headless --port N`). Default: bundled runtime over stdio. */
  runtimeUrl?: string;
  connectionToken?: string;
  /** Runtime state directory (session persistence). */
  baseDirectory: string;
  /** Empty sandbox directory used as the sessions' working directory. */
  workingDirectory: string;
  logLevel?: "none" | "error" | "warning" | "info" | "debug" | "all";
}

/** Permission policy: only Techgens tools, allowlisted read-only MCP tools and web fetches are ever approved. */
const permissionHandler: PermissionHandler = (request) => {
  const kind = (request as { kind?: string }).kind;
  if (kind === "custom-tool" || kind === "url" || kind === "mcp") return { kind: "approve-once" };
  return { kind: "reject", feedback: "Not permitted in Techgens: agents may only use their assigned tools." };
};

export class CopilotAgentRuntime implements AgentRuntime {
  readonly kind = "copilot" as const;
  private client?: CopilotClient;
  private starting?: Promise<CopilotClient>;

  constructor(private options: CopilotRuntimeOptions) {}

  /** Applies new options (e.g. a new token). The next call starts a fresh client. */
  async reconfigure(options: Partial<CopilotRuntimeOptions>): Promise<void> {
    this.options = { ...this.options, ...options };
    await this.stop();
  }

  get configured(): boolean {
    return Boolean(this.options.token || this.options.runtimeUrl);
  }

  private async getClient(): Promise<CopilotClient> {
    if (this.client) return this.client;
    if (this.starting) return this.starting;
    if (!this.configured) {
      throw new RuntimeUnavailableError("GitHub is not connected: add a GitHub token in Settings to start the agents.");
    }
    const { runtimeUrl, connectionToken, token, baseDirectory, workingDirectory, logLevel } = this.options;
    mkdirSync(baseDirectory, { recursive: true });
    mkdirSync(workingDirectory, { recursive: true });
    const client = new CopilotClient({
      mode: "empty",
      baseDirectory,
      workingDirectory,
      logLevel: logLevel ?? "error",
      clientInfo: { applicationName: "techgens", applicationVersion: "0.1.0" },
      ...(runtimeUrl
        ? { connection: RuntimeConnection.forUri(runtimeUrl, connectionToken ? { connectionToken } : undefined) }
        : { gitHubToken: token, useLoggedInUser: false }),
    });
    this.starting = client
      .start()
      .then(() => {
        this.client = client;
        return client;
      })
      .finally(() => {
        this.starting = undefined;
      });
    return this.starting;
  }

  private sessionConfig(config: AgentSessionConfig): SessionConfig {
    const tools: Tool[] = config.tools.map((spec) => ({
      name: spec.name,
      description: spec.description,
      parameters: spec.parameters,
      skipPermission: true,
      isTerminal: spec.isTerminal,
      handler: async (args, invocation) => {
        const result = await spec.handler(args, {
          sessionId: invocation.sessionId,
          toolCallId: invocation.toolCallId,
          signal: invocation.signal,
        });
        return typeof result === "string"
          ? result
          : { textResultForLlm: result.text, resultType: result.failed ? "failure" : "success" };
      },
    }));
    const available = new ToolSet().addCustom("*");
    for (const name of config.builtinTools ?? []) available.addBuiltIn(name);
    const mcpServers: SessionConfig["mcpServers"] = {};
    for (const [key, server] of Object.entries(config.mcpServers ?? {})) {
      mcpServers[key] = { type: "local", command: server.command, args: server.args, env: server.env, tools: server.tools };
      for (const tool of server.tools) available.addMcp(`${key}-${tool}`);
    }
    return {
      model: config.model,
      reasoningEffort: config.reasoningEffort,
      systemMessage: { mode: "replace", content: config.systemPrompt },
      tools,
      availableTools: available,
      mcpServers,
      streaming: true,
      sessionLimits: config.maxAiCredits ? { maxAiCredits: config.maxAiCredits } : undefined,
      onPermissionRequest: permissionHandler,
      workingDirectory: this.options.workingDirectory,
      skipCustomInstructions: true,
      enableSkills: false,
      ...(this.options.runtimeUrl && this.options.token ? { gitHubToken: this.options.token } : {}),
    };
  }

  async createSession(config: AgentSessionConfig, onEvent: AgentEventHandler): Promise<AgentSession> {
    const client = await this.getClient();
    const session = await client.createSession({ ...this.sessionConfig(config), sessionId: config.sessionId });
    return new CopilotAgentSession(session, onEvent);
  }

  async resumeSession(sessionId: string, config: AgentSessionConfig, onEvent: AgentEventHandler): Promise<AgentSession> {
    const client = await this.getClient();
    try {
      const session = await client.resumeSession(sessionId, this.sessionConfig(config));
      return new CopilotAgentSession(session, onEvent);
    } catch (err) {
      if (/not found|does not exist|unknown session/i.test(String((err as Error)?.message))) {
        throw new SessionNotFoundError(sessionId);
      }
      throw err;
    }
  }

  async listModels(): Promise<ModelSummary[]> {
    const client = await this.getClient();
    const models = await client.listModels();
    return models.map((m) => ({
      id: m.id,
      name: m.name,
      multiplier: m.billing?.multiplier,
      enabled: m.policy ? m.policy.state !== "disabled" : true,
    }));
  }

  async status(): Promise<RuntimeStatus> {
    if (!this.configured) {
      return { ready: false, kind: "copilot", authenticated: false, message: "GitHub token not configured" };
    }
    try {
      const client = await this.getClient();
      const auth = await client.getAuthStatus();
      return {
        ready: auth.isAuthenticated,
        kind: "copilot",
        authenticated: auth.isAuthenticated,
        login: auth.login,
        message: auth.statusMessage,
      };
    } catch (err) {
      return { ready: false, kind: "copilot", authenticated: false, message: (err as Error).message };
    }
  }

  async stop(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    if (client) await client.stop().catch(() => undefined);
  }
}

class CopilotAgentSession implements AgentSession {
  private lastMessage = "";
  private unsubscribe: () => void;

  constructor(
    private readonly session: CopilotSession,
    private readonly onEvent: AgentEventHandler,
  ) {
    this.unsubscribe = session.on((event) => this.handle(event));
  }

  get sessionId(): string {
    return this.session.sessionId;
  }

  private handle(event: SessionEvent): void {
    const e = event as SessionEvent & { agentId?: string; data: Record<string, any> };
    const isRoot = !e.agentId;
    switch (e.type) {
      case "assistant.message_delta":
        if (isRoot && !e.data.parentToolCallId) this.onEvent({ type: "message_delta", content: e.data.deltaContent ?? "" });
        break;
      case "assistant.message":
        if (isRoot && e.data.content) {
          this.lastMessage = e.data.content;
          this.onEvent({ type: "message", content: e.data.content });
        }
        break;
      case "tool.execution_start":
        this.onEvent({ type: "tool_start", toolName: e.data.toolName, toolCallId: e.data.toolCallId, args: e.data.arguments });
        break;
      case "tool.execution_complete":
        this.onEvent({
          type: "tool_complete",
          toolName: e.data.toolName ?? "",
          toolCallId: e.data.toolCallId,
          success: Boolean(e.data.success),
        });
        break;
      case "assistant.usage":
        this.onEvent({
          type: "usage",
          model: e.data.model,
          nanoAiu: Number(e.data.copilotUsage?.totalNanoAiu ?? 0),
          premiumRequests: Number(e.data.cost ?? 0),
          inputTokens: Number(e.data.inputTokens ?? 0),
          outputTokens: Number(e.data.outputTokens ?? 0),
        });
        break;
      case "session.error":
        this.onEvent({ type: "error", message: e.data.message ?? "Unknown session error" });
        break;
      case "session_limits_exhausted.requested":
        this.onEvent({ type: "budget_exhausted", usedAiCredits: e.data.usedAiCredits, maxAiCredits: e.data.maxAiCredits });
        void this.session.abort().catch(() => undefined);
        break;
    }
  }

  async run(prompt: string, options: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<AgentTurnResult> {
    const timeoutMs = options.timeoutMs ?? 20 * 60_000;
    this.lastMessage = "";
    const onAbort = () => void this.session.abort().catch(() => undefined);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const reply = await this.session.sendAndWait({ prompt }, timeoutMs);
      return { finalMessage: reply?.data.content ?? this.lastMessage };
    } catch (err) {
      if (/timeout/i.test(String((err as Error)?.message))) {
        await this.session.abort().catch(() => undefined);
        throw new TurnTimeoutError(timeoutMs);
      }
      throw err;
    } finally {
      options.signal?.removeEventListener("abort", onAbort);
    }
  }

  async abort(): Promise<void> {
    await this.session.abort();
  }

  async close(): Promise<void> {
    this.unsubscribe();
    await this.session.disconnect().catch(() => undefined);
  }
}
