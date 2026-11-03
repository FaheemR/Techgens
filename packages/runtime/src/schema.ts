import { z } from "zod";
import type { AgentToolSpec, ToolCallContext, ToolResult } from "./types";

/**
 * Defines a tool from a zod schema: arguments are validated before the handler runs and validation errors are
 * returned to the model as a failed tool result (so it can correct itself).
 */
export function defineAgentTool<S extends z.ZodType>(spec: {
  name: string;
  description: string;
  schema: S;
  isTerminal?: boolean;
  handler: (args: z.output<S>, ctx: ToolCallContext) => Promise<ToolResult> | ToolResult;
}): AgentToolSpec {
  const parameters = z.toJSONSchema(spec.schema, { target: "draft-7", io: "input" }) as Record<string, unknown>;
  delete parameters.$schema;
  return {
    name: spec.name,
    description: spec.description,
    parameters,
    isTerminal: spec.isTerminal,
    handler: async (raw, ctx) => {
      const parsed = spec.schema.safeParse(raw ?? {});
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
        return { text: `Invalid arguments for ${spec.name}: ${issues}`, failed: true };
      }
      try {
        return await spec.handler(parsed.data, ctx);
      } catch (err) {
        return { text: `${spec.name} failed: ${(err as Error).message}`, failed: true };
      }
    },
  };
}
