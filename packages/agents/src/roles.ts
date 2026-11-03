import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { roleFrontmatterSchema, type RoleDefinition } from "@techgens/core";

export const BUILTIN_ROLES_DIR = fileURLToPath(new URL("../roles", import.meta.url));

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseRoleMarkdown(markdown: string, origin = "role"): RoleDefinition {
  const match = FRONTMATTER.exec(markdown);
  if (!match) throw new Error(`${origin}: missing YAML frontmatter`);
  const raw = parseYaml(match[1]!) as unknown;
  const parsed = roleFrontmatterSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`${origin}: invalid frontmatter — ${issues}`);
  }
  const prompt = match[2]!.trim();
  if (!prompt) throw new Error(`${origin}: empty persona prompt`);
  return { ...parsed.data, prompt };
}

export function loadRolesFromDir(dir: string = BUILTIN_ROLES_DIR): RoleDefinition[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => parseRoleMarkdown(readFileSync(join(dir, f), "utf8"), f));
}

/** Validates the reporting tree: unique ids, known managers, a single root, no cycles. */
export function validateOrgChart(roles: readonly RoleDefinition[]): string[] {
  const errors: string[] = [];
  const byId = new Map<string, RoleDefinition>();
  for (const r of roles) {
    if (byId.has(r.id)) errors.push(`duplicate role id ${r.id}`);
    byId.set(r.id, r);
  }
  const roots = roles.filter((r) => !r.reportsTo);
  if (roots.length !== 1) errors.push(`expected exactly one root role, found ${roots.map((r) => r.id).join(", ") || "none"}`);
  for (const r of roles) {
    if (r.reportsTo && !byId.has(r.reportsTo)) errors.push(`${r.id} reports to unknown role ${r.reportsTo}`);
    const seen = new Set<string>([r.id]);
    let cur = r.reportsTo ? byId.get(r.reportsTo) : undefined;
    while (cur) {
      if (seen.has(cur.id)) {
        errors.push(`reporting cycle involving ${r.id}`);
        break;
      }
      seen.add(cur.id);
      cur = cur.reportsTo ? byId.get(cur.reportsTo) : undefined;
    }
  }
  return errors;
}

/** Role ids in the management chain above `roleId` (nearest first). */
export function managementChain(roles: readonly RoleDefinition[], roleId: string): string[] {
  const byId = new Map(roles.map((r) => [r.id, r]));
  const chain: string[] = [];
  let cur = byId.get(roleId)?.reportsTo;
  while (cur && !chain.includes(cur)) {
    chain.push(cur);
    cur = byId.get(cur)?.reportsTo ?? null;
  }
  return chain;
}
