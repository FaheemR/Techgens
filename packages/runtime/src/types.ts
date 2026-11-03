/** Provider-neutral agent runtime contract. Techgens owns orchestration; a runtime only runs agent turns. */

export interface ToolCallContext {
  sessionId: string;
  toolCallId: string;
  signal?: AbortSignal;
}

export type ToolResult = string | { text: string; failed?: boolean };

export interface AgentToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the arguments object. */
  parameters: Record<string, unknown>;
  /** A successful call ends the agent's turn (e.g. complete_task, request_approval). */
  isTerminal?: boolean;
  handler: (args: unknown, ctx: ToolCallContext) => Promise<ToolResult>;
}

export interface McpServerSpec {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  /** Explicit allowlist of tool names exposed to the agent. */
  tools: string[];
}

export interface AgentSessionConfig {
  /** Provide to create a session with a known id (used for later resume). */
  sessionId?: string;
  systemPrompt: string;
  model?: string;
  reasoningEffort?: "low" | "medium" | "high" | "xhigh";
  tools: AgentToolSpec[];
  /** Built-in runtime tools to allow (e.g. "web_fetch"). Shell and filesystem tools are never enabled. */
  builtinTools?: string[];
  mcpServers?: Record<string, McpServerSpec>;
  /** Soft cap for this session's AI credits. */
  maxAiCredits?: number;
  /** Opaque labels for logging/testing (agentId, roleId, jobId…). */
  labels?: Record<string, string>;
}

export type AgentRuntimeEvent =
  | { type: "message_delta"; content: string }
  | { type: "message"; content: string }
  | { type: "tool_start"; toolName: string; toolCallId: string; args: unknown }
  | { type: "tool_complete"; toolName: string; toolCallId: string; success: boolean }
  | {
      type: "usage";
      model: string;
      nanoAiu: number;
      premiumRequests: number;
      inputTokens: number;
      outputTokens: number;
    }
  | { type: "error"; message: string }
  | { type: "budget_exhausted"; usedAiCredits: number; maxAiCredits: number };

export type AgentEventHandler = (event: AgentRuntimeEvent) => void;

export interface AgentTurnResult {
  /** Final assistant message of the turn ("" if the turn ended through a terminal tool without text). */
  finalMessage: string;
}

export interface AgentSession {
  readonly sessionId: string;
  /** Sends a prompt and resolves when the agent's turn ends. */
  run(prompt: string, options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<AgentTurnResult>;
  abort(): Promise<void>;
  close(): Promise<void>;
}

export interface ModelSummary {
  id: string;
  name: string;
  multiplier?: number;
  enabled: boolean;
}

export interface RuntimeStatus {
  ready: boolean;
  kind: "copilot" | "fake";
  authenticated: boolean;
  login?: string;
  message?: string;
}

export interface AgentRuntime {
  readonly kind: "copilot" | "fake";
  createSession(config: AgentSessionConfig, onEvent: AgentEventHandler): Promise<AgentSession>;
  /** Resumes a persisted session; throws SessionNotFoundError if it no longer exists. */
  resumeSession(sessionId: string, config: AgentSessionConfig, onEvent: AgentEventHandler): Promise<AgentSession>;
  listModels(): Promise<ModelSummary[]>;
  status(): Promise<RuntimeStatus>;
  stop(): Promise<void>;
}

export class RuntimeUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeUnavailableError";
  }
}

export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Agent session ${sessionId} not found`);
    this.name = "SessionNotFoundError";
  }
}

export class TurnTimeoutError extends Error {
  constructor(ms: number) {
    super(`Agent turn exceeded ${Math.round(ms / 1000)}s`);
    this.name = "TurnTimeoutError";
  }
}
