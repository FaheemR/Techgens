"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { DecisionDTO, DocumentSummaryDTO, InitiativeDetailDTO } from "@techgens/core";
import { GATE_LABELS, LIFECYCLE_STAGES, STAGES } from "@techgens/core";
import {
  ArrowLeft,
  Ban,
  CalendarDays,
  CircleSlash,
  Coins,
  FileText,
  Gavel,
  Inbox,
  ListChecks,
  Map as MapIcon,
  OctagonPause,
  Pause,
  Pencil,
  Play,
  Quote,
  ShieldAlert,
  ShieldX,
} from "lucide-react";
import { MarkdownView } from "@/components/common/markdown";
import { QueryView } from "@/components/common/query-view";
import { LifecycleStepper, stageShortTitle } from "@/components/common/stages";
import { ApprovalKindBadge, ApprovalStatusBadge, InitiativeStatusBadge } from "@/components/common/status";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { PageSkeleton } from "@/components/ui/skeleton";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { WorkItemSheet } from "@/components/work/work-item-sheet";
import { WorkItemsTable } from "@/components/work/work-items-table";
import { api } from "@/lib/api";
import { credits, formatDate, formatDateTime, humanize, percent, relativeTime } from "@/lib/format";
import { approvalDisplayTitle, approvalHeadline, documentKindLabel } from "@/lib/labels";
import { useNow } from "@/lib/hooks";
import { useApiMutation } from "@/lib/mutations";
import { qk, useInitiative, useWorkItems } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { EditInitiativeDialog } from "./edit-initiative-dialog";
import { MilestoneRoadmap } from "./milestones";

type TabId = "overview" | "work" | "documents" | "approvals" | "decisions";

export function InitiativeDetailView({ id }: { id: string }) {
  const query = useInitiative(id);
  return (
    <QueryView query={query} loading={<PageSkeleton />} errorTitle="Couldn't load this initiative">
      {(initiative) => <InitiativeDetail initiative={initiative} />}
    </QueryView>
  );
}

/**
 * Why the initiative is in its current state. Uses `statusReason` from the orchestrator. Older orchestrators don't
 * send the field at all and leave a rejected initiative "active", so for them "Rejected at <gate>: <comment>" is
 * derived from the approvals and decision log.
 */
function statusReasonOf(initiative: InitiativeDetailDTO): string | null {
  const reported = initiative.statusReason as string | null | undefined;
  if (reported !== undefined) return reported?.trim() || null;
  if (initiative.status !== "active" && initiative.status !== "paused") return null;
  const gate = STAGES[initiative.stage]?.gate;
  if (!gate) return null;
  const latest = initiative.approvals
    .filter((a) => a.kind === gate)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  if (latest?.status !== "rejected") return null;
  const label = GATE_LABELS[gate];
  const decision = initiative.decisions
    .filter((d) => d.actorType === "ceo" && /\brejected\b/i.test(d.summary) && d.summary.includes(label))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  const comment = decision?.details?.trim();
  return `Rejected at ${label}${comment ? `: ${comment}` : ""}`;
}

function isRejection(reason: string | null): boolean {
  return Boolean(reason && /^rejected\b/i.test(reason));
}

function normalizeText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/[.…\s]+$/, "")
    .trim()
    .toLowerCase();
}

