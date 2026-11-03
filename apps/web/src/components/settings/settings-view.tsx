"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ApprovalKind, RoleDTO, SettingsDTO } from "@techgens/core";
import { APPROVAL_KINDS, GATE_LABELS } from "@techgens/core";
import { Cpu, Gauge, Info, Plug, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { QueryView } from "@/components/common/query-view";
import { DepartmentBadge } from "@/components/common/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/input";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { api, API_URL } from "@/lib/api";
import { useQueryParams } from "@/lib/hooks";
import { GATE_DESCRIPTIONS, GATE_OFF_CONSEQUENCES } from "@/lib/labels";
import { useApiMutation } from "@/lib/mutations";
import { qk, useModels, useOrg, useSettings, useSystem } from "@/lib/queries";
import { GithubConnection } from "./github-connection";

type SettingsPatch = Partial<Omit<SettingsDTO, "github" | "mcpServers">>;

/** Bounds enforced by `PUT /api/settings`. */
const MAX_DELEGATION_DEPTH = 8;
const MAX_CONCURRENT_JOBS = 20;

function useSaveSettings(successMessage?: string) {
  const queryClient = useQueryClient();
  return useApiMutation((patch: SettingsPatch) => api.put<SettingsDTO>("/api/settings", patch), {
    ...(successMessage ? { success: successMessage } : {}),
    errorTitle: "Couldn't save settings",
    onSuccess: (result) => queryClient.setQueryData(qk.settings, result),
    onError: () => void queryClient.invalidateQueries({ queryKey: qk.settings }),
  });
}

export function SettingsView() {
  const settings = useSettings();
  const system = useSystem();
  const { get, set } = useQueryParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const handled = useRef(false);
  const githubParam = get("github");

  useEffect(() => {
    if (!githubParam || handled.current) return;
    handled.current = true;
    if (githubParam === "connected") {
      toast.success(
        "GitHub connected",
        "Agents can now work with your repositories, issues and pull requests.",
      );
    } else {
      toast.error("GitHub connection failed", get("message") ?? "The GitHub App setup did not complete.");
    }
    void queryClient.invalidateQueries({ queryKey: qk.settings });
    void queryClient.invalidateQueries({ queryKey: qk.system });
    set({ github: null, message: null });
  }, [githubParam, get, set, toast, queryClient]);

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Connections, governance gates, models and operating limits for your AI company."
      />
      <QueryView query={settings} loading={<PageSkeleton />}>
        {(data) => (
          <div className="space-y-6">
            <GithubConnection settings={data} system={system.data} />
            <div className="grid gap-6 2xl:grid-cols-2">
              <GatePolicyCard settings={data} />
              <LimitsCard settings={data} />
            </div>
            <RoleModelsCard settings={data} />
            <McpServersCard settings={data} />
            <SystemCard />
          </div>
        )}
      </QueryView>
    </div>
  );
}

