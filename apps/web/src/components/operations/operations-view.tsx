"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import type { DeploymentDTO, IncidentDTO, RoutineDTO } from "@techgens/core";
import {
  CalendarClock,
  CircleCheck,
  CloudUpload,
  ExternalLink,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  Siren,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { QueryView } from "@/components/common/query-view";
import { GenericStatusBadge } from "@/components/common/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { api } from "@/lib/api";
import { describeCron, formatDateTime, humanize, relativeTime, shortSha } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { severityTone, type Tone } from "@/lib/labels";
import { useApiMutation } from "@/lib/mutations";
import { qk, useDeployments, useIncidents, useOrg, useProducts, useRoutines } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** Statuses accepted by `PATCH /api/incidents/:id`. */
type IncidentStatus = "open" | "mitigated" | "resolved";

const SEVERITIES = [
  { value: "sev1", label: "SEV1 — critical outage" },
  { value: "sev2", label: "SEV2 — major degradation" },
  { value: "sev3", label: "SEV3 — minor issue" },
  { value: "sev4", label: "SEV4 — low / cosmetic" },
];

export function OperationsView() {
  const products = useProducts();
  const productNames = new Map((products.data ?? []).map((p) => [p.id, p.name]));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations"
        description="Production health: incidents, deployments across environments, and the recurring ceremonies your agents run."
      />
      <IncidentsCard productNames={productNames} />
      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
        <DeploymentsCard productNames={productNames} />
        <RoutinesCard />
      </div>
    </div>
  );
}

