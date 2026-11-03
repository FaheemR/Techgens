"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import type { ApprovalDetailDTO, ApprovalOutcome, DecideApprovalRequest, DocumentDTO } from "@techgens/core";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  FileText,
  History,
  MessageSquareWarning,
  Rocket,
  X,
} from "lucide-react";
import { MarkdownView } from "@/components/common/markdown";
import { QueryView } from "@/components/common/query-view";
import { ApprovalKindBadge, ApprovalStatusBadge } from "@/components/common/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/spinner";
import { Tabs } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { formatDateTime, humanize, relativeTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { APPROVAL_STATUS_TONE, documentKindLabel } from "@/lib/labels";
import { useApiMutation } from "@/lib/mutations";
import { qk, useApproval } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { PayloadDetails } from "./payload-details";

export function ApprovalDetailPane({
  id,
  onDecided,
  onBack,
}: {
  id: string;
  onDecided: (id: string) => void;
  onBack: () => void;
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
        {(approval) => <ApprovalDetail key={approval.id} approval={approval} onDecided={onDecided} />}
      </QueryView>
    </div>
  );
}

function ApprovalDetail({
  approval,
  onDecided,
}: {
  approval: ApprovalDetailDTO;
  onDecided: (id: string) => void;
}) {
  const now = useNow();
  const pending = approval.status === "pending";
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
            <h2 className="mt-2 text-xl font-semibold leading-snug">{approval.title}</h2>
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
              <PayloadDetails payload={approval.payload} />
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
                        {humanize(d.outcome)}
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

function DecisionBar({
  approval,
  onDecided,
}: {
  approval: ApprovalDetailDTO;
  onDecided: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
  const [extraCredits, setExtraCredits] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const isBudget = approval.kind === "budget_overrun";

  const decide = useApiMutation(
    (body: DecideApprovalRequest) =>
      api.post<ApprovalDetailDTO>(`/api/approvals/${approval.id}/decide`, body),
    {
      success: (_r, body) =>
        body.outcome === "approved"
          ? "Approved — the team is moving on"
          : body.outcome === "rejected"
            ? "Rejected"
            : "Changes requested",
      errorTitle: "Couldn't record your decision",
      invalidate: [["approvals"], qk.dashboard, ["initiatives"], ["notifications"]],
      onSuccess: (result) => {
        queryClient.setQueryData(qk.approval(approval.id), result);
        setConfirmReject(false);
        onDecided(approval.id);
      },
    },
  );

  const extra = extraCredits.trim() === "" ? undefined : Number(extraCredits);
  const extraInvalid = extra !== undefined && (!Number.isFinite(extra) || extra <= 0);

  function submit(outcome: ApprovalOutcome) {
    setError(null);
    if (outcome !== "approved" && !comment.trim()) {
      setError(
        outcome === "rejected"
          ? "Tell the team why you're rejecting this."
          : "Describe the changes you want.",
      );
      commentRef.current?.focus();
      return;
    }
    if (outcome === "rejected" && !confirmReject) {
      setConfirmReject(true);
      return;
    }
    if (extraInvalid && outcome === "approved") return;
    const body: DecideApprovalRequest = { outcome };
    if (comment.trim()) body.comment = comment.trim();
    if (isBudget && outcome === "approved" && extra !== undefined) body.extraCredits = extra;
    decide.mutate(body);
  }

  return (
    <div className="border-t border-border bg-surface-2/80 px-5 py-4 backdrop-blur">
      <div className={cn("grid gap-3", isBudget && "sm:grid-cols-[minmax(0,1fr)_12rem]")}>
        <Field
          label="Comment for the team"
          htmlFor="decision-comment"
          hint="Optional when approving; required to request changes or reject."
          error={error ?? undefined}
        >
          <Textarea
            id="decision-comment"
            ref={commentRef}
            rows={2}
            className="min-h-14"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="e.g. Approved — keep the MVP scope tight and drop multi-currency."
            aria-invalid={Boolean(error)}
          />
        </Field>
        {isBudget ? (
          <Field
            label="Extra credits"
            htmlFor="extra-credits"
            hint="Granted for the current window"
            error={extraInvalid ? "Enter a positive number, or leave empty" : undefined}
          >
            <Input
              id="extra-credits"
              type="number"
              min={1}
              step={10}
              inputMode="decimal"
              value={extraCredits}
              onChange={(event) => setExtraCredits(event.target.value)}
              placeholder="100"
            />
          </Field>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="outline"
          className="border-rose-400/40 text-rose-200 hover:bg-rose-500/10"
          onClick={() => submit("rejected")}
          disabled={decide.isPending}
        >
          <X />
          Reject
        </Button>
        <Button
          variant="outline"
          className="border-sky-400/40 text-sky-100 hover:bg-sky-400/10"
          onClick={() => submit("changes_requested")}
          loading={decide.isPending && decide.variables?.outcome === "changes_requested"}
          disabled={decide.isPending}
        >
          <MessageSquareWarning />
          Request changes
        </Button>
        <Button
          variant="success"
          onClick={() => submit("approved")}
          loading={decide.isPending && decide.variables?.outcome === "approved"}
          disabled={decide.isPending}
        >
          <Check />
          Approve
        </Button>
      </div>
      <ConfirmDialog
        open={confirmReject}
        onClose={() => setConfirmReject(false)}
        onConfirm={() => submit("rejected")}
        loading={decide.isPending}
        title="Reject this request?"
        description="The requesting agent is told to stop this path. Use “Request changes” if you want a revised proposal instead."
        confirmLabel="Reject"
      />
    </div>
  );
}
