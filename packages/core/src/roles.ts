import { z } from "zod";
import { AGENT_TOOL_NAMES, DEPARTMENTS, EXECUTORS, type ApprovalKind } from "./domain";

export const REASONING_EFFORTS = ["low", "medium", "high", "xhigh"] as const;

/** Frontmatter of a role definition file (packages/agents/roles/*.md). The Markdown body is the persona prompt. */
export const roleFrontmatterSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, "role id must be kebab-case"),
  title: z.string().min(1),
  department: z.enum(DEPARTMENTS),
  reportsTo: z.string().nullable().default(null),
  /** Short description used for routing (delegation targets) and the org chart. */
  description: z.string().min(1),
  responsibilities: z.array(z.string()).default([]),
  /** Copilot model id; omitted = runtime default (auto). The CEO can override per role in Settings. */
  model: z.string().optional(),
  reasoningEffort: z.enum(REASONING_EFFORTS).optional(),
  tools: z.array(z.enum(AGENT_TOOL_NAMES)).default([]),
  /** Read-only MCP servers the role may use (keys from the MCP catalog, e.g. "github", "azure", "playwright"). */
  mcp: z.array(z.string()).default([]),
  executor: z.enum(EXECUTORS).default("local-session"),
  /** Default number of instances to staff when seeding the company. */
  headcount: z.number().int().min(0).max(10).default(1),
  budget: z
    .object({
      dailyCredits: z.number().nonnegative().default(50),
      perJobCredits: z.number().nonnegative().default(10),
    })
    .default({ dailyCredits: 50, perJobCredits: 10 }),
  /** Persona names used when staffing instances. */
  names: z.array(z.string()).default([]),
  /** Attribution for adapted prompts (licence compliance). */
  source: z.string().optional(),
});
export type RoleFrontmatter = z.infer<typeof roleFrontmatterSchema>;

export interface RoleDefinition extends RoleFrontmatter {
  prompt: string;
}

export const GATE_KINDS_FOR_TOOL: readonly ApprovalKind[] = [
  "vision_roadmap",
  "spec",
  "architecture",
  "merge_to_main",
  "prod_deploy",
  "decision",
  "hire",
];