function IncidentsCard({ productNames }: { productNames: Map<string, string> }) {
  const incidents = useIncidents();
  const now = useNow();
  const [createOpen, setCreateOpen] = useState(false);
  const update = useApiMutation(
    ({ id, status }: { id: string; status: IncidentStatus }) =>
      api.patch<IncidentDTO>(`/api/incidents/${id}`, { status }),
    {
      success: (_r, v) =>
        v.status === "resolved"
          ? "Incident resolved"
          : v.status === "mitigated"
            ? "Incident marked as mitigated"
            : "Incident reopened",
      errorTitle: "Couldn't update the incident",
      invalidate: [qk.incidents, qk.dashboard],
    },
  );

  return (
    <Card>
      <CardHeader
        title="Incidents"
        description="Open incidents are routed to the SRE agent automatically"
        icon={Siren}
        action={
          <Button variant="secondary" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus />
            Report incident
          </Button>
        }
      />
      <QueryView query={incidents} loading={<SkeletonRows rows={3} className="p-4" />} compactError>
        {(list) => {
          const sorted = [...list].sort(
            (a, b) =>
              Number(a.status === "resolved") - Number(b.status === "resolved") ||
              Date.parse(b.createdAt) - Date.parse(a.createdAt),
          );
          return sorted.length === 0 ? (
            <EmptyState
              compact
              icon={CircleCheck}
              title="No incidents"
              description="All systems normal. Alerts from production will open incidents here."
            />
          ) : (
            <ul className="divide-y divide-border/70">
              {sorted.map((incident) => {
                const resolved = incident.status === "resolved";
                return (
                  <li key={incident.id} className={cn("px-4 py-3", resolved && "opacity-70")}>
                    <div className="flex flex-wrap items-start gap-3">
                      <Badge tone={severityTone(incident.severity)} className="font-mono uppercase">
                        {incident.severity}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{incident.title}</p>
                          <GenericStatusBadge status={incident.status} />
                        </div>
                        <p className="mt-0.5 text-xs text-muted">
                          {incident.productId
                            ? `${productNames.get(incident.productId) ?? "Product"} · `
                            : ""}
                          {humanize(incident.source)} · opened {relativeTime(incident.createdAt, now)}
                          {incident.resolvedAt ? ` · resolved ${relativeTime(incident.resolvedAt, now)}` : ""}
                        </p>
                        {incident.details ? (
                          <details className="mt-1.5">
                            <summary className="cursor-pointer text-xs text-accent">Details</summary>
                            <pre className="mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-[#060a10] p-2 font-mono text-xs text-muted">
                              {incident.details}
                            </pre>
                          </details>
                        ) : null}
                      </div>
                      {resolved ? (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => update.mutate({ id: incident.id, status: "open" })}
                          disabled={update.isPending}
                        >
                          <RotateCcw />
                          Reopen
                        </Button>
                      ) : (
                        <div className="flex gap-1.5">
                          {incident.status !== "mitigated" ? (
                            <Button
                              variant="secondary"
                              size="xs"
                              onClick={() => update.mutate({ id: incident.id, status: "mitigated" })}
                              disabled={update.isPending}
                            >
                              <ShieldCheck />
                              Mitigated
                            </Button>
                          ) : null}
                          <Button
                            variant="success"
                            size="xs"
                            onClick={() => update.mutate({ id: incident.id, status: "resolved" })}
                            loading={
                              update.isPending &&
                              update.variables?.id === incident.id &&
                              update.variables.status === "resolved"
                            }
                            disabled={update.isPending}
                          >
                            {update.isPending &&
                            update.variables?.id === incident.id &&
                            update.variables.status === "resolved" ? null : (
                              <CircleCheck />
                            )}
                            Resolve
                          </Button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          );
        }}
      </QueryView>
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Report an incident"
        description="The SRE agent triages it and keeps you posted."
      >
        <IncidentForm onDone={() => setCreateOpen(false)} />
      </Dialog>
    </Card>
  );
}

function IncidentForm({ onDone }: { onDone: () => void }) {
  const products = useProducts();
  const [title, setTitle] = useState("");
  const [productId, setProductId] = useState("");
  const [severity, setSeverity] = useState("sev3");
  const [details, setDetails] = useState("");
  const [touched, setTouched] = useState(false);
  const create = useApiMutation(
    (body: { title: string; productId?: string; severity?: string; details?: string }) =>
      api.post<IncidentDTO>("/api/incidents", body),
    {
      success: "Incident opened",
      errorTitle: "Couldn't open the incident",
      invalidate: [qk.incidents, qk.dashboard],
      onSuccess: onDone,
    },
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (title.trim().length < 3) return;
    create.mutate({
      title: title.trim(),
      severity,
      ...(productId ? { productId } : {}),
      ...(details.trim() ? { details: details.trim() } : {}),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field
        label="Title"
        htmlFor="inc-title"
        required
        error={
          touched && title.trim().length < 3 ? "Describe the incident (at least 3 characters)" : undefined
        }
      >
        <Input
          id="inc-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Checkout returns 500 for EU customers"
          autoFocus
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Severity" htmlFor="inc-sev">
          <Select id="inc-sev" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            {SEVERITIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Product" htmlFor="inc-product">
          <Select id="inc-product" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Not product-specific</option>
            {(products.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Details" htmlFor="inc-details" hint="Symptoms, impact, links to logs or dashboards.">
        <Textarea id="inc-details" rows={4} value={details} onChange={(e) => setDetails(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" loading={create.isPending}>
          Open incident
        </Button>
      </div>
    </form>
  );
}

/** Environments are facts, not states: production gets the informational blue, everything else stays neutral. */
function environmentTone(env: string): Tone {
  return env.toLowerCase().startsWith("prod") ? "info" : "neutral";
}

function DeploymentsCard({ productNames }: { productNames: Map<string, string> }) {
  const deployments = useDeployments();
  const now = useNow();
  return (
    <Card className="min-w-0">
      <CardHeader
        title="Deployments"
        description="GitHub Actions deployments to Azure Container Apps"
        icon={CloudUpload}
      />
      <QueryView query={deployments} loading={<SkeletonRows rows={4} className="p-4" />} compactError>
        {(list: DeploymentDTO[]) =>
          list.length === 0 ? (
            <EmptyState
              compact
              icon={CloudUpload}
              title="No deployments yet"
              description="Staging deploys run on every merge; production needs your approval."
            />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Environment</TH>
                  <TH>Status</TH>
                  <TH>Product</TH>
                  <TH>Commit</TH>
                  <TH className="text-right">Updated</TH>
                  <TH>
                    <span className="sr-only">Run</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {[...list]
                  .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
                  .map((d) => (
                    <TR key={d.id}>
                      <TD>
                        <Badge tone={environmentTone(d.environment)}>{d.environment}</Badge>
                      </TD>
                      <TD>
                        <GenericStatusBadge status={d.status} />
                      </TD>
                      <TD className="text-muted">
                        {d.productId ? (productNames.get(d.productId) ?? "—") : "—"}
                      </TD>
                      <TD className="font-mono text-xs">{shortSha(d.sha)}</TD>
                      <TD
                        className="whitespace-nowrap text-right text-xs text-subtle"
                        title={formatDateTime(d.updatedAt)}
                      >
                        {relativeTime(d.updatedAt, now)}
                      </TD>
                      <TD className="text-right">
                        {d.runUrl ? (
                          <a
                            href={d.runUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                          >
                            Run <ExternalLink aria-hidden className="size-3" />
                          </a>
                        ) : null}
                      </TD>
                    </TR>
                  ))}
              </TBody>
            </Table>
          )
        }
      </QueryView>
    </Card>
  );
}

function RoutinesCard() {
  const routines = useRoutines();
  const org = useOrg();
  const now = useNow();
  const [editing, setEditing] = useState<RoutineDTO | null>(null);
  const roleTitles = new Map((org.data?.roles ?? []).map((r) => [r.id, r.title]));

  const toggle = useApiMutation(
    ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch<RoutineDTO>(`/api/routines/${id}`, { enabled }),
    {
      success: (r) => `${r.title} ${r.enabled ? "enabled" : "disabled"}`,
      errorTitle: "Couldn't update the routine",
      invalidate: [qk.routines],
    },
  );
  const run = useApiMutation((id: string) => api.post<{ jobId: string }>(`/api/routines/${id}/run`), {
    success: "Routine started",
    errorTitle: "Couldn't start the routine",
    invalidate: [qk.routines, ["jobs"]],
  });

  return (
    <Card className="min-w-0">
      <CardHeader
        title="Routines"
        description="Recurring ceremonies: stand-ups, reviews, executive reports"
        icon={CalendarClock}
      />
      <QueryView query={routines} loading={<SkeletonRows rows={4} className="p-4" />} compactError>
        {(list) =>
          list.length === 0 ? (
            <EmptyState
              compact
              icon={CalendarClock}
              title="No routines"
              description="Routines are seeded by the orchestrator (e.g. daily stand-up, weekly CEO report)."
            />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Routine</TH>
                  <TH>Schedule</TH>
                  <TH>Last run</TH>
                  <TH>Enabled</TH>
                  <TH>
                    <span className="sr-only">Actions</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {list.map((routine) => {
                  const running = run.isPending && run.variables === routine.id;
                  return (
                    <TR key={routine.id}>
                      <TD>
                        <p className="font-medium">{routine.title}</p>
                        <p className="text-xs text-muted">
                          {roleTitles.get(routine.roleId) ?? humanize(routine.roleId)}
                        </p>
                      </TD>
                      <TD>
                        <p className="text-sm">{describeCron(routine.cron)}</p>
                        <p className="font-mono text-[11px] text-subtle">{routine.cron}</p>
                      </TD>
                      <TD className="whitespace-nowrap text-xs text-muted">
                        {routine.lastRunAt ? relativeTime(routine.lastRunAt, now) : "Never"}
                      </TD>
                      <TD>
                        <Switch
                          checked={routine.enabled}
                          label={`Run ${routine.title} on schedule`}
                          disabled={toggle.isPending}
                          onCheckedChange={(enabled) => toggle.mutate({ id: routine.id, enabled })}
                        />
                      </TD>
                      <TD className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Edit schedule of ${routine.title}`}
                            onClick={() => setEditing(routine)}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => run.mutate(routine.id)}
                            loading={running}
                          >
                            {running ? null : <Play />}
                            Run now
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )
        }
      </QueryView>
      {run.data?.jobId ? (
        <p className="border-t border-border px-4 py-2 text-xs text-muted">
          Routine started —{" "}
          <Link href={`/activity/jobs/${run.data.jobId}`} className="text-accent hover:underline">
            follow the job transcript
          </Link>
        </p>
      ) : null}
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit schedule"
        size="sm"
        description={editing?.title}
      >
        {editing ? <CronForm routine={editing} onDone={() => setEditing(null)} /> : null}
      </Dialog>
    </Card>
  );
}

function CronForm({ routine, onDone }: { routine: RoutineDTO; onDone: () => void }) {
  const [cron, setCron] = useState(routine.cron);
  const valid = cron.trim().split(/\s+/).length === 5;
  const save = useApiMutation(
    (value: string) => api.patch<RoutineDTO>(`/api/routines/${routine.id}`, { cron: value }),
    {
      success: "Schedule updated",
      errorTitle: "Couldn't update the schedule",
      invalidate: [qk.routines],
      onSuccess: onDone,
    },
  );
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save.mutate(cron.trim());
      }}
    >
      <Field
        label="Cron expression"
        htmlFor="cron"
        hint={valid ? describeCron(cron.trim()) : undefined}
        error={!valid ? "Expected five fields: minute hour day-of-month month day-of-week (UTC)" : undefined}
      >
        <Input
          id="cron"
          value={cron}
          onChange={(e) => setCron(e.target.value)}
          className="font-mono"
          autoFocus
        />
      </Field>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!valid} loading={save.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}
