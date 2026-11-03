"use client";

import { useEffect, useRef, useState, type FormEvent, type Ref } from "react";
import Link from "next/link";
import type { ApprovalDetailDTO, ApprovalOutcome, DecideApprovalRequest, DocumentDTO } from "@techgens/core";
import { GATE_LABELS } from "@techgens/core";
import {
  ArrowLeft,
  Check,
  CircleSlash,
  Coins,
  ExternalLink,
  FileText,
  History,
  MessageSquareWarning,
  Rocket,
  Target,
  X,
} from "lucide-react";
import { MarkdownView } from "@/components/common/markdown";
import { QueryView } from "@/components/common/query-view";
import { ApprovalKindBadge, ApprovalStatusBadge } from "@/components/common/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/spinner";
import { Tabs } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import {
  APPROVAL_INTENT,
  APPROVAL_STATUS_TONE,
  DECISION_PLACEHOLDERS,
  STAGE_GATE_KINDS,
  approvalDisplayTitle,
  approvalStatusLabel,
  documentKindLabel,
  gateLabelLower,
} from "@/lib/labels";
import { useApiMutation } from "@/lib/mutations";
import { qk, useApproval, useBudgets } from "@/lib/queries";
import { asString, cn, isRecord } from "@/lib/utils";
import { grantConsequence, readOverrun } from "./budget-grant";
import { PayloadDetails } from "./payload-details";

export function ApprovalDetailPane({
  id,
  onDecided,
  onBack,
  takeFocus,
}: {
  id: string;
  onDecided: (approval: ApprovalDetailDTO, outcome: ApprovalOutcome) => void;
  onBack: () => void;
  /** Returns true (once) when the heading should receive focus, e.g. after a decision advanced the inbox. */
  takeFocus: () => boolean;
}) {
  const query = useApproval(id);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border px-4 py-2 lg:hidden">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft />
          Back to inbox
        </Button>
      </div>
      <QueryView query={query} loading={<LoadingBlock label="Loading approval…" />}>
        {(approval) => (
          <ApprovalDetail key={approval.id} approval={approval} onDecided={onDecided} takeFocus={takeFocus} />
        )}
      </QueryView>
    </div>
  );
}

/** One-line statement of what the CEO authorises, with deploy specifics when the payload or summary has them. */
function approvalIntent(approval: ApprovalDetailDTO): string {
  const payload = approval.payload ?? {};
  if (approval.kind === "prod_deploy") {
    const version = asString(payload.version);
    const sha = asString(payload.commitSha) ?? asString(payload.sha);
    const environment = asString(payload.environment) ?? "production";
    const rollback =
      asString(payload.rollback) ?? /rollback:\s*([^\n]+)/i.exec(approval.summary ?? "")?.[1]?.trim();
    const what = [version ? `version ${version}` : null, sha ? `(${sha.slice(0, 7)})` : null]
      .filter(Boolean)
      .join(" ");
    const rollbackText = !rollback
      ? "No rollback plan was provided — ask for one before approving."
      : rollback.includes("\n") || rollback.length > 160
        ? "Rollback: see the rollback plan below."
        : `Rollback: ${rollback.replace(/\.$/, "")}.`;
    return `Deploying ${what ? `${what} ` : ""}to ${environment}. ${rollbackText}`;
  }
  if (approval.kind === "merge_to_main") {
    const pr = payload.prNumber ?? payload.pullRequestNumber;
    const checks = Array.isArray(payload.checks) ? payload.checks : [];
    const failing = checks.filter((c) => {
      const conclusion = isRecord(c) ? (asString(c.conclusion) ?? asString(c.status) ?? "") : "";
      return /^(failure|failed|error|timed_out|cancelled|action_required)$/i.test(conclusion);
    }).length;
    const base =
      pr !== undefined && pr !== null
        ? `Merging the release PR #${String(pr)} into main. Required checks must be green.`
        : APPROVAL_INTENT.merge_to_main;
    return failing > 0
      ? `${base} ${failing} of ${checks.length} checks ${failing === 1 ? "is" : "are"} failing — don't merge until they pass.`
      : base;
  }
  return APPROVAL_INTENT[approval.kind] ?? "";
}

