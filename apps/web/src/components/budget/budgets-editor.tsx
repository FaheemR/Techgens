"use client";

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { BudgetDTO, BudgetPeriod, BudgetScope } from "@techgens/core";
import { BUDGET_PERIODS, BUDGET_SCOPES, DEPARTMENTS } from "@techgens/core";
import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { QueryView } from "@/components/common/query-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { api } from "@/lib/api";
import { credits, formatDateTime, humanize } from "@/lib/format";
import { departmentStyle } from "@/lib/labels";
import { useApiMutation } from "@/lib/mutations";
import { qk, useBudgets, useInitiatives, useOrg, useProducts } from "@/lib/queries";

export interface BudgetUpsert {
  scope: BudgetScope;
  scopeId: string | null;
  period: BudgetPeriod;
  limitCredits: number;
  warnPct?: number;
  enabled?: boolean;
}

const PERIOD_LABEL: Record<BudgetPeriod, string> = {
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
  total: "Total",
};
const STATE_TONE = { ok: "success", warn: "warning", exceeded: "danger" } as const;

/** "Company monthly budget" — names row actions; a scope can have one budget per period. */
function budgetName(budget: BudgetDTO): string {
  return `${budget.scopeLabel} ${PERIOD_LABEL[budget.period].toLowerCase()} budget`;
}

function toUpsert(budget: BudgetDTO, patch: Partial<BudgetUpsert> = {}): BudgetUpsert {
  return {
    scope: budget.scope,
    scopeId: budget.scopeId,
    period: budget.period,
    limitCredits: budget.limitCredits,
    warnPct: budget.warnPct,
    enabled: budget.enabled,
    ...patch,
  };
}

export function useUpsertBudgets(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useApiMutation((items: BudgetUpsert[]) => api.put<BudgetDTO[]>("/api/budgets", items), {
    success: "Budget saved",
    errorTitle: "Couldn't save the budget",
    invalidate: [["usage"], qk.dashboard, qk.org],
    onSuccess: () => {
      // The response may contain only the upserted rows, so refetch the full list instead of replacing it.
      void queryClient.invalidateQueries({ queryKey: qk.budgets });
      onSuccess?.();
    },
  });
}

type Editing = { mode: "create" } | { mode: "edit"; budget: BudgetDTO } | null;

