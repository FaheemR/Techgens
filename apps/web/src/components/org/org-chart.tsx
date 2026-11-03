"use client";

import "@xyflow/react/dist/style.css";
import { useMemo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import type { AgentDTO, OrgDTO } from "@techgens/core";
import { Cloud, Crown } from "lucide-react";
import { AgentAvatar } from "@/components/common/agent-avatar";
import { credits } from "@/lib/format";
import { departmentStyle } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { BUS_OFFSET, CEO_H, CEO_ID, NODE_H, NODE_W, STACK_INDENT, buildTree, layoutTree } from "./org-layout";

type AgentNodeData = { agent: AgentDTO; reports: number };
type CeoNodeData = { companyName: string; reports: number };
type AgentFlowNode = Node<AgentNodeData, "agent">;
type CeoFlowNode = Node<CeoNodeData, "ceo">;
type OrgNode = AgentFlowNode | CeoFlowNode;

const STATUS_DOT: Record<AgentDTO["status"], string> = {
  active: "bg-emerald-400",
  paused: "bg-amber-400",
  retired: "bg-slate-500",
};

const hiddenHandle = "!h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-transparent";

function AgentNodeView({ data }: NodeProps<AgentFlowNode>) {
  const { agent, reports } = data;
  const dept = departmentStyle(agent.department);
  const busy = agent.activeJobs > 0;
  return (
    <>
      <Handle type="target" id="top" position={Position.Top} isConnectable={false} className={hiddenHandle} />
      <Handle
        type="target"
        id="left"
        position={Position.Left}
        isConnectable={false}
        className={hiddenHandle}
      />
      {/* Activation (mouse or keyboard) bubbles to ReactFlow's onNodeClick, which also enables pointer events on nodes. */}
      <button
        type="button"
        aria-label={`${agent.name}, ${agent.roleTitle}. ${agent.status}. ${agent.currentActivity ?? "Idle"}. Open details`}
        className={cn(
          "nodrag nopan flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-xl border bg-[#0e1622] text-left shadow-lg shadow-black/30 transition-colors hover:bg-[#121c2b]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          busy ? "border-accent/40" : "border-border-strong",
          agent.status === "retired" && "opacity-55",
        )}
        style={{ boxShadow: busy ? "0 0 22px -8px rgba(34,211,238,0.55)" : undefined }}
      >
        <span aria-hidden className="h-[3px] w-full shrink-0" style={{ backgroundColor: dept.hex }} />
        <span className="flex min-h-0 flex-1 flex-col gap-1.5 px-3 py-2">
          <span className="flex items-center gap-2.5">
            <AgentAvatar
              name={agent.name}
              department={agent.department}
              size="sm"
              cloud={agent.executor === "cloud-agent"}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[13px] font-semibold text-fg">{agent.name}</span>
                <span
                  aria-hidden
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    STATUS_DOT[agent.status],
                    busy && "animate-pulse",
                  )}
                />
              </span>
              <span className={cn("block truncate text-[11px]", dept.text)}>{agent.roleTitle}</span>
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-[10px]">
            {agent.executor === "cloud-agent" ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-1.5 py-px font-medium text-cyan-200">
                <Cloud aria-hidden className="size-2.5" /> Copilot cloud agent
              </span>
            ) : (
              <span className="rounded-full border border-white/10 bg-white/5 px-1.5 py-px text-muted">
                Agent session
              </span>
            )}
            {busy ? (
              <span className="rounded-full bg-accent/15 px-1.5 py-px font-medium text-accent">
                {agent.activeJobs} job{agent.activeJobs === 1 ? "" : "s"}
              </span>
            ) : null}
            <span className="ml-auto tabular-nums text-subtle" title="Credits spent today / daily budget">
              {credits(agent.spentTodayCredits)}/{credits(agent.dailyBudgetCredits)}
            </span>
          </span>
          <span
            className={cn(
              "truncate text-[11px]",
              agent.currentActivity ? "text-muted" : "text-subtle italic",
            )}
          >
            {agent.status === "paused"
              ? "Paused"
              : agent.status === "retired"
                ? "Retired"
                : (agent.currentActivity ?? "Idle")}
          </span>
        </span>
      </button>
      {reports > 0 ? (
        <Handle
          type="source"
          id="bottom"
          position={Position.Bottom}
          isConnectable={false}
          className={hiddenHandle}
        />
      ) : null}
    </>
  );
}

function CeoNodeView({ data }: NodeProps<CeoFlowNode>) {
  return (
    <>
      <div className="flex h-full w-full items-center gap-3 rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-400/[0.12] to-[#0e1622] px-3.5 shadow-[0_0_28px_-10px_rgba(251,191,36,0.6)]">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-orange-500">
          <Crown aria-hidden className="size-4 text-[#1a0f02]" />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold text-fg">You · CEO</span>
          <span className="block truncate text-[11px] text-amber-200/80">{data.companyName}</span>
        </span>
      </div>
      {data.reports > 0 ? (
        <Handle
          type="source"
          id="bottom"
          position={Position.Bottom}
          isConnectable={false}
          className={hiddenHandle}
        />
      ) : null}
    </>
  );
}

