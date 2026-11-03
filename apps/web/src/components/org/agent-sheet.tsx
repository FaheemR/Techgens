"use client";

import { useState } from "react";
import Link from "next/link";
import type { AgentDetailDTO, AgentDTO, AgentStatus } from "@techgens/core";
import { Brain, Coins, Cpu, Pause, Play, ScrollText, SquareTerminal, UserPlus, Wrench } from "lucide-react";
import { AgentAvatar } from "@/components/common/agent-avatar";
import { MarkdownView } from "@/components/common/markdown";
import { QueryView } from "@/components/common/query-view";
import { DepartmentBadge, ExecutorBadge, JobStatusBadge } from "@/components/common/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, Sheet } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { LoadingBlock } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { credits, humanize, relativeTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { useApiMutation } from "@/lib/mutations";
import { qk, useAgent, useModels } from "@/lib/queries";

interface AgentPatch {
  name?: string;
  status?: AgentStatus;
  modelOverride?: string | null;
  dailyCreditsOverride?: number | null;
}

export function AgentSheet({ agentId, onClose }: { agentId: string | null; onClose: () => void }) {
  const query = useAgent(agentId);
  const agent = query.data;
  return (
    <Sheet
      open={Boolean(agentId)}
      onClose={onClose}
      title={
        agent ? (
          <span className="flex items-center gap-3">
            <AgentAvatar
              name={agent.name}
              department={agent.department}
              size="lg"
              cloud={agent.executor === "cloud-agent"}
            />
            <span className="min-w-0">
              <span className="block truncate">{agent.name}</span>
              <span className="block truncate text-sm font-normal text-muted">{agent.roleTitle}</span>
            </span>
          </span>
        ) : (
          "Agent"
        )
      }
      headerExtra={
        agent ? (
          <div className="flex flex-wrap items-center gap-2">
            <DepartmentBadge department={agent.department} />
            <Badge
              tone={agent.status === "active" ? "success" : agent.status === "paused" ? "warning" : "neutral"}
              dot
            >
              {humanize(agent.status)}
            </Badge>
            <ExecutorBadge executor={agent.executor} />
          </div>
        ) : null
      }
    >
      {agentId ? (
        <QueryView query={query} loading={<LoadingBlock label="Loading agent…" />}>
          {(detail) => <AgentDetail key={detail.id} agent={detail} />}
        </QueryView>
      ) : null}
    </Sheet>
  );
}

