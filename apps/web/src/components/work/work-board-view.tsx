"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { WorkItemDTO, WorkItemKind, WorkItemStatus } from "@techgens/core";
import { WORK_ITEM_KINDS } from "@techgens/core";
import { Columns3, List, Plus, Search, SquareKanban } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { QueryView } from "@/components/common/query-view";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { humanize } from "@/lib/format";
import { useQueryParams } from "@/lib/hooks";
import { WORK_STATUS_LABEL } from "@/lib/labels";
import { qk, useInitiatives, useOrg, useWorkItems, type WorkItemFilters } from "@/lib/queries";
import { BOARD_COLUMNS, KanbanBoard } from "./kanban";
import { NewTaskDialog } from "./new-task-dialog";
import { WorkItemSheet } from "./work-item-sheet";
import { WorkItemsTable } from "./work-items-table";

type View = "board" | "list";

export function WorkBoardView() {
  const { get, set } = useQueryParams();
  const view = (get("view") as View | null) ?? "board";
  const itemId = get("item");
  const filters: WorkItemFilters = {
    initiativeId: get("initiative") ?? undefined,
    kind: get("kind") ?? undefined,
    assigneeAgentId: get("assignee") ?? undefined,
  };
  const [search, setSearch] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();

  const query = useWorkItems(filters);
  const initiatives = useInitiatives();
  const org = useOrg();
  const initiativeTitles = new Map((initiatives.data ?? []).map((i) => [i.id, i.title]));

  async function move(id: string, status: WorkItemStatus) {
    const key = qk.workItems(filters);
    const previous = queryClient.getQueryData<WorkItemDTO[]>(key);
    queryClient.setQueryData<WorkItemDTO[]>(key, (list) =>
      list?.map((i) => (i.id === id ? { ...i, status } : i)),
    );
    try {
      await api.patch<WorkItemDTO>(`/api/work-items/${id}`, { status });
      toast.success(`Moved to ${WORK_STATUS_LABEL[status]}`);
    } catch (error) {
      queryClient.setQueryData(key, previous);
      toast.error("Couldn't move the work item", errorMessage(error));
    } finally {
      void queryClient.invalidateQueries({ queryKey: ["work-items"] });
      void queryClient.invalidateQueries({ queryKey: ["initiatives"] });
    }
  }

  const filterItems = (items: readonly WorkItemDTO[]) => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (!showCancelled && i.status === "cancelled") return false;
      if (!q) return true;
      return i.title.toLowerCase().includes(q) || (i.assigneeName ?? "").toLowerCase().includes(q);
    });
  };

  const hasFilters = Boolean(filters.initiativeId || filters.kind || filters.assigneeAgentId || search);

  return (
    <div>
      <PageHeader
        title="Work board"
        description="Epics, stories, tasks and bugs across all initiatives. Drag cards between columns or open one for details."
        actions={
          <>
            <Segmented
              label="Work view"
              value={view}
              onChange={(v) => set({ view: v === "board" ? null : v })}
              options={[
                {
                  value: "board",
                  label: (
                    <>
                      <Columns3 aria-hidden /> Board
                    </>
                  ),
                },
                {
                  value: "list",
                  label: (
                    <>
                      <List aria-hidden /> List
                    </>
                  ),
                },
              ]}
            />
            <Button variant="primary" size="sm" onClick={() => setNewOpen(true)}>
              <Plus />
              New task
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:flex xl:items-center">
        <div className="relative xl:w-64">
          <label htmlFor="work-search" className="sr-only">
            Search work items
          </label>
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
          />
          <Input
            id="work-search"
            type="search"
            className="pl-9"
            placeholder="Search title or assignee…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="work-initiative" className="sr-only">
            Initiative
          </label>
          <Select
            id="work-initiative"
            className="xl:w-60"
            value={filters.initiativeId ?? ""}
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
        <div>
          <label htmlFor="work-kind" className="sr-only">
            Kind
          </label>
          <Select
            id="work-kind"
            className="xl:w-40"
            value={filters.kind ?? ""}
            onChange={(e) => set({ kind: e.target.value || null })}
          >
            <option value="">All kinds</option>
            {WORK_ITEM_KINDS.map((k: WorkItemKind) => (
              <option key={k} value={k}>
                {humanize(k)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="work-assignee" className="sr-only">
            Assignee
          </label>
          <Select
            id="work-assignee"
            className="xl:w-52"
            value={filters.assigneeAgentId ?? ""}
            onChange={(e) => set({ assignee: e.target.value || null })}
          >
            <option value="">All assignees</option>
            {[...(org.data?.agents ?? [])]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — {a.roleTitle}
                </option>
              ))}
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted xl:ml-auto">
          <Switch checked={showCancelled} onCheckedChange={setShowCancelled} label="Show cancelled items" />
          Show cancelled
        </label>
      </div>

      <QueryView
        query={query}
        loading={
          <div className="flex gap-3 overflow-hidden">
            {BOARD_COLUMNS.map((c) => (
              <Skeleton key={c} className="h-96 w-72 shrink-0 rounded-xl" />
            ))}
          </div>
        }
      >
        {(all) => {
          const items = filterItems(all);
          if (all.length === 0 && !hasFilters) {
            return (
              <Card>
                <EmptyState
                  icon={SquareKanban}
                  title="The board is empty"
                  description="Work items appear as soon as agents break initiatives into epics, stories and tasks — or create one yourself."
                  action={
                    <Button variant="primary" size="sm" onClick={() => setNewOpen(true)}>
                      <Plus />
                      New task
                    </Button>
                  }
                />
              </Card>
            );
          }
          return view === "board" ? (
            <KanbanBoard
              items={items}
              initiativeTitles={filters.initiativeId ? undefined : initiativeTitles}
              columns={showCancelled ? [...BOARD_COLUMNS, "cancelled"] : BOARD_COLUMNS}
              onOpen={(id) => set({ item: id })}
              onMove={(id, status) => void move(id, status)}
            />
          ) : (
            <Card>
              <WorkItemsTable
                items={items}
                onOpen={(id) => set({ item: id })}
                emptyDescription="No work items match these filters."
              />
            </Card>
          );
        }}
      </QueryView>

      <WorkItemSheet id={itemId} onClose={() => set({ item: null })} onOpenItem={(id) => set({ item: id })} />
      <NewTaskDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        defaultInitiativeId={filters.initiativeId}
        onCreated={(item) => set({ item: item.id })}
      />
    </div>
  );
}
