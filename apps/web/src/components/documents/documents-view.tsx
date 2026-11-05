"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DOCUMENT_KINDS } from "@techgens/core";
import { FileSearch, FileText, Search } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { QueryView } from "@/components/common/query-view";
import { GenericStatusBadge } from "@/components/common/status";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime, relativeTime } from "@/lib/format";
import { documentKindLabel } from "@/lib/labels";
import { useDebounced, useNow, useQueryParams } from "@/lib/hooks";
import { useDocuments, useInitiatives } from "@/lib/queries";
import { cn } from "@/lib/utils";

export function DocumentsView() {
  const { get, set } = useQueryParams();
  const q = get("q") ?? "";
  const kind = get("kind") ?? "";
  const initiativeId = get("initiative") ?? "";
  const [search, setSearch] = useState(q);
  const debounced = useDebounced(search, 350);
  const now = useNow();

  const lastPushed = useRef(q);
  useEffect(() => {
    const next = debounced.trim();
    if (next === lastPushed.current) return;
    lastPushed.current = next;
    set({ q: next || null });
  }, [debounced, set]);

  const documents = useDocuments({
    q: q || undefined,
    kind: kind || undefined,
    initiativeId: initiativeId || undefined,
  });
  const initiatives = useInitiatives();

  return (
    <div>
      <PageHeader
        title="Documents"
        description="The company's knowledge base: charters, research, PRDs, UX specs, architecture, ADRs, test plans, release notes and runbooks."
      />
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_14rem_16rem]">
        <div className="relative">
          <label htmlFor="doc-search" className="sr-only">
            Search documents
          </label>
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
          />
          <Input
            id="doc-search"
            type="search"
            className="pl-9"
            placeholder="Full-text search across all documents…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="doc-kind" className="sr-only">
            Kind
          </label>
          <Select id="doc-kind" value={kind} onChange={(e) => set({ kind: e.target.value || null })}>
            <option value="">All kinds</option>
            {DOCUMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {documentKindLabel(k)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="doc-initiative" className="sr-only">
            Initiative
          </label>
          <Select
            id="doc-initiative"
            value={initiativeId}
            onChange={(e) => set({ initiative: e.target.value || null })}
          >
            <option value="">All initiatives</option>
            {(initiatives.data ?? []).map((i) => (
              <option key={i.id} value={i.id}>
                {i.title}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Card className={cn(documents.isFetching && documents.data && "opacity-80")}>
        {q ? (
          <p className="border-b border-border px-4 py-2.5 text-xs text-muted">
            Full-text results for <span className="font-medium text-fg">&ldquo;{q}&rdquo;</span>
          </p>
        ) : null}
        <QueryView query={documents} loading={<SkeletonRows rows={8} className="p-4" />}>
          {(list) =>
            list.length === 0 ? (
              q || kind || initiativeId ? (
                <EmptyState
                  icon={FileSearch}
                  title="No documents found"
                  description="Try different keywords or clear the filters."
                />
              ) : (
                <EmptyState
                  icon={FileText}
                  title="No documents yet"
                  description="Agents write documents as initiatives move through the lifecycle — starting with the charter and roadmap at intake."
                />
              )
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Title</TH>
                    <TH>Status</TH>
                    <TH>Initiative</TH>
                    <TH>Author</TH>
                    <TH className="text-right">Updated</TH>
                  </tr>
                </THead>
                <TBody>
                  {list.map((doc) => (
                    <TR key={doc.id}>
                      <TD className="max-w-md">
                        <Link
                          href={`/documents/${doc.id}`}
                          className="flex items-start gap-2 font-medium hover:text-accent"
                          title={doc.title}
                        >
                          <FileText aria-hidden className="size-4 shrink-0 text-subtle" />
                          <Badge className="shrink-0">{documentKindLabel(doc.kind)}</Badge>
                          <span className="min-w-0 whitespace-normal break-words">{doc.title}</span>
                          <Badge tone="info" className="shrink-0">
                            v{doc.version}
                          </Badge>
                        </Link>
                      </TD>
                      <TD>
                        <GenericStatusBadge status={doc.status} />
                      </TD>
                      <TD className="max-w-[14rem] truncate text-muted">
                        {doc.initiativeId ? (
                          <Link href={`/initiatives/${doc.initiativeId}`} className="hover:text-accent">
                            {doc.initiativeTitle ?? "Initiative"}
                          </Link>
                        ) : (
                          "Company"
                        )}
                      </TD>
                      <TD className="whitespace-nowrap text-muted">{doc.authorName ?? "—"}</TD>
                      <TD
                        className="whitespace-nowrap text-right text-xs text-subtle"
                        title={formatDateTime(doc.updatedAt)}
                      >
                        {relativeTime(doc.updatedAt, now)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )
          }
        </QueryView>
      </Card>
    </div>
  );
}