function AgentDetail({ agent }: { agent: AgentDetailDTO }) {
  const now = useNow();
  const models = useModels();
  const dailyOverride = agent.dailyCreditsOverride ?? null;
  const [modelOverride, setModelOverride] = useState(agent.modelOverride ?? "");
  const [daily, setDaily] = useState(dailyOverride === null ? "" : String(dailyOverride));
  const [hireOpen, setHireOpen] = useState(false);

  const patch = useApiMutation((body: AgentPatch) => api.patch<AgentDTO>(`/api/agents/${agent.id}`, body), {
    success: (_r, body) =>
      body.status
        ? body.status === "paused"
          ? `${agent.name} paused`
          : `${agent.name} resumed`
        : `${agent.name} updated`,
    errorTitle: "Couldn't update the agent",
    invalidate: [qk.org, qk.agent(agent.id)],
  });

  const dailyValue = Number(daily);
  const dailyEmpty = daily.trim() === "";
  const dailyInvalid = !dailyEmpty && (!Number.isFinite(dailyValue) || dailyValue < 0);
  const dailyUnchanged = !dailyEmpty && dailyValue === dailyOverride;
  const tools = [...(agent.role.definition.tools ?? []), ...(agent.role.definition.builtinTools ?? [])];
  const mcp = agent.role.definition.mcp ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {agent.status === "paused" ? (
          <Button
            variant="success"
            size="sm"
            onClick={() => patch.mutate({ status: "active" })}
            loading={patch.isPending && patch.variables?.status === "active"}
          >
            <Play />
            Resume agent
          </Button>
        ) : agent.status === "active" ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => patch.mutate({ status: "paused" })}
            loading={patch.isPending && patch.variables?.status === "paused"}
          >
            <Pause />
            Pause agent
          </Button>
        ) : null}
        <Button variant="secondary" size="sm" onClick={() => setHireOpen(true)}>
          <UserPlus />
          Hire another {agent.roleTitle}
        </Button>
      </div>

      <section className="rounded-lg border border-border bg-surface-2/50 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Now</p>
        <p className="mt-1 text-sm text-fg">{agent.currentActivity ?? "Idle — waiting for work"}</p>
        <p className="mt-0.5 text-xs text-muted">
          {agent.activeJobs} active job{agent.activeJobs === 1 ? "" : "s"}
        </p>
      </section>

      <section aria-labelledby="agent-budget">
        <h3
          id="agent-budget"
          className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle"
        >
          <Coins aria-hidden className="size-3.5" /> Budget today
          {dailyOverride !== null ? <Badge tone="accent">Override</Badge> : null}
        </h3>
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold tabular-nums">{credits(agent.spentTodayCredits)} credits</span>
          <span className="text-muted">of {credits(agent.dailyBudgetCredits)} daily</span>
        </div>
        <Progress
          value={agent.spentTodayCredits}
          max={agent.dailyBudgetCredits}
          label="Daily budget used"
          className="mt-2"
        />
        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!dailyEmpty && !dailyInvalid) patch.mutate({ dailyCreditsOverride: dailyValue });
          }}
        >
          <Field label="Daily budget override" htmlFor="agent-daily" className="flex-1">
            <Input
              id="agent-daily"
              type="number"
              min={0}
              step={5}
              value={daily}
              placeholder={
                dailyOverride === null ? `${credits(agent.dailyBudgetCredits)} (role default)` : undefined
              }
              onChange={(e) => setDaily(e.target.value)}
              aria-invalid={dailyInvalid || undefined}
              aria-describedby="agent-daily-hint"
            />
          </Field>
          <Button
            type="submit"
            size="md"
            variant="secondary"
            disabled={dailyEmpty || dailyInvalid || dailyUnchanged}
            loading={patch.isPending && typeof patch.variables?.dailyCreditsOverride === "number"}
          >
            Save
          </Button>
          {dailyOverride !== null ? (
            <Button
              size="md"
              variant="ghost"
              loading={patch.isPending && patch.variables?.dailyCreditsOverride === null}
              onClick={() => {
                setDaily("");
                patch.mutate({ dailyCreditsOverride: null });
              }}
            >
              Use role default
            </Button>
          ) : null}
        </form>
        {dailyInvalid ? (
          <p id="agent-daily-hint" role="alert" className="mt-1.5 text-xs text-rose-300">
            Enter a positive number
          </p>
        ) : (
          <p id="agent-daily-hint" className="mt-1.5 text-xs text-subtle">
            {dailyOverride !== null
              ? "This agent has its own daily limit; clear it to fall back to the role default."
              : "Using the role's default daily limit. Set a number to override it for this agent only."}
          </p>
        )}
      </section>

      <section aria-labelledby="agent-model">
        <h3
          id="agent-model"
          className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle"
        >
          <Cpu aria-hidden className="size-3.5" /> Model
          {agent.modelOverride ? <Badge tone="accent">Override</Badge> : null}
        </h3>
        <Field
          label="Model override"
          htmlFor="agent-model-select"
          hint={
            agent.modelOverride
              ? `Overrides the role default for this agent. Currently running on ${agent.model ?? agent.modelOverride}.`
              : `Using the role default: ${agent.model ?? "auto (runtime default)"}.`
          }
        >
          <Select
            id="agent-model-select"
            value={modelOverride}
            disabled={patch.isPending}
            onChange={(event) => {
              setModelOverride(event.target.value);
              patch.mutate({ modelOverride: event.target.value || null });
            }}
          >
            <option value="">Role default</option>
            {(models.data ?? []).map((m) => (
              <option key={m.id} value={m.id} disabled={!m.enabled}>
                {m.name}
                {m.multiplier !== undefined ? ` · ×${m.multiplier}` : ""}
                {m.enabled ? "" : " (not enabled)"}
              </option>
            ))}
            {modelOverride && !(models.data ?? []).some((m) => m.id === modelOverride) ? (
              <option value={modelOverride}>{modelOverride}</option>
            ) : null}
          </Select>
        </Field>
      </section>

      <section aria-labelledby="agent-tools">
        <h3
          id="agent-tools"
          className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle"
        >
          <Wrench aria-hidden className="size-3.5" /> Tools ({tools.length + mcp.length})
        </h3>
        {tools.length + mcp.length === 0 ? (
          <p className="text-sm text-subtle">No tools.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {tools.map((tool) => (
              <li
                key={tool}
                className="rounded-md border border-border bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-muted"
              >
                {tool}
              </li>
            ))}
            {mcp.map((server) => (
              <li
                key={`mcp-${server}`}
                className="rounded-md border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 font-mono text-[11px] text-violet-200"
              >
                mcp:{server}
              </li>
            ))}
          </ul>
        )}
      </section>

      {agent.role.definition.responsibilities?.length ? (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Responsibilities</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted marker:text-subtle">
            {agent.role.definition.responsibilities.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <details className="group rounded-lg border border-border">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-subtle hover:text-fg">
            <ScrollText aria-hidden className="size-3.5" /> Role prompt
            <span className="ml-auto text-[11px] font-normal normal-case tracking-normal group-open:hidden">
              Show
            </span>
            <span className="ml-auto hidden text-[11px] font-normal normal-case tracking-normal group-open:inline">
              Hide
            </span>
          </summary>
          <div className="border-t border-border p-4">
            <MarkdownView content={agent.role.prompt} compact />
            {agent.role.source ? (
              <p className="mt-3 text-[11px] text-subtle">Source: {agent.role.source}</p>
            ) : null}
          </div>
        </details>
      </section>

      <section aria-labelledby="agent-jobs">
        <h3
          id="agent-jobs"
          className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle"
        >
          <SquareTerminal aria-hidden className="size-3.5" /> Recent jobs
        </h3>
        {agent.recentJobs.length === 0 ? (
          <p className="text-sm text-subtle">No jobs yet.</p>
        ) : (
          <ul className="divide-y divide-border/70 rounded-lg border border-border">
            {agent.recentJobs.map((job) => (
              <li key={job.id}>
                <Link
                  href={`/activity/jobs/${job.id}`}
                  className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-white/[0.03]"
                >
                  <JobStatusBadge status={job.status} />
                  <span className="min-w-0 flex-1 truncate">
                    {job.workItemTitle ?? job.prompt.slice(0, 80)}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-subtle">
                    {credits(job.spentCredits)} cr · {relativeTime(job.createdAt, now)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="agent-memories">
        <h3
          id="agent-memories"
          className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle"
        >
          <Brain aria-hidden className="size-3.5" /> Memories ({agent.memories.length})
        </h3>
        {agent.memories.length === 0 ? (
          <p className="text-sm text-subtle">This agent hasn&apos;t saved any memories yet.</p>
        ) : (
          <ul className="space-y-2">
            {agent.memories.map((m) => (
              <li key={m.id} className="rounded-lg border border-border bg-surface-2/40 px-3 py-2">
                <p className="whitespace-pre-wrap text-sm text-fg">{m.content}</p>
                <p className="mt-1 text-[11px] text-subtle">{relativeTime(m.createdAt, now)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <HireDialog
        open={hireOpen}
        onClose={() => setHireOpen(false)}
        roleId={agent.roleId}
        roleTitle={agent.roleTitle}
      />
    </div>
  );
}

export function HireDialog({
  open,
  onClose,
  roleId,
  roleTitle,
}: {
  open: boolean;
  onClose: () => void;
  roleId: string;
  roleTitle: string;
}) {
  const [name, setName] = useState("");
  const hire = useApiMutation(
    (body: { roleId: string; name?: string }) => api.post<AgentDTO>("/api/agents", body),
    {
      success: (agent) => `Hired ${agent.name} as ${agent.roleTitle}`,
      errorTitle: "Couldn't hire the agent",
      invalidate: [qk.org],
      onSuccess: () => {
        setName("");
        onClose();
      },
    },
  );
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={`Hire another ${roleTitle}`}
      description="Adds a new agent with the same role definition, tools and budget defaults."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={hire.isPending}
            onClick={() => hire.mutate(name.trim() ? { roleId, name: name.trim() } : { roleId })}
          >
            <UserPlus />
            Hire
          </Button>
        </>
      }
    >
      <Field
        label="Name"
        htmlFor="hire-name"
        hint="Optional — a persona name is picked automatically if empty."
      >
        <Input
          id="hire-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Avery"
        />
      </Field>
    </Dialog>
  );
}
