import type { AgentDTO, OrgDTO } from "@techgens/core";

export const NODE_W = 236;
export const NODE_H = 108;
export const CEO_H = 64;
const H_GAP = 28;
const V_GAP = 56;
const STACK_GAP = 14;
/** Horizontal offset of a stacked column of reports from its trunk line. */
export const STACK_INDENT = 28;
/** Distance below a parent where its connector "bus" runs. */
export const BUS_OFFSET = V_GAP / 2;

export const CEO_ID = "__ceo__";

interface TreeNode {
  id: string;
  height: number;
  children: TreeNode[];
}

export interface Placement {
  id: string;
  x: number;
  y: number;
  parentId: string | null;
  /** Leaf reports stacked vertically under their manager (connected from the left). */
  stacked: boolean;
}

/**
 * Builds the reporting tree: managerAgentId first, falling back to the role's `reportsTo` (first active agent of
 * that role). Agents without a manager report to the CEO.
 */
export function buildTree(org: OrgDTO, agents: readonly AgentDTO[]): TreeNode {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const roles = new Map(org.roles.map((r) => [r.id, r]));
  const firstOfRole = new Map<string, AgentDTO>();
  for (const agent of agents) {
    const existing = firstOfRole.get(agent.roleId);
    if (!existing || (existing.status !== "active" && agent.status === "active"))
      firstOfRole.set(agent.roleId, agent);
  }

  const parentOf = (agent: AgentDTO): string => {
    if (agent.managerAgentId && byId.has(agent.managerAgentId) && agent.managerAgentId !== agent.id)
      return agent.managerAgentId;
    const reportsTo = roles.get(agent.roleId)?.reportsTo;
    const manager = reportsTo ? firstOfRole.get(reportsTo) : undefined;
    if (manager && manager.id !== agent.id) return manager.id;
    return CEO_ID;
  };

  const nodes = new Map<string, TreeNode>();
  nodes.set(CEO_ID, { id: CEO_ID, height: CEO_H, children: [] });
  for (const agent of agents) nodes.set(agent.id, { id: agent.id, height: NODE_H, children: [] });

  const sortKey = (a: AgentDTO) => `${a.department}|${a.roleTitle}|${a.name}`;
  const sorted = [...agents].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  for (const agent of sorted) {
    let parent = parentOf(agent);
    // Guard against cycles in bad data: walk up and re-root at the CEO if we meet ourselves.
    const seen = new Set<string>([agent.id]);
    let cursor = parent;
    while (cursor !== CEO_ID) {
      if (seen.has(cursor)) {
        parent = CEO_ID;
        break;
      }
      seen.add(cursor);
      const next = byId.get(cursor);
      cursor = next ? parentOf(next) : CEO_ID;
    }
    const child = nodes.get(agent.id);
    if (child) nodes.get(parent)?.children.push(child);
  }
  return nodes.get(CEO_ID) ?? { id: CEO_ID, height: CEO_H, children: [] };
}

interface Measure {
  width: number;
  height: number;
  stack: TreeNode[];
  regular: TreeNode[];
  childrenWidth: number;
}

function split(node: TreeNode): { stack: TreeNode[]; regular: TreeNode[] } {
  const leaves = node.children.filter((c) => c.children.length === 0);
  if (leaves.length < 2) return { stack: [], regular: node.children };
  return { stack: leaves, regular: node.children.filter((c) => c.children.length > 0) };
}

/** Compact top-down tree layout: managers centred above their reports; leaf reports stack vertically. */
export function layoutTree(root: TreeNode): Placement[] {
  const cache = new Map<string, Measure>();

  const measure = (node: TreeNode): Measure => {
    const cached = cache.get(node.id);
    if (cached) return cached;
    const { stack, regular } = split(node);
    const columns: Array<{ width: number; height: number }> = [];
    if (stack.length > 0) {
      const height = stack.reduce((sum, n) => sum + n.height, 0) + STACK_GAP * (stack.length - 1);
      columns.push({ width: STACK_INDENT + NODE_W, height });
    }
    for (const child of regular) columns.push(measure(child));
    const childrenWidth =
      columns.reduce((sum, c) => sum + c.width, 0) + H_GAP * Math.max(0, columns.length - 1);
    const result: Measure = {
      width: Math.max(NODE_W, childrenWidth),
      height: node.height + (columns.length > 0 ? V_GAP + Math.max(...columns.map((c) => c.height)) : 0),
      stack,
      regular,
      childrenWidth,
    };
    cache.set(node.id, result);
    return result;
  };

  const out: Placement[] = [];
  const place = (node: TreeNode, left: number, top: number, parentId: string | null, stacked: boolean) => {
    const m = measure(node);
    out.push({ id: node.id, x: left + (m.width - NODE_W) / 2, y: top, parentId, stacked });
    let cursor = left + (m.width - m.childrenWidth) / 2;
    const childTop = top + node.height + V_GAP;
    if (m.stack.length > 0) {
      let y = childTop;
      for (const leaf of m.stack) {
        out.push({ id: leaf.id, x: cursor + STACK_INDENT, y, parentId: node.id, stacked: true });
        y += leaf.height + STACK_GAP;
      }
      cursor += STACK_INDENT + NODE_W + H_GAP;
    }
    for (const child of m.regular) {
      place(child, cursor, childTop, node.id, false);
      cursor += measure(child).width + H_GAP;
    }
  };
  place(root, 0, 0, null, false);
  return out;
}
