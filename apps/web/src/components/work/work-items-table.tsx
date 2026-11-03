"use client";

import type { WorkItemDTO } from "@techgens/core";
import { ListChecks } from "lucide-react";
import { stageShortTitle } from "@/components/common/stages";
import { CodingStatusBadge, PriorityBadge, WorkStatusBadge } from "@/components/common/status";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { relativeTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { GithubLinks, WorkKindIcon } from "./work-item-bits";

export function WorkItemsTable({
  items,
  onOpen,
  showStage = true,
  emptyDescription = "Agents create epics, stories and tasks as initiatives move through planning.",
}: {
  items: readonly WorkItemDTO[];
  onOpen: (id: string) => void;
  showStage?: boolean;
  emptyDescription?: string;
}) {
  const now = useNow();
  if (items.length === 0) {
    return <EmptyState compact icon={ListChecks} title="No work items" description={emptyDescription} />;
  }
  return (
    <Table>
      <THead>
        <tr>
          <TH>Title</TH>
          <TH>Status</TH>
          <TH>Priority</TH>
          <TH>Assignee</TH>
          {showStage ? <TH>Stage</TH> : null}
          <TH>GitHub</TH>
          <TH className="text-right">Updated</TH>
        </tr>
      </THead>
      <TBody>
        {items.map((item) => (
          <TR key={item.id} className="cursor-pointer" onClick={() => onOpen(item.id)}>
            <TD className="max-w-[28rem]">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpen(item.id);
                }}
                className="flex min-w-0 items-center gap-2 text-left hover:text-accent"
              >
                <WorkKindIcon kind={item.kind} />
                <span className="truncate font-medium">{item.title}</span>
              </button>
            </TD>
            <TD>
              <WorkStatusBadge status={item.status} />
            </TD>
            <TD>
              <PriorityBadge priority={item.priority} />
            </TD>
            <TD className="whitespace-nowrap text-muted">{item.assigneeName ?? "Unassigned"}</TD>
            {showStage ? (
              <TD className="whitespace-nowrap text-muted">
                {item.stage ? stageShortTitle(item.stage) : "—"}
              </TD>
            ) : null}
            <TD>
              <div className="flex flex-wrap items-center gap-2">
                <GithubLinks item={item} />
                <CodingStatusBadge status={item.codingStatus} />
              </div>
            </TD>
            <TD className="whitespace-nowrap text-right text-xs text-subtle">
              {relativeTime(item.updatedAt, now)}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