function GatePolicyCard({ settings }: { settings: SettingsDTO }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const save = useSaveSettings();
  const [confirmOff, setConfirmOff] = useState<ApprovalKind | null>(null);
  const offCount = APPROVAL_KINDS.filter((kind) => settings.gatePolicy[kind] === false).length;

  function apply(kind: ApprovalKind, enabled: boolean) {
    const gatePolicy = { ...settings.gatePolicy, [kind]: enabled };
    queryClient.setQueryData<SettingsDTO>(qk.settings, (s) => (s ? { ...s, gatePolicy } : s));
    save.mutate(
      { gatePolicy },
      {
        onSuccess: () => {
          setConfirmOff(null);
          if (enabled) {
            toast.success(`${GATE_LABELS[kind]} gate turned on`, "Agents will ask for your approval again.");
          } else {
            toast.info(`${GATE_LABELS[kind]} gate turned off`, GATE_OFF_CONSEQUENCES[kind]);
          }
        },
      },
    );
  }

  // Turning a gate off removes CEO oversight, so it needs an explicit confirmation; turning one on doesn't.
  function toggle(kind: ApprovalKind, enabled: boolean) {
    if (enabled) apply(kind, true);
    else setConfirmOff(kind);
  }

  return (
    <Card id="approval-gates" className="scroll-mt-24">
      <CardHeader
        title="Approval gates"
        description="Which decisions need the CEO. Disabled gates are auto-approved and logged in the decision log."
        icon={ShieldCheck}
        action={
          offCount > 0 ? (
            <Badge tone="warning">
              {offCount} {offCount === 1 ? "gate" : "gates"} off
            </Badge>
          ) : null
        }
      />
      <ul className="divide-y divide-border/70">
        {APPROVAL_KINDS.map((kind) => {
          const enabled = settings.gatePolicy[kind] ?? true;
          const id = `gate-${kind}`;
          return (
            <li key={kind} className="flex items-start gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <label htmlFor={id} className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {GATE_LABELS[kind]}
                  {!enabled ? <Badge tone="warning">Auto-approved</Badge> : null}
                </label>
                <p id={`${id}-desc`} className="mt-0.5 text-xs text-muted">
                  {GATE_DESCRIPTIONS[kind]}
                </p>
              </div>
              <Switch
                id={id}
                label={`Require approval: ${GATE_LABELS[kind]}`}
                checked={enabled}
                onCheckedChange={(value) => toggle(kind, value)}
                aria-describedby={`${id}-desc`}
              />
            </li>
          );
        })}
      </ul>
      <Dialog
        open={confirmOff !== null}
        onClose={() => setConfirmOff(null)}
        title={confirmOff ? `Turn off the ${GATE_LABELS[confirmOff]} gate?` : ""}
        description={confirmOff ? GATE_OFF_CONSEQUENCES[confirmOff] : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOff(null)} data-autofocus>
              Keep asking me
            </Button>
            <Button
              variant="danger"
              onClick={() => (confirmOff ? apply(confirmOff, false) : undefined)}
              loading={save.isPending}
            >
              Turn off gate
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          These requests will be auto-approved and recorded in the decision log. You can turn the gate back on
          at any time.
        </p>
      </Dialog>
    </Card>
  );
}

