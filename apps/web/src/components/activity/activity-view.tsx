"use client";

import { useState } from "react";
import type { LiveEvent } from "@techgens/core";
import { Activity, History, Pause, Play } from "lucide-react";
import { ActivityFeed } from "@/components/common/activity-feed";
import { PageHeader } from "@/components/common/page-header";
import { QueryView } from "@/components/common/query-view";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { eventString, mergeEvents, useLiveEvents } from "@/lib/events";
import { useQueryParams } from "@/lib/hooks";
import { useEvents, useOrg } from "@/lib/queries";
import { EVENT_CATEGORIES, matchesTypeFilter, typesInCategory } from "./event-filters";
import { JobsPanel } from "./jobs-panel";

const PAGE = 100;

export function ActivityView() {
  const { get, set } = useQueryParams();
  const typeFilter = get("type") ?? "";
  const agentFilter = get("agent") ?? "";
  const jobStatus = get("jobStatus") ?? "";
  const jobAgent = get("jobAgent") ?? "";

  return (
    <div>
      <PageHeader
        title="Activity & jobs"
        description="Everything your company does, as it happens: directives, delegations, tool calls, approvals, documents and spend."
      />
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card className="flex min-h-0 flex-col">
          <EventFeedPanel typeFilter={typeFilter} agentFilter={agentFilter} onChange={set} />
        </Card>
        <Card className="min-w-0 self-start">
          <JobsPanel status={jobStatus} agentId={jobAgent} onChange={set} />
        </Card>
      </div>
    </div>
  );
}

function EventFeedPanel({
  typeFilter,
  agentFilter,
  onChange,
}: {
  typeFilter: string;
  agentFilter: string;
  onChange: (updates: Record<string, string | null>) => void;
}) {
  const live = useLiveEvents();
  const fetched = useEvents({ limit: PAGE });
  const org = useOrg();
  const toast = useToast();
  const [older, setOlder] = useState<LiveEvent[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [frozen, setFrozen] = useState<LiveEvent[] | null>(null);

  const merged = mergeEvents(live.events, [...(fetched.data ?? []), ...older], 2_000);
  const source = frozen ?? merged;
  const visible = source.filter(
    (e) =>
      matchesTypeFilter(e.type, typeFilter) &&
      (!agentFilter || e.actorId === agentFilter || eventString(e, "agentId") === agentFilter),
  );
  const oldest = merged[merged.length - 1];
  const canLoadOlder = !exhausted && oldest !== undefined && /^\d+$/.test(oldest.id);

  async function loadOlder() {
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const page = await api.get<LiveEvent[]>("/api/events", { limit: PAGE, before: oldest.id });
      setOlder((list) => [...list, ...page]);
      if (page.length < PAGE) setExhausted(true);
    } catch (error) {
      toast.error("Couldn't load older events", errorMessage(error));
    } finally {
      setLoadingOlder(false);
    }
  }

  return (
    <>
      <CardHeader
        title="Live event feed"
        description={
          live.status === "open" ? "Streaming live" : "Live stream disconnected — showing stored events"
        }
        icon={Activity}
        action={
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setFrozen(frozen ? null : merged)}
            aria-pressed={frozen !== null}
            title={frozen ? "Resume live updates" : "Freeze the feed while you read"}
          >
            {frozen ? <Play /> : <Pause />}
            {frozen ? "Resume" : "Freeze"}
          </Button>
        }
      />
      <div className="grid gap-2 border-b border-border px-4 py-3 sm:grid-cols-2">
        <div>
          <label htmlFor="event-type" className="sr-only">
            Event type
          </label>
          <Select
            id="event-type"
            value={typeFilter}
            onChange={(e) => onChange({ type: e.target.value || null })}
          >
            <option value="">All event types</option>
            {EVENT_CATEGORIES.map((category) => (
              <optgroup key={category.id} label={category.label}>
                <option value={`cat:${category.id}`}>All {category.label.toLowerCase()}</option>
                {typesInCategory(category).map((type) => (
                  <option key={type} value={`type:${type}`}>
                    {type}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="event-agent" className="sr-only">
            Agent
          </label>
          <Select
            id="event-agent"
            value={agentFilter}
            onChange={(e) => onChange({ agent: e.target.value || null })}
          >
            <option value="">All actors</option>
            {[...(org.data?.agents ?? [])]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — {a.roleTitle}
                </option>
              ))}
          </Select>
        </div>
      </div>
      <div className="max-h-[calc(100dvh-17rem)] min-h-64 overflow-y-auto">
        <QueryView query={fetched} loading={<SkeletonRows rows={8} className="p-4" />} compactError>
          {() => (
            <>
              <ActivityFeed
                events={visible}
                emptyTitle={typeFilter || agentFilter ? "No matching events" : "No activity yet"}
                emptyDescription={
                  typeFilter || agentFilter
                    ? "Try a broader filter."
                    : "Events stream in here as soon as agents start working."
                }
              />
              {canLoadOlder && !frozen ? (
                <div className="border-t border-border p-3 text-center">
                  <Button variant="ghost" size="sm" onClick={() => void loadOlder()} loading={loadingOlder}>
                    {loadingOlder ? null : <History />}
                    Load older events
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </QueryView>
      </div>
    </>
  );
}
