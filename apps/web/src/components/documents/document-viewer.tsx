"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { DocumentDTO } from "@techgens/core";
import { ArrowLeft, Download, FileText, History, Rocket } from "lucide-react";
import { MarkdownView } from "@/components/common/markdown";
import { QueryView } from "@/components/common/query-view";
import { GenericStatusBadge } from "@/components/common/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Select } from "@/components/ui/input";
import { PageSkeleton } from "@/components/ui/skeleton";
import { formatDateTime, humanize, relativeTime } from "@/lib/format";
import { documentKindLabel } from "@/lib/labels";
import { useDocumentTitle, useNow, useQueryParams } from "@/lib/hooks";
import { useDocument } from "@/lib/queries";
import { cn, downloadText } from "@/lib/utils";

export function DocumentViewer({ id }: { id: string }) {
  const { get, set } = useQueryParams();
  const raw = get("version");
  const version = raw && /^\d+$/.test(raw) ? Number(raw) : undefined;
  const query = useDocument(id, version);
  return (
    <QueryView query={query} loading={<PageSkeleton />} errorTitle="Couldn't load this document">
      {(doc) => (
        <DocumentBody
          doc={doc}
          selectedVersion={version}
          loading={query.isFetching}
          onVersion={(v) => set({ version: v })}
        />
      )}
    </QueryView>
  );
}

function DocumentBody({
  doc,
  selectedVersion,
  loading,
  onVersion,
}: {
  doc: DocumentDTO;
  selectedVersion: number | undefined;
  loading: boolean;
  onVersion: (version: number | null) => void;
}) {
  const now = useNow();
  useDocumentTitle(`${doc.title} · Documents · Techgens`);
  const versions = [...doc.versions].sort((a, b) => b.version - a.version);
  const latest = versions[0]?.version ?? doc.version;
  const shown = selectedVersion ?? doc.version;
  const isLatest = shown >= latest;
  const fileName = `${doc.title
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()}-v${shown}.md`;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/documents"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
        >
          <ArrowLeft aria-hidden className="size-4" /> Documents
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{documentKindLabel(doc.kind)}</Badge>
              <GenericStatusBadge status={doc.status} />
              {!isLatest ? <Badge tone="warning">Viewing an older version</Badge> : null}
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{doc.title}</h1>
            <p className="mt-1 text-sm text-muted">
              {doc.authorName ? `${doc.authorName} · ` : ""}updated {relativeTime(doc.updatedAt, now)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="doc-version" className="text-sm text-muted">
              Version
            </label>
            <Select
              id="doc-version"
              className="w-40"
              value={String(shown)}
              onChange={(e) => {
                const v = Number(e.target.value);
                onVersion(v === latest ? null : v);
              }}
            >
              {versions.length === 0 ? <option value={doc.version}>v{doc.version}</option> : null}
              {versions.map((v) => (
                <option key={v.version} value={v.version}>
                  v{v.version}
                  {v.version === latest ? " (latest)" : ""}
                </option>
              ))}
            </Select>
            <CopyButton text={doc.content} label="Copy Markdown" />
            <Button variant="secondary" size="sm" onClick={() => downloadText(fileName, doc.content)}>
              <Download />
              Download
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <Card className={cn("min-w-0 transition-opacity", loading && "opacity-70")}>
          <h2 className="sr-only">Document content</h2>
          <CardContent className="px-5 py-6 sm:px-8">
            {doc.content.trim() ? (
              // The page H1 is the title: drop the document's own copy of it and nest its sections below.
              <MarkdownView
                content={doc.content}
                className="mx-auto max-w-3xl"
                headingOffset={1}
                dropTitle={doc.title}
              />
            ) : (
              <p className="text-sm text-subtle">This version is empty.</p>
            )}
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" icon={FileText} />
            <CardContent>
              <dl className="space-y-2 text-sm">
                <Row label="Kind">{documentKindLabel(doc.kind)}</Row>
                <Row label="Status">{humanize(doc.status)}</Row>
                <Row label="Author">{doc.authorName ?? "—"}</Row>
                <Row label="Updated">{formatDateTime(doc.updatedAt)}</Row>
                <Row label="Initiative">
                  {doc.initiativeId ? (
                    <Link
                      href={`/initiatives/${doc.initiativeId}`}
                      className="inline-flex min-w-0 items-center gap-1 text-accent hover:underline"
                    >
                      <Rocket aria-hidden className="size-3.5 shrink-0" />
                      <span className="truncate">{doc.initiativeTitle ?? "Open initiative"}</span>
                    </Link>
                  ) : (
                    "Company-wide"
                  )}
                </Row>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Version history" icon={History} />
            {versions.length === 0 ? (
              <CardContent className="text-sm text-subtle">Only one version.</CardContent>
            ) : (
              <ol className="divide-y divide-border/70">
                {versions.map((v) => {
                  const active = v.version === shown;
                  return (
                    <li key={v.version}>
                      <button
                        type="button"
                        onClick={() => onVersion(v.version === latest ? null : v.version)}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "w-full px-4 py-2.5 text-left transition-colors",
                          active ? "bg-accent/[0.08]" : "hover:bg-white/[0.03]",
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className={cn("text-sm font-medium", active ? "text-accent" : "text-fg")}>
                            v{v.version}
                          </span>
                          <span className="text-[11px] text-subtle">{relativeTime(v.createdAt, now)}</span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-muted">
                          {v.changeSummary || "No change summary"}
                        </span>
                        {v.authorName ? (
                          <span className="block text-[11px] text-subtle">{v.authorName}</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-fg">{children}</dd>
    </div>
  );
}