/** Org-chart connector sharing a horizontal bus per manager; stacked reports hang off a trunk on their left. */
function OrgEdge({ sourceX, sourceY, targetX, targetY, targetPosition, style }: EdgeProps) {
  const busY = sourceY + BUS_OFFSET;
  let path: string;
  if (targetPosition === Position.Left) {
    const trunkX = targetX - STACK_INDENT / 2;
    path = `M ${sourceX} ${sourceY} V ${busY} H ${trunkX} V ${targetY} H ${targetX}`;
  } else {
    path = `M ${sourceX} ${sourceY} V ${busY} H ${targetX} V ${targetY}`;
  }
  return <BaseEdge path={path} style={style} />;
}

const nodeTypes = { agent: AgentNodeView, ceo: CeoNodeView };
const edgeTypes = { org: OrgEdge };

export default function OrgChart({
  org,
  agents,
  companyName,
  onOpenAgent,
}: {
  org: OrgDTO;
  agents: readonly AgentDTO[];
  companyName: string;
  onOpenAgent: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { nodes, edges, bounds } = useMemo(() => {
    const tree = buildTree(org, agents);
    const placements = layoutTree(tree);
    const xs = placements.map((p) => p.x);
    const layoutBounds = { minX: Math.min(0, ...xs), maxX: Math.max(NODE_W, ...xs.map((x) => x + NODE_W)) };
    const reportCount = new Map<string, number>();
    for (const p of placements)
      if (p.parentId) reportCount.set(p.parentId, (reportCount.get(p.parentId) ?? 0) + 1);
    const byId = new Map(agents.map((a) => [a.id, a]));

    const flowNodes: OrgNode[] = [];
    const flowEdges: Edge[] = [];
    for (const p of placements) {
      if (p.id === CEO_ID) {
        flowNodes.push({
          id: CEO_ID,
          type: "ceo",
          position: { x: p.x, y: p.y },
          width: NODE_W,
          height: CEO_H,
          data: { companyName, reports: reportCount.get(CEO_ID) ?? 0 },
          draggable: false,
          selectable: false,
        });
      } else {
        const agent = byId.get(p.id);
        if (!agent) continue;
        flowNodes.push({
          id: agent.id,
          type: "agent",
          position: { x: p.x, y: p.y },
          width: NODE_W,
          height: NODE_H,
          data: { agent, reports: reportCount.get(agent.id) ?? 0 },
          draggable: false,
          selectable: false,
        });
      }
      if (p.parentId) {
        const busy = (byId.get(p.id)?.activeJobs ?? 0) > 0;
        flowEdges.push({
          id: `${p.parentId}->${p.id}`,
          source: p.parentId,
          target: p.id,
          sourceHandle: "bottom",
          targetHandle: p.stacked ? "left" : "top",
          type: "org",
          style: { stroke: busy ? "rgba(34,211,238,0.55)" : "#2c3d55", strokeWidth: 1.5 },
        });
      }
    }
    return { nodes: flowNodes, edges: flowEdges, bounds: layoutBounds };
  }, [org, agents, companyName]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <ReactFlow
        key={nodes.length}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode="dark"
        onInit={(instance) => {
          // Fit the chart's width (top-aligned) so names stay readable; scrolling pans down the hierarchy.
          const width = containerRef.current?.clientWidth ?? 1024;
          const treeWidth = bounds.maxX - bounds.minX;
          const zoom = Math.max(0.4, Math.min(1, (width - 48) / treeWidth));
          void instance.setViewport({ x: (width - treeWidth * zoom) / 2 - bounds.minX * zoom, y: 24, zoom });
        }}
        minZoom={0.15}
        maxZoom={1.75}
        onNodeClick={(_event, node) => {
          if (node.type === "agent") onOpenAgent(node.id);
        }}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        elementsSelectable={false}
        edgesFocusable={false}
        panOnScroll
        zoomOnDoubleClick={false}
        aria-label="Organisation chart"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#1d2a3c" />
        <Controls
          showInteractive={false}
          position="bottom-left"
          fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
        />
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          nodeStrokeWidth={0}
          maskColor="rgba(3, 7, 12, 0.7)"
          nodeColor={(node) =>
            node.type === "ceo"
              ? "#f59e0b"
              : departmentStyle((node.data as AgentNodeData).agent.department).hex
          }
          className="!rounded-lg !border !border-border !bg-surface"
        />
      </ReactFlow>
    </div>
  );
}