function InitiativeDetail({ initiative }: { initiative: InitiativeDetailDTO }) {
  const [tab, setTab] = useState<TabId>("overview");
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [openItem, setOpenItem] = useState<string | null>(null);
  const now = useNow();
  const workItems = useWorkItems({ initiativeId: initiative.id });

  const finished = initiative.status === "completed" || initiative.status === "cancelled";
  const reason = statusReasonOf(initiative);
  const rejected = isRejection(reason);

  const action = useApiMutation(
    (verb: "pause" | "resume" | "cancel") =>
      api.post<InitiativeDetailDTO>(`/api/initiatives/${initiative.id}/${verb}`),
    {
      success: (_r, verb) =>
        verb === "pause"
          ? "Initiative paused"
          : verb === "resume"
            ? rejected
              ? "Initiative resumed — the team will propose a different approach"
              : "Initiative resumed"
            : "Initiative cancelled",
      errorTitle: "Couldn't update the initiative",
      invalidate: [["initiatives"], qk.dashboard, ["jobs"], ["approvals"]],
      onSuccess: () => setConfirmCancel(false),
    },
  );

  // A cancelled or completed initiative never waits on the CEO, even if an old gate is still open.
  const pending = finished ? [] : initiative.approvals.filter((a) => a.status === "pending");
  const stageNumber = LIFECYCLE_STAGES.indexOf(initiative.stage) + 1;
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "work", label: "Work items", count: workItems.data?.length ?? initiative.workItems.total },
    { id: "documents", label: "Documents", count: initiative.documents.length },
    { id: "approvals", label: "Approvals", count: initiative.approvals.length },
    { id: "decisions", label: "Decision log", count: initiative.decisions.length },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/initiatives"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
        >
          <ArrowLeft aria-hidden className="size-4" /> Initiatives
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight">{initiative.title}</h1>
              <InitiativeStatusBadge status={initiative.status} />
              {pending.length > 0 ? (
                <Badge tone="warning" dot pulse>
                  {pending.length} awaiting your approval
                </Badge>
              ) : null}
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span>
                Stage {stageNumber}/{LIFECYCLE_STAGES.length}:{" "}
                <span className="text-fg">{stageShortTitle(initiative.stage)}</span>
              </span>
              {initiative.productName ? <span>Product: {initiative.productName}</span> : null}
              <span className="inline-flex items-center gap-1">
                <CalendarDays aria-hidden className="size-3.5" />
                {initiative.targetDate ? `Target ${formatDate(initiative.targetDate)}` : "No target date"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Coins aria-hidden className="size-3.5" />
                {initiative.budgetCredits
                  ? `Budget ${credits(initiative.budgetCredits)} cr · total`
                  : "No budget cap"}
              </span>
              <span>Updated {relativeTime(initiative.updatedAt, now)}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <Pencil />
              Edit
            </Button>
            {initiative.status === "paused" ? (
              <Button
                variant="success"
                size="sm"
                onClick={() => action.mutate("resume")}
                loading={action.isPending && action.variables === "resume"}
              >
                <Play />
                Resume
              </Button>
            ) : !finished ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => action.mutate("pause")}
                loading={action.isPending && action.variables === "pause"}
              >
                <Pause />
                Pause
              </Button>
            ) : null}
            {!finished ? (
              <Button
                variant="outline"
                size="sm"
                className="border-rose-400/40 text-rose-200 hover:bg-rose-500/10"
                onClick={() => setConfirmCancel(true)}
              >
                <Ban />
                Cancel initiative…
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <StatusBanner
        initiative={initiative}
        reason={reason}
        onResume={() => action.mutate("resume")}
        resuming={action.isPending && action.variables === "resume"}
        onCancel={() => setConfirmCancel(true)}
      />

      <Card>
        <CardContent>
          <LifecycleStepper
            stages={initiative.stages}
            approvals={
              finished ? initiative.approvals.filter((a) => a.status !== "pending") : initiative.approvals
            }
          />
        </CardContent>
      </Card>

      {pending.length > 0 ? (
        <Card className="border-amber-400/30 bg-amber-400/[0.04]">
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <ShieldAlert aria-hidden className="size-5 shrink-0 text-amber-300" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {initiative.status === "paused"
                  ? "Paused, but a decision is still waiting on you"
                  : "This initiative is waiting on you"}
              </p>
              <p className="truncate text-sm text-muted">
                {pending.map((a) => approvalHeadline(a.kind, a.title)).join(" · ")}
              </p>
            </div>
            <Link
              href={`/approvals?id=${pending[0]?.id ?? ""}`}
              className={buttonVariants({ variant: "warning", size: "sm" })}
            >
              <Inbox />
              Review now
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <div>
        <Tabs
          tabs={tabs}
          value={tab}
          onChange={(t) => setTab(t as TabId)}
          idBase="initiative"
          label="Initiative sections"
        />
        <div className="pt-5">
          {tab === "overview" ? (
            <TabPanel idBase="initiative" id="overview">
              <Overview initiative={initiative} />
            </TabPanel>
          ) : null}
          {tab === "work" ? (
            <TabPanel idBase="initiative" id="work">
              <Card>
                <QueryView query={workItems}>
                  {(items) => <WorkItemsTable items={items} onOpen={setOpenItem} />}
                </QueryView>
              </Card>
            </TabPanel>
          ) : null}
          {tab === "documents" ? (
            <TabPanel idBase="initiative" id="documents">
              <DocumentsList documents={initiative.documents} />
            </TabPanel>
          ) : null}
          {tab === "approvals" ? (
            <TabPanel idBase="initiative" id="approvals">
              <ApprovalsList initiative={initiative} />
            </TabPanel>
          ) : null}
          {tab === "decisions" ? (
            <TabPanel idBase="initiative" id="decisions">
              <DecisionLog decisions={initiative.decisions} />
            </TabPanel>
          ) : null}
        </div>
      </div>

      <EditInitiativeDialog initiative={initiative} open={editing} onClose={() => setEditing(false)} />
      <Dialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel this initiative?"
        description={`Agents stop all work on it and open jobs are cancelled.${
          pending.length > 0
            ? ` ${pending.length === 1 ? "Its pending approval is" : `Its ${pending.length} pending approvals are`} withdrawn.`
            : ""
        } Documents and decisions are kept. This can't be undone.`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)} data-autofocus>
              Keep initiative
            </Button>
            <Button
              variant="danger"
              onClick={() => action.mutate("cancel")}
              loading={action.isPending && action.variables === "cancel"}
            >
              Cancel initiative
            </Button>
          </>
        }
      />
      <WorkItemSheet id={openItem} onClose={() => setOpenItem(null)} onOpenItem={setOpenItem} />
    </div>
  );
}