export function BudgetsEditor() {
  const budgets = useBudgets();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<BudgetDTO | null>(null);
  const upsert = useUpsertBudgets();
  const remove = useApiMutation((id: string) => api.del(`/api/budgets/${id}`), {
    success: "Budget removed",
    errorTitle: "Couldn't remove the budget",
    invalidate: [qk.budgets, ["usage"], qk.dashboard],
    onSuccess: () => setDeleting(null),
  });

  return (
    <Card>
      <CardHeader
        title="Budgets & limits"
        description="Spending caps per company, department, agent, product or initiative. Agents pause and ask you when a cap is hit."
        icon={ShieldCheck}
        action={
          <Button variant="primary" size="sm" onClick={() => setEditing({ mode: "create" })}>
            <Plus />
            Add budget
          </Button>
        }
      />
      <QueryView query={budgets} loading={<SkeletonRows rows={4} className="p-4" />} compactError>
        {(list) =>
          list.length === 0 ? (
            <EmptyState
              compact
              icon={ShieldCheck}
              title="No budgets configured"
              description="Start with a monthly company budget so spend can never run away."
              action={
                <Button variant="primary" size="sm" onClick={() => setEditing({ mode: "create" })}>
                  <Plus />
                  Add budget
                </Button>
              }
            />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Scope</TH>
                  <TH>Period</TH>
                  <TH className="text-right">Limit (credits)</TH>
                  <TH className="text-right">Warn at</TH>
                  <TH className="w-56">Spent (credits)</TH>
                  <TH>Enabled</TH>
                  <TH>
                    <span className="sr-only">Actions</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {[...list]
                  .sort(
                    (a, b) =>
                      BUDGET_SCOPES.indexOf(a.scope) - BUDGET_SCOPES.indexOf(b.scope) ||
                      a.scopeLabel.localeCompare(b.scopeLabel),
                  )
                  .map((budget) => (
                    <TR key={budget.id} className={budget.enabled ? undefined : "opacity-60"}>
                      <TD>
                        <div className="flex items-center gap-2">
                          <Badge>{humanize(budget.scope)}</Badge>
                          <span className="font-medium">{budget.scopeLabel}</span>
                        </div>
                      </TD>
                      <TD className="text-muted">{PERIOD_LABEL[budget.period]}</TD>
                      <TD className="text-right tabular-nums">
                        {credits(budget.limitCredits)}
                        {budget.grantedCredits > 0 ? (
                          <span
                            className="block text-xs text-amber-200"
                            title={`One-off grant for the current window${budget.windowEndsAt ? `, expires ${formatDateTime(budget.windowEndsAt)}` : ""}`}
                          >
                            + {credits(budget.grantedCredits)} granted
                            {budget.windowEndsAt ? ` until ${formatDateTime(budget.windowEndsAt)}` : ""}
                          </span>
                        ) : null}
                      </TD>
                      <TD className="text-right tabular-nums text-muted">{budget.warnPct}%</TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <Progress
                            value={budget.spentCredits}
                            max={budget.limitCredits + budget.grantedCredits}
                            warnAt={budget.warnPct / 100}
                            label={`${budgetName(budget)} used`}
                            size="sm"
                          />
                          <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted">
                            {credits(budget.spentCredits)}
                          </span>
                          <span className="flex w-[4.5rem] shrink-0 justify-end">
                            <Badge tone={STATE_TONE[budget.state]}>
                              {budget.state === "ok" ? "OK" : humanize(budget.state)}
                            </Badge>
                          </span>
                        </div>
                      </TD>
                      <TD>
                        <Switch
                          checked={budget.enabled}
                          label={`Enforce ${budgetName(budget)}`}
                          disabled={upsert.isPending}
                          onCheckedChange={(enabled) => upsert.mutate([toUpsert(budget, { enabled })])}
                        />
                      </TD>
                      <TD className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Edit ${budgetName(budget)}`}
                            onClick={() => setEditing({ mode: "edit", budget })}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Delete ${budgetName(budget)}`}
                            onClick={() => setDeleting(budget)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  ))}
              </TBody>
            </Table>
          )
        }
      </QueryView>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.mode === "edit" ? "Edit budget" : "Add budget"}
        description="Budgets are keyed by scope and period — saving an existing combination updates it."
      >
        {editing ? (
          <BudgetForm
            budget={editing.mode === "edit" ? editing.budget : null}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        title="Remove this budget?"
        description={
          deleting
            ? `${deleting.scopeLabel} · ${PERIOD_LABEL[deleting.period]} · ${credits(deleting.limitCredits)} credits`
            : undefined
        }
        confirmLabel="Remove budget"
        cancelLabel="Keep budget"
      />
    </Card>
  );
}

function BudgetForm({ budget, onDone }: { budget: BudgetDTO | null; onDone: () => void }) {
  const org = useOrg();
  const products = useProducts();
  const initiatives = useInitiatives();
  const [scope, setScope] = useState<BudgetScope>(budget?.scope ?? "company");
  const [scopeId, setScopeId] = useState(budget?.scopeId ?? "");
  const [period, setPeriod] = useState<BudgetPeriod>(budget?.period ?? "month");
  const [limit, setLimit] = useState(budget ? String(budget.limitCredits) : "");
  const [warnPct, setWarnPct] = useState(budget ? String(budget.warnPct) : "80");
  const [enabled, setEnabled] = useState(budget?.enabled ?? true);
  const [touched, setTouched] = useState(false);
  const upsert = useUpsertBudgets(onDone);
  const locked = budget !== null;

  const options: Array<{ value: string; label: string }> =
    scope === "department"
      ? DEPARTMENTS.map((d) => ({ value: d, label: departmentStyle(d).label }))
      : scope === "agent"
        ? (org.data?.agents ?? []).map((a) => ({ value: a.id, label: `${a.name} — ${a.roleTitle}` }))
        : scope === "product"
          ? (products.data ?? []).map((p) => ({ value: p.id, label: p.name }))
          : scope === "initiative"
            ? (initiatives.data ?? []).map((i) => ({ value: i.id, label: i.title }))
            : [];

  const limitNum = Number(limit);
  const warnNum = Number(warnPct);
  const limitError =
    touched && (limit.trim() === "" || !Number.isFinite(limitNum) || limitNum < 0)
      ? "Enter a positive number"
      : undefined;
  const warnError =
    !Number.isInteger(warnNum) || warnNum < 1 || warnNum > 100 ? "Whole number 1–100" : undefined;
  const scopeError = touched && scope !== "company" && !scopeId ? `Choose a ${scope}` : undefined;

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (limit.trim() === "" || !Number.isFinite(limitNum) || limitNum < 0 || warnError) return;
    if (scope !== "company" && !scopeId) return;
    upsert.mutate([
      {
        scope,
        scopeId: scope === "company" ? null : scopeId,
        period,
        limitCredits: limitNum,
        warnPct: warnNum,
        enabled,
      },
    ]);
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Scope" htmlFor="b-scope">
          <Select
            id="b-scope"
            value={scope}
            disabled={locked}
            onChange={(e) => {
              setScope(e.target.value as BudgetScope);
              setScopeId("");
            }}
          >
            {BUDGET_SCOPES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Applies to" htmlFor="b-scope-id" error={scopeError}>
          <Select
            id="b-scope-id"
            value={scope === "company" ? "" : scopeId}
            disabled={locked || scope === "company"}
            onChange={(e) => setScopeId(e.target.value)}
          >
            {scope === "company" ? (
              <option value="">Whole company</option>
            ) : (
              <option value="">Select…</option>
            )}
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            {locked && budget?.scopeId && !options.some((o) => o.value === budget.scopeId) ? (
              <option value={budget.scopeId}>{budget.scopeLabel}</option>
            ) : null}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Period" htmlFor="b-period">
          <Select
            id="b-period"
            value={period}
            disabled={locked}
            onChange={(e) => setPeriod(e.target.value as BudgetPeriod)}
          >
            {BUDGET_PERIODS.map((p) => (
              <option key={p} value={p}>
                {PERIOD_LABEL[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Limit (credits)" htmlFor="b-limit" required error={limitError}>
          <Input
            id="b-limit"
            type="number"
            min={0}
            step={10}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            placeholder="1000"
            autoFocus
          />
        </Field>
        <Field label="Warn at (%)" htmlFor="b-warn" error={warnError}>
          <Input
            id="b-warn"
            type="number"
            min={1}
            max={100}
            step={5}
            value={warnPct}
            onChange={(e) => setWarnPct(e.target.value)}
          />
        </Field>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <Switch checked={enabled} onCheckedChange={setEnabled} label="Enforce this budget" />
        Enforce this budget
      </label>
      {locked ? (
        <p className="text-xs text-subtle">
          Scope and period identify the budget; create a new one to change them.
        </p>
      ) : null}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={upsert.isPending}>
          Save budget
        </Button>
      </div>
    </form>
  );
}