function LimitsCard({ settings }: { settings: SettingsDTO }) {
  const [depth, setDepth] = useState(String(settings.maxDelegationDepth));
  const [concurrent, setConcurrent] = useState(String(settings.maxConcurrentJobs));
  const [autoMerge, setAutoMerge] = useState(settings.autoMergeToIntegration);
  const save = useSaveSettings("Limits saved");

  const depthNum = Number(depth);
  const concurrentNum = Number(concurrent);
  const depthError =
    !Number.isInteger(depthNum) || depthNum < 1 || depthNum > MAX_DELEGATION_DEPTH
      ? `Whole number between 1 and ${MAX_DELEGATION_DEPTH}`
      : undefined;
  const concurrentError =
    !Number.isInteger(concurrentNum) || concurrentNum < 1 || concurrentNum > MAX_CONCURRENT_JOBS
      ? `Whole number between 1 and ${MAX_CONCURRENT_JOBS}`
      : undefined;
  const dirty =
    depthNum !== settings.maxDelegationDepth ||
    concurrentNum !== settings.maxConcurrentJobs ||
    autoMerge !== settings.autoMergeToIntegration;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (depthError || concurrentError) return;
    save.mutate({
      maxDelegationDepth: depthNum,
      maxConcurrentJobs: concurrentNum,
      autoMergeToIntegration: autoMerge,
    });
  }

  return (
    <Card>
      <CardHeader
        title="Operating limits"
        description="Guardrails for how much work agents can fan out at once."
        icon={Gauge}
      />
      <form onSubmit={submit}>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Max delegation depth"
              htmlFor="max-depth"
              error={depthError}
              hint="How many levels agents may delegate (CEO → Chief of Staff → CTO → …)."
            >
              <Input
                id="max-depth"
                type="number"
                min={1}
                max={MAX_DELEGATION_DEPTH}
                value={depth}
                onChange={(e) => setDepth(e.target.value)}
              />
            </Field>
            <Field
              label="Max concurrent jobs"
              htmlFor="max-jobs"
              error={concurrentError}
              hint="Agent sessions running in parallel."
            >
              <Input
                id="max-jobs"
                type="number"
                min={1}
                max={MAX_CONCURRENT_JOBS}
                value={concurrent}
                onChange={(e) => setConcurrent(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex items-start gap-4 rounded-lg border border-border bg-surface-2/40 p-3">
            <div className="min-w-0 flex-1">
              <label htmlFor="auto-merge" className="text-sm font-medium">
                Auto-merge to integration branch
              </label>
              <p id="auto-merge-desc" className="mt-0.5 text-xs text-muted">
                Let the engineering manager merge reviewed, green pull requests into the integration branch
                without asking you. Merging to main always follows the “Merge to main” gate.
              </p>
            </div>
            <Switch
              id="auto-merge"
              checked={autoMerge}
              onCheckedChange={setAutoMerge}
              aria-describedby="auto-merge-desc"
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!dirty || Boolean(depthError || concurrentError)}
              loading={save.isPending}
            >
              Save limits
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}

function RoleModelsCard({ settings }: { settings: SettingsDTO }) {
  const org = useOrg();
  const models = useModels();
  const queryClient = useQueryClient();
  const save = useSaveSettings("Model updated");

  function change(role: RoleDTO, model: string) {
    const roleModels = { ...settings.roleModels };
    if (model) roleModels[role.id] = model;
    else delete roleModels[role.id];
    queryClient.setQueryData<SettingsDTO>(qk.settings, (s) => (s ? { ...s, roleModels } : s));
    save.mutate({ roleModels });
  }

  return (
    <Card>
      <CardHeader
        title="Models per role"
        description="Choose the Copilot model each role runs on. Premium models cost more credits per request (multiplier)."
        icon={Cpu}
      />
      <QueryView query={org} compactError>
        {(data) => {
          const roles = [...data.roles].sort(
            (a, b) => a.department.localeCompare(b.department) || a.title.localeCompare(b.title),
          );
          const options = models.data ?? [];
          return (
            <Table>
              <THead>
                <tr>
                  <TH>Role</TH>
                  <TH>Department</TH>
                  <TH>Role default</TH>
                  <TH className="w-80">Model</TH>
                </tr>
              </THead>
              <TBody>
                {roles.map((role) => {
                  const current = settings.roleModels[role.id] ?? "";
                  const id = `model-${role.id}`;
                  return (
                    <TR key={role.id}>
                      <TD>
                        <label htmlFor={id} className="font-medium">
                          {role.title}
                        </label>
                      </TD>
                      <TD>
                        <DepartmentBadge department={role.department} />
                      </TD>
                      <TD className="font-mono text-xs text-muted">{role.definition.model ?? "auto"}</TD>
                      <TD>
                        <Select
                          id={id}
                          value={current}
                          onChange={(e) => change(role, e.target.value)}
                          disabled={save.isPending && save.variables?.roleModels !== undefined}
                        >
                          <option value="">Role default ({role.definition.model ?? "auto"})</option>
                          {options.map((m) => (
                            <option key={m.id} value={m.id} disabled={!m.enabled}>
                              {m.name}
                              {m.multiplier !== undefined ? ` · ×${m.multiplier}` : ""}
                              {m.enabled ? "" : " (not enabled)"}
                            </option>
                          ))}
                          {current && !options.some((m) => m.id === current) ? (
                            <option value={current}>{current}</option>
                          ) : null}
                        </Select>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          );
        }}
      </QueryView>
      {models.isError ? (
        <p className="border-t border-border px-4 py-2 text-xs text-amber-200">
          Couldn&apos;t load the model list from the Copilot runtime.
        </p>
      ) : null}
    </Card>
  );
}

function McpServersCard({ settings }: { settings: SettingsDTO }) {
  const org = useOrg();
  const servers = Object.entries(settings.mcpServers ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const rolesUsing = (key: string) =>
    (org.data?.roles ?? []).filter((role) => role.definition.mcp?.includes(key)).map((role) => role.title);

  return (
    <Card>
      <CardHeader
        title="MCP servers available to agents"
        description="Model Context Protocol servers whose tools agents can call. Roles opt in by listing a server key in their definition; secrets are never shown."
        icon={Plug}
        action={<Badge>Read-only</Badge>}
      />
      {servers.length === 0 ? (
        <EmptyState
          compact
          icon={Plug}
          title="No MCP servers configured"
          description="Agents only use Techgens' built-in tools. Servers are configured on the orchestrator (mcpServers in PUT /api/settings)."
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Server</TH>
              <TH>Command</TH>
              <TH>Tools</TH>
              <TH>Used by</TH>
            </tr>
          </THead>
          <TBody>
            {servers.map(([key, server]) => {
              const roles = rolesUsing(key);
              return (
                <TR key={key}>
                  <TD className="whitespace-nowrap font-mono text-xs font-medium">{key}</TD>
                  <TD className="max-w-xs">
                    <code
                      className="block truncate font-mono text-xs text-muted"
                      title={[server.command, ...(server.args ?? [])].join(" ")}
                    >
                      {[server.command, ...(server.args ?? [])].join(" ")}
                    </code>
                  </TD>
                  <TD>
                    <ul className="flex flex-wrap gap-1" aria-label={`Tools of ${key}`}>
                      {(server.tools ?? []).map((tool) => (
                        <li
                          key={tool}
                          className="rounded border border-violet-400/30 bg-violet-400/10 px-1.5 py-0.5 font-mono text-[11px] text-violet-200"
                        >
                          {tool}
                        </li>
                      ))}
                    </ul>
                  </TD>
                  <TD className="text-xs text-muted">
                    {roles.length > 0 ? roles.join(", ") : <span className="text-subtle">No roles yet</span>}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </Card>
  );
}

function SystemCard() {
  const system = useSystem();
  const data = system.data;
  return (
    <Card>
      <CardHeader title="System" description="Orchestrator and runtime status" icon={Info} />
      <CardContent>
        <dl className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <Item label="Orchestrator">
            {API_URL ? <span className="font-mono text-xs">{API_URL}</span> : "Same origin (/api)"}
          </Item>
          <Item label="Version">{data?.version ?? "—"}</Item>
          <Item label="Agent runtime">
            {data ? (
              <span className="flex flex-wrap items-center gap-1.5">
                {data.runtime.kind === "copilot" ? "GitHub Copilot SDK" : "Simulated (demo)"}
                <Badge tone={data.runtime.ready ? "success" : "danger"} dot>
                  {data.runtime.ready ? "Ready" : "Not ready"}
                </Badge>
              </span>
            ) : (
              "—"
            )}
          </Item>
          <Item label="Copilot sign-in">
            {data
              ? data.runtime.authenticated
                ? `Signed in${data.runtime.login ? ` as ${data.runtime.login}` : ""}`
                : "Not signed in"
              : "—"}
          </Item>
          {data?.runtime.message ? (
            <Item label="Runtime message" wide>
              {data.runtime.message}
            </Item>
          ) : null}
          <Item label="Kill switch">
            {data ? (data.paused ? "All agents paused" : "Agents running") : "—"}
          </Item>
          <Item label="Onboarding">{data ? (data.onboarded ? "Complete" : "Not completed") : "—"}</Item>
        </dl>
      </CardContent>
    </Card>
  );
}

function Item({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-[11px] uppercase tracking-wide text-subtle">{label}</dt>
      <dd className="mt-0.5 text-fg">{children}</dd>
    </div>
  );
}