function StatusBanner({
  initiative,
  reason,
  onResume,
  resuming,
  onCancel,
}: {
  initiative: InitiativeDetailDTO;
  reason: string | null;
  onResume: () => void;
  resuming: boolean;
  onCancel: () => void;
}) {
  const rejected = isRejection(reason);
  if (initiative.status === "cancelled") {
    return (
      <Card className="border-border-strong bg-white/[0.02]">
        <CardContent className="flex items-start gap-3">
          <CircleSlash aria-hidden className="mt-0.5 size-5 shrink-0 text-subtle" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Cancelled</p>
            <p className="text-sm text-muted">
              {(reason ?? "Agents stopped all work on this initiative").replace(/[.\s]+$/, "")}. Documents and
              decisions are kept.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }
  if (!reason) return null;
  if (initiative.status === "completed") {
    return (
      <Card className="border-emerald-400/25 bg-emerald-400/[0.04]">
        <CardContent className="text-sm text-muted">{reason}</CardContent>
      </Card>
    );
  }
  const paused = initiative.status === "paused";
  return (
    <Card className="border-amber-400/30 bg-amber-400/[0.05]">
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {paused ? (
          <OctagonPause aria-hidden className="size-5 shrink-0 text-amber-300" />
        ) : (
          <ShieldX aria-hidden className="size-5 shrink-0 text-amber-300" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-amber-100">
            {paused
              ? rejected
                ? "Paused after your rejection"
                : "Paused"
              : "You rejected the current proposal"}
          </p>
          <p className="whitespace-pre-wrap break-words text-sm text-muted">{reason}</p>
          {!paused && rejected ? (
            <p className="mt-1 text-xs text-subtle">
              The team has stopped this path. Cancel the initiative, or pause it while you decide.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {paused ? (
            <Button variant="success" size="sm" onClick={onResume} loading={resuming}>
              {resuming ? null : <Play />}
              {rejected ? "Resume (ask for a new proposal)" : "Resume"}
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="border-rose-400/40 text-rose-200 hover:bg-rose-500/10"
            onClick={onCancel}
          >
            <Ban />
            Cancel initiative…
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Overview({ initiative }: { initiative: InitiativeDetailDTO }) {
  const { workItems } = initiative;
  const budget = initiative.budgetCredits;
  const ratio = budget ? initiative.spentCredits / budget : null;
  const summary = initiative.summary.trim();
  // Don't repeat the directive: the summary is often the directive itself (or its truncation).
  const summaryRepeatsDirective =
    summary !== "" && normalizeText(initiative.directive).startsWith(normalizeText(summary));
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <Card>
          <CardHeader title="Summary" icon={FileText} />
          <CardContent className="space-y-5">
            {summary && !summaryRepeatsDirective ? (
              <MarkdownView content={initiative.summary} />
            ) : !summary ? (
              <p className="text-sm text-subtle">The Chief of Staff hasn&apos;t written a summary yet.</p>
            ) : null}
            <figure className="rounded-lg border border-border bg-surface-2/60 p-4">
              <figcaption className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
                <Quote aria-hidden className="size-3.5" /> CEO directive
              </figcaption>
              <blockquote className="whitespace-pre-wrap text-sm text-muted">
                {initiative.directive}
              </blockquote>
            </figure>
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Roadmap" description="Milestones proposed at intake" icon={MapIcon} />
          <CardContent>
            <MilestoneRoadmap
              milestones={initiative.milestones}
              startDate={initiative.createdAt}
              targetDate={initiative.targetDate}
            />
          </CardContent>
        </Card>
      </div>
      <div className="space-y-6">
        <Card>
          <CardHeader title="Spend vs budget" icon={Coins} />
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-semibold tabular-nums">{credits(initiative.spentCredits)}</span>
              <span className="text-sm text-muted">
                {budget ? `of ${credits(budget)} cr · total budget` : "credits · no cap"}
              </span>
            </div>
            {budget ? (
              <>
                <Progress value={initiative.spentCredits} max={budget} label="Initiative budget used" />
                <p className={cn("text-xs", ratio !== null && ratio >= 1 ? "text-rose-300" : "text-muted")}>
                  {ratio !== null && ratio >= 1
                    ? "Budget exhausted — further spend needs your approval."
                    : `${percent(ratio ?? 0)} used · ${credits(Math.max(0, budget - initiative.spentCredits))} remaining`}
                </p>
              </>
            ) : (
              <p className="text-xs text-subtle">Set a budget via Edit to cap spend for this initiative.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Delivery" icon={ListChecks} />
          <CardContent className="space-y-3">
            <Progress
              value={workItems.done}
              max={Math.max(1, workItems.total)}
              tone="success"
              label="Work items completed"
            />
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="Total" value={workItems.total} />
              <Stat label="Done" value={workItems.done} />
              <Stat label="In progress" value={workItems.inProgress} />
              <Stat label="Blocked" value={workItems.blocked} danger={workItems.blocked > 0} />
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Key facts" icon={CalendarDays} />
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Fact label="Status">{humanize(initiative.status)}</Fact>
              <Fact label="Stage">{stageShortTitle(initiative.stage)}</Fact>
              <Fact label="Product">{initiative.productName ?? "—"}</Fact>
              <Fact label="Target date">
                {initiative.targetDate ? formatDate(initiative.targetDate) : "—"}
              </Fact>
              <Fact label="Budget">{budget ? `${credits(budget)} cr · total` : "No cap"}</Fact>
              <Fact label="Created">{formatDateTime(initiative.createdAt)}</Fact>
              <Fact label="Updated">{formatDateTime(initiative.updatedAt)}</Fact>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/50 px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-subtle">{label}</dt>
      <dd className={cn("text-lg font-semibold tabular-nums", danger ? "text-rose-300" : "text-fg")}>
        {value}
      </dd>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-fg">{children}</dd>
    </div>
  );
}

function DocumentsList({ documents }: { documents: DocumentSummaryDTO[] }) {
  const now = useNow();
  if (documents.length === 0) {
    return (
      <Card>
        <EmptyState
          compact
          icon={FileText}
          title="No documents yet"
          description="Charters, PRDs, UX specs, architecture docs and runbooks are written by agents as stages progress."
        />
      </Card>
    );
  }
  return (
    <Card>
      <ul className="divide-y divide-border/70">
        {documents.map((doc) => (
          <li key={doc.id}>
            <Link
              href={`/documents/${doc.id}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.025]"
            >
              <FileText aria-hidden className="size-4 shrink-0 text-subtle" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{doc.title}</p>
                <p className="text-xs text-muted">
                  {documentKindLabel(doc.kind)} · v{doc.version}
                  {doc.authorName ? ` · ${doc.authorName}` : ""} · updated {relativeTime(doc.updatedAt, now)}
                </p>
              </div>
              <Badge
                tone={
                  doc.status === "approved" ? "success" : doc.status === "in_review" ? "warning" : "neutral"
                }
              >
                {humanize(doc.status)}
              </Badge>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ApprovalsList({ initiative }: { initiative: InitiativeDetailDTO }) {
  const now = useNow();
  if (initiative.approvals.length === 0) {
    return (
      <Card>
        <EmptyState
          compact
          icon={ShieldAlert}
          title="No approvals yet"
          description="Gate reviews for this initiative will be listed here."
        />
      </Card>
    );
  }
  return (
    <Card>
      <ul className="divide-y divide-border/70">
        {initiative.approvals.map((approval) => (
          <li key={approval.id}>
            <Link
              href={`/approvals?id=${approval.id}`}
              className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.025]"
            >
              <ApprovalKindBadge kind={approval.kind} />
              <span className="min-w-0 flex-1 truncate font-medium">
                {approvalDisplayTitle(approval.kind, approval.title)}
              </span>
              <span className="text-xs text-subtle">
                round {approval.round} · {relativeTime(approval.decidedAt ?? approval.createdAt, now)}
              </span>
              <ApprovalStatusBadge status={approval.status} />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function DecisionLog({ decisions }: { decisions: DecisionDTO[] }) {
  const now = useNow();
  if (decisions.length === 0) {
    return (
      <Card>
        <EmptyState
          compact
          icon={Gavel}
          title="No decisions recorded"
          description="Agents log decisions, assumptions and overrides here so you can audit how the initiative evolved."
        />
      </Card>
    );
  }
  const sorted = [...decisions].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return (
    <Card>
      <CardContent>
        <ol className="relative space-y-5 border-l border-border-strong pl-5">
          {sorted.map((d) => (
            <li key={d.id} className="relative">
              <span
                aria-hidden
                className="absolute -left-[25px] top-1.5 size-2.5 rounded-full border-2 border-surface bg-violet-400"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={d.type === "override" ? "warning" : d.type === "assumption" ? "info" : "violet"}>
                  {humanize(d.type)}
                </Badge>
                <p className="font-medium">{d.summary}</p>
              </div>
              {d.details ? <MarkdownView content={d.details} compact className="mt-1.5 text-muted" /> : null}
              <p className="mt-1 text-xs text-subtle">
                {d.actorType === "ceo" ? "CEO" : (d.actorName ?? humanize(d.actorType))} ·{" "}
                <time dateTime={d.createdAt} title={formatDateTime(d.createdAt)}>
                  {relativeTime(d.createdAt, now)}
                </time>
              </p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