function ApprovalDetail({
  approval,
  onDecided,
  takeFocus,
}: {
  approval: ApprovalDetailDTO;
  onDecided: (approval: ApprovalDetailDTO, outcome: ApprovalOutcome) => void;
  takeFocus: () => boolean;
}) {
  const now = useNow();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pending = approval.status === "pending";
  const withdrawn = approval.status === "cancelled";
  const intent = pending ? approvalIntent(approval) : "";

  useEffect(() => {
    if (takeFocus()) headingRef.current?.focus();
  }, [takeFocus]);

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-6 px-5 py-5">
          <header>
            <div className="flex flex-wrap items-center gap-2">
              <ApprovalKindBadge kind={approval.kind} />
              <ApprovalStatusBadge status={approval.status} />
              {approval.round > 1 ? <Badge tone="info">Round {approval.round}</Badge> : null}
            </div>
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="mt-2 rounded-sm text-xl font-semibold leading-snug outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span className="sr-only">{GATE_LABELS[approval.kind] ?? approval.kind}: </span>
              {approvalDisplayTitle(approval.kind, approval.title)}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              {approval.initiativeId ? (
                <Link
                  href={`/initiatives/${approval.initiativeId}`}
                  className="inline-flex items-center gap-1 text-accent hover:underline"
                >
                  <Rocket aria-hidden className="size-3.5" />
                  {approval.initiativeTitle ?? "Initiative"}
                </Link>
              ) : (
                <span>Company-wide</span>
              )}
              {approval.requestedBy ? <span>Requested by {approval.requestedBy}</span> : null}
              <span title={formatDateTime(approval.createdAt)}>{relativeTime(approval.createdAt, now)}</span>
            </p>
            {intent ? (
              <p className="mt-3 flex items-start gap-2 rounded-lg border border-accent/20 bg-accent/[0.05] px-3 py-2 text-sm">
                <Target aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
                <span>
                  <span className="font-medium text-fg">What you&apos;re approving: </span>
                  <span className="text-muted">{intent}</span>
                </span>
              </p>
            ) : null}
            {withdrawn ? (
              <p className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-sm text-muted">
                <CircleSlash aria-hidden className="mt-0.5 size-4 shrink-0 text-subtle" />
                Withdrawn — the initiative was cancelled, so no decision is needed.
              </p>
            ) : null}
          </header>

          {approval.summary.trim() ? (
            <section aria-labelledby="approval-summary">
              <h3
                id="approval-summary"
                className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle"
              >
                Summary
              </h3>
              <div className="rounded-lg border border-border bg-surface-2/50 p-4">
                <MarkdownView content={approval.summary} />
              </div>
            </section>
          ) : null}

          {Object.keys(approval.payload ?? {}).length > 0 ? (
            <section aria-labelledby="approval-details">
              <h3
                id="approval-details"
                className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle"
              >
                Details
              </h3>
              <PayloadDetails kind={approval.kind} payload={approval.payload} />
            </section>
          ) : null}

          {approval.documents.length > 0 ? <AttachedDocuments documents={approval.documents} /> : null}

          {approval.decisions.length > 0 ? (
            <section aria-labelledby="approval-history">
              <h3
                id="approval-history"
                className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle"
              >
                <History aria-hidden className="size-3.5" /> Decision history
              </h3>
              <ol className="space-y-2">
                {approval.decisions.map((d, i) => (
                  <li
                    key={`${d.createdAt}-${i}`}
                    className="rounded-lg border border-border bg-surface-2/40 px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge tone={APPROVAL_STATUS_TONE[d.outcome] ?? "neutral"} dot>
                        {approvalStatusLabel(d.outcome)}
                      </Badge>
                      <span className="text-xs text-subtle">
                        Round {d.round} · {formatDateTime(d.createdAt)}
                      </span>
                    </div>
                    {d.comment ? (
                      <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted">{d.comment}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>
      </div>
      {pending ? <DecisionBar approval={approval} onDecided={onDecided} /> : null}
    </>
  );
}

function AttachedDocuments({ documents }: { documents: DocumentDTO[] }) {
  const [active, setActive] = useState(documents[0]?.id ?? "");
  const doc = documents.find((d) => d.id === active) ?? documents[0];
  if (!doc) return null;
  return (
    <section aria-labelledby="approval-docs">
      <h3
        id="approval-docs"
        className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle"
      >
        <FileText aria-hidden className="size-3.5" /> Attached documents ({documents.length})
      </h3>
      {documents.length > 1 ? (
        <Tabs
          tabs={documents.map((d) => ({ id: d.id, label: d.title }))}
          value={doc.id}
          onChange={setActive}
          idBase="approval-doc"
          label="Attached documents"
          variant="pills"
          className="mb-3"
        />
      ) : null}
      <div
        role={documents.length > 1 ? "tabpanel" : undefined}
        id={documents.length > 1 ? `approval-doc-panel-${doc.id}` : undefined}
        aria-labelledby={documents.length > 1 ? `approval-doc-tab-${doc.id}` : undefined}
        className="rounded-lg border border-border"
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2/60 px-4 py-2.5">
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{doc.title}</p>
          <Badge>{documentKindLabel(doc.kind)}</Badge>
          <Badge tone="info">v{doc.version}</Badge>
          <Link
            href={`/documents/${doc.id}`}
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            <ExternalLink aria-hidden className="size-3" /> Open
          </Link>
        </div>
        <div className="p-4 sm:p-5">
          {doc.content.trim() ? (
            <MarkdownView content={doc.content} />
          ) : (
            <p className="text-sm text-subtle">This document is empty.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function rejectOutcome(approval: ApprovalDetailDTO): string {
  if (approval.initiativeId && STAGE_GATE_KINDS.includes(approval.kind)) {
    return "The initiative will be paused with your reason. You can resume it to ask for a different proposal, or cancel it.";
  }
  if (approval.kind === "budget_overrun") return "No extra credits are granted and the blocked work stops.";
  if (approval.kind === "hire") return "The hire request is declined and the requesting agent is told why.";
  return "The requesting agent is told to stop this path, with your reason.";
}

/** "Extra credits" for a budget overrun: prefilled with the suggested grant, with its live consequence as the hint. */
function BudgetGrantField({
  approval,
  inputRef,
  error,
  onEdit,
}: {
  approval: ApprovalDetailDTO;
  inputRef: Ref<HTMLInputElement>;
  error: string | null;
  onEdit: () => void;
}) {
  const budgets = useBudgets();
  const payload = approval.payload ?? {};
  const budget = budgets.data?.find((b) => b.id === asString(payload.budgetId));
  const facts = readOverrun(payload, approval.summary, budget);
  const [initial] = useState(() => {
    const suggested = readOverrun(payload, approval.summary, undefined).suggestedExtraCredits;
    return suggested !== null ? String(suggested) : "";
  });
  const [text, setText] = useState(initial);
  const value = text.trim() === "" ? null : Number(text);
  const consequence =
    value !== null && Number.isFinite(value) && value > 0 ? grantConsequence(value, facts) : null;
  return (
    <Field
      label="Extra credits"
      htmlFor="extra-credits"
      hint={consequence ?? "Granted for the current budget window only."}
      error={error ?? undefined}
    >
      <Input
        id="extra-credits"
        name="extraCredits"
        ref={inputRef}
        type="number"
        min={0}
        step="any"
        inputMode="decimal"
        defaultValue={initial}
        onInput={(event) => {
          setText(event.currentTarget.value);
          onEdit();
        }}
        aria-invalid={Boolean(error)}
        className="max-w-40 tabular-nums"
      />
    </Field>
  );
}

function DecisionBar({
  approval,
  onDecided,
}: {
  approval: ApprovalDetailDTO;
  onDecided: (approval: ApprovalDetailDTO, outcome: ApprovalOutcome) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const extraRef = useRef<HTMLInputElement>(null);
  const isBudget = approval.kind === "budget_overrun";

  const [error, setError] = useState<string | null>(null);
  const [extraError, setExtraError] = useState<string | null>(null);
  const [hasComment, setHasComment] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);

  const decide = useApiMutation(
    (body: DecideApprovalRequest) =>
      api.post<ApprovalDetailDTO>(`/api/approvals/${approval.id}/decide`, body),
    {
      errorTitle: "Couldn't record your decision",
      invalidate: [["approvals"], qk.dashboard, ["initiatives"], ["notifications"], ["budgets"], ["usage"]],
      onSuccess: (result, body) => {
        setConfirmReject(false);
        onDecided(result, body.outcome);
      },
    },
  );

  /**
   * Reads the decision inputs from the form at submit time. Event handlers can run against an older render (or
   * text can land in the field without a React change event), so closure state is not trusted here.
   */
  function readForm(): { comment: string; extra: string } {
    const data = formRef.current ? new FormData(formRef.current) : null;
    const comment = data?.get("comment") ?? commentRef.current?.value ?? "";
    const extra = data?.get("extraCredits") ?? extraRef.current?.value ?? "";
    return {
      comment: typeof comment === "string" ? comment.trim() : "",
      extra: typeof extra === "string" ? extra.trim() : "",
    };
  }

  function submit(outcome: ApprovalOutcome, confirmed = false) {
    if (decide.isPending) return;
    const { comment, extra } = readForm();
    setHasComment(comment.length > 0);
    setError(null);
    setExtraError(null);
    if (outcome !== "approved" && !comment) {
      setConfirmReject(false);
      setError(
        outcome === "rejected"
          ? "Tell the team why you're rejecting this."
          : "Describe the changes you want.",
      );
      commentRef.current?.focus();
      return;
    }
    const body: DecideApprovalRequest = { outcome };
    if (comment) body.comment = comment;
    if (isBudget && outcome === "approved") {
      const amount = Number(extra);
      if (!extra || !Number.isFinite(amount) || amount <= 0) {
        setExtraError(extra ? "Enter a positive number of credits." : "Enter how many credits to grant.");
        extraRef.current?.focus();
        return;
      }
      body.extraCredits = amount;
    }
    if (outcome === "rejected" && !confirmed) {
      setConfirmReject(true);
      return;
    }
    decide.mutate(body);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Enter in the credits field grants; the comment field is multi-line and never submits implicitly.
    if (isBudget) submit("approved");
  }

  const kindLabel = gateLabelLower(approval.kind);
  const stageGate = Boolean(approval.initiativeId) && STAGE_GATE_KINDS.includes(approval.kind);

  return (
    <div className="@container border-t border-border bg-surface-2/80 px-4 py-3 backdrop-blur sm:px-5 sm:py-4">
      <form ref={formRef} onSubmit={onSubmit} noValidate aria-label="Your decision">
        <div className={cn("grid gap-3", isBudget && "@lg:grid-cols-[15rem_minmax(0,1fr)]")}>
          {isBudget ? (
            <BudgetGrantField
              approval={approval}
              inputRef={extraRef}
              error={extraError}
              onEdit={() => setExtraError(null)}
            />
          ) : null}
          <Field
            label="Comment for the team"
            htmlFor="decision-comment"
            hint={
              isBudget
                ? "Optional when granting; required to reject."
                : "Optional when approving; required to request changes or reject."
            }
            error={error ?? undefined}
            className="@max-md:[&>p:not([role=alert])]:hidden"
          >
            <Textarea
              id="decision-comment"
              name="comment"
              ref={commentRef}
              rows={2}
              defaultValue=""
              onInput={(event) => {
                const filled = event.currentTarget.value.trim().length > 0;
                setHasComment(filled);
                if (error && filled) setError(null);
              }}
              placeholder={DECISION_PLACEHOLDERS[approval.kind]}
              aria-invalid={Boolean(error)}
              data-filled={hasComment || undefined}
              className={cn(
                "min-h-14",
                // Narrow panes (phones, small laptops): one compact line that expands while focused or filled,
                // so the brief above stays readable.
                "@max-md:h-9 @max-md:min-h-9 @max-md:resize-none @max-md:py-1.5 @max-md:focus:h-24 @max-md:data-[filled]:h-24",
              )}
            />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2 @max-md:mt-2 @max-md:flex-nowrap @max-md:[&>button]:flex-1">
          <Button
            variant="outline"
            className="border-rose-400/40 text-rose-200 hover:bg-rose-500/10"
            onClick={() => submit("rejected")}
            disabled={decide.isPending}
            loading={decide.isPending && decide.variables?.outcome === "rejected"}
          >
            {decide.isPending && decide.variables?.outcome === "rejected" ? null : <X />}
            Reject
          </Button>
          {!isBudget ? (
            <Button
              variant="outline"
              className="border-sky-400/40 text-sky-100 hover:bg-sky-400/10"
              onClick={() => submit("changes_requested")}
              loading={decide.isPending && decide.variables?.outcome === "changes_requested"}
              disabled={decide.isPending}
              aria-label="Request changes"
            >
              {decide.isPending && decide.variables?.outcome === "changes_requested" ? null : (
                <MessageSquareWarning />
              )}
              <span className="@md:hidden">Changes</span>
              <span className="@max-md:hidden">Request changes</span>
            </Button>
          ) : null}
          <Button
            variant="success"
            onClick={() => submit("approved")}
            loading={decide.isPending && decide.variables?.outcome === "approved"}
            disabled={decide.isPending}
          >
            {decide.isPending && decide.variables?.outcome === "approved" ? null : isBudget ? (
              <Coins />
            ) : (
              <Check />
            )}
            {isBudget ? "Grant credits" : "Approve"}
          </Button>
        </div>
      </form>
      <Dialog
        open={confirmReject}
        onClose={() => setConfirmReject(false)}
        title={`Reject ${kindLabel}?`}
        description={rejectOutcome(approval)}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReject(false)} data-autofocus>
              Go back
            </Button>
            <Button variant="danger" onClick={() => submit("rejected", true)} loading={decide.isPending}>
              Reject {kindLabel}
            </Button>
          </>
        }
      >
        {!isBudget ? (
          <p className="text-sm text-muted">
            {stageGate
              ? "Want a revised proposal right away instead? Use “Request changes”."
              : "Use “Request changes” if you want a revised proposal instead."}
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}
