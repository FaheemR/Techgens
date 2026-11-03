"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { AgentDTO, OrgDTO } from "@techgens/core";
import { LayoutList, Network, Users } from "lucide-react";
import { AgentAvatar } from "@/components/common/agent-avatar";
import { PageHeader } from "@/components/common/page-header";
import { QueryView } from "@/components/common/query-view";
import { DepartmentBadge, ExecutorBadge } from "@/components/common/status";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingBlock } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { credits, humanize } from "@/lib/format";
import { useQueryParams } from "@/lib/hooks";
import { departmentStyle } from "@/lib/labels";
import { useCompany, useOrg } from "@/lib/queries";
import { AgentSheet } from "./agent-sheet";

const OrgChart = dynamic(() => import("./org-chart"), {
  ssr: false,
  loading: () => <LoadingBlock label="Drawing the org chart…" className="h-full" />,
});

type View = "chart" | "directory";

export function OrgView() {
  const { get, set } = useQueryParams();
  const view = (get("view") as View | null) ?? "chart";
  const agentId = get("agent");
  const [showRetired, setShowRetired] = useState(false);
  const org = useOrg();
  const company = useCompany();

  const openAgent = useCallback((id: string) => set({ agent: id }), [set]);

  return (
    <div>
      <PageHeader
        title="Organisation"
        description="Your AI staff, who they report to and what they're working on right now. Click an agent for details, budget and model controls."
        actions={
          <>
            <label className="flex items-center gap-2 text-sm text-muted">
              <Switch checked={showRetired} onCheckedChange={setShowRetired} label="Show retired agents" />
              Show retired
            </label>
            <Segmented
              label="Org view"
              value={view}
              onChange={(v) => set({ view: v === "chart" ? null : v })}
              options={[
                {
                  value: "chart",
                  label: (
                    <>
                      <Network aria-hidden /> Chart
                    </>
                  ),
                },
                {
                  value: "directory",
                  label: (
                    <>
                      <LayoutList aria-hidden /> Directory
                    </>
                  ),
                },
              ]}
            />
          </>
        }
      />

      <QueryView
        query={org}
        loading={<Skeleton className="h-[calc(100dvh-14rem)] min-h-[480px] rounded-xl" />}
        isEmpty={(data) => data.agents.length === 0}
        empty={
          <Card>
            <EmptyState
              icon={Users}
              title="No agents staffed yet"
              description="The orchestrator staffs the company from the role catalogue on first start. Check that it has been seeded."
            />
          </Card>
        }
      >
        {(data) => (
          <OrgContent
            org={data}
            view={view}
            showRetired={showRetired}
            companyName={company.data?.name ?? "Your company"}
            onOpenAgent={openAgent}
          />
        )}
      </QueryView>

      <AgentSheet agentId={agentId} onClose={() => set({ agent: null })} />
    </div>
  );
}

function OrgContent({
  org,
  view,
  showRetired,
  companyName,
  onOpenAgent,
}: {
  org: OrgDTO;
  view: View;
  showRetired: boolean;
  companyName: string;
  onOpenAgent: (id: string) => void;
}) {
  const agents = useMemo(
    () => org.agents.filter((a) => showRetired || a.status !== "retired"),
    [org.agents, showRetired],
  );
  const departments = [...new Set(agents.map((a) => a.department))];
  const busy = agents.filter((a) => a.activeJobs > 0).length;
  const cloud = agents.filter((a) => a.executor === "cloud-agent").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
        <span>
          <span className="font-semibold text-fg">{agents.length}</span> agents
        </span>
        <span>
          <span className="font-semibold text-fg">{busy}</span> working now
        </span>
        <span>
          <span className="font-semibold text-fg">{cloud}</span> Copilot cloud agents
        </span>
        <span className="hidden h-4 w-px bg-border sm:block" aria-hidden />
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Departments">
          {departments.map((d) => (
            <li key={d} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 rounded-sm"
                style={{ backgroundColor: departmentStyle(d).hex }}
              />
              {departmentStyle(d).label}
            </li>
          ))}
        </ul>
      </div>

      {view === "chart" ? (
        <Card className="h-[calc(100dvh-15rem)] min-h-[480px] overflow-hidden">
          <OrgChart org={org} agents={agents} companyName={companyName} onOpenAgent={onOpenAgent} />
        </Card>
      ) : (
        <Directory agents={agents} onOpenAgent={onOpenAgent} />
      )}
    </div>
  );
}

function Directory({
  agents,
  onOpenAgent,
}: {
  agents: readonly AgentDTO[];
  onOpenAgent: (id: string) => void;
}) {
  const sorted = [...agents].sort(
    (a, b) => a.department.localeCompare(b.department) || a.roleTitle.localeCompare(b.roleTitle),
  );
  return (
    <Card>
      <Table>
        <THead>
          <tr>
            <TH>Agent</TH>
            <TH>Department</TH>
            <TH>Status</TH>
            <TH>Now</TH>
            <TH className="w-48">Spend today</TH>
          </tr>
        </THead>
        <TBody>
          {sorted.map((agent) => (
            <TR key={agent.id} className="cursor-pointer" onClick={() => onOpenAgent(agent.id)}>
              <TD>
                <button
                  type="button"
                  className="flex items-center gap-3 text-left"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenAgent(agent.id);
                  }}
                >
                  <AgentAvatar
                    name={agent.name}
                    department={agent.department}
                    cloud={agent.executor === "cloud-agent"}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium hover:text-accent">{agent.name}</span>
                    <span className="block text-xs text-muted">{agent.roleTitle}</span>
                  </span>
                </button>
              </TD>
              <TD>
                <div className="flex flex-wrap gap-1.5">
                  <DepartmentBadge department={agent.department} />
                  <ExecutorBadge executor={agent.executor} />
                </div>
              </TD>
              <TD>
                <Badge
                  tone={
                    agent.status === "active" ? "success" : agent.status === "paused" ? "warning" : "neutral"
                  }
                  dot
                >
                  {humanize(agent.status)}
                </Badge>
              </TD>
              <TD className="max-w-xs">
                <p className="truncate text-sm text-muted">{agent.currentActivity ?? "Idle"}</p>
                {agent.activeJobs > 0 ? (
                  <p className="text-xs text-accent">{agent.activeJobs} active job(s)</p>
                ) : null}
              </TD>
              <TD>
                <div className="flex items-center gap-2">
                  <Progress
                    value={agent.spentTodayCredits}
                    max={agent.dailyBudgetCredits}
                    label={`${agent.name} daily budget`}
                    size="sm"
                  />
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {credits(agent.spentTodayCredits)}/{credits(agent.dailyBudgetCredits)}
                  </span>
                </div>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}
