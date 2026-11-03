import type { AgentToolName } from "@techgens/core";
import type { AgentToolSpec } from "@techgens/runtime";
import { collaborationTools } from "./collaboration";
import { deliveryTools } from "./delivery";
import type { ToolCaller, ToolServices } from "./types";

export * from "./types";

export const TOOL_FACTORIES = { ...collaborationTools, ...deliveryTools };

/** Builds the tool set for one agent run from the role's allowlist. Unknown names are ignored. */
export function buildAgentTools(names: readonly AgentToolName[], caller: ToolCaller, services: ToolServices): AgentToolSpec[] {
  const unique = [...new Set(names)];
  return unique.flatMap((name) => {
    const factory = TOOL_FACTORIES[name];
    return factory ? [factory(caller, services)] : [];
  });
}
