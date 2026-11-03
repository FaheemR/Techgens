"use client";

import { useState, type FormEvent } from "react";
import type { GoalDTO, GoalStatus, GoalType } from "@techgens/core";
import { GOAL_STATUSES } from "@techgens/core";
import { Check, CalendarDays, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { QueryView } from "@/components/common/query-view";
import { GoalStatusBadge } from "@/components/common/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { SkeletonRows } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { dateInputToIso, formatDate, humanize, isoToDateInput, percent } from "@/lib/format";
import { buildObjectiveTree, formatGoalValue, goalProgress } from "@/lib/goals";
import { GOAL_STATUS_TONE } from "@/lib/labels";
import { useApiMutation } from "@/lib/mutations";
import { qk, useGoals, useProducts } from "@/lib/queries";

interface GoalBody {
  type: GoalType;
  title: string;
  description?: string;
  parentId?: string | null;
  productId?: string | null;
  targetValue?: number | null;
  currentValue?: number | null;
  unit?: string | null;
  dueDate?: string | null;
  status?: GoalStatus;
}

type Editing =
  { mode: "create"; type: GoalType; parentId: string | null } | { mode: "edit"; goal: GoalDTO } | null;

export function GoalsPanel() {
  const goals = useGoals();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<GoalDTO | null>(null);

  const remove = useApiMutation((id: string) => api.del(`/api/goals/${id}`), {
    success: "Goal deleted",
    errorTitle: "Couldn't delete the goal",
    invalidate: [qk.goals, qk.dashboard],
    onSuccess: () => setDeleting(null),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">
          Objectives describe what you want to achieve; key results measure it. Agents reference OKRs in
          charters, PRDs and status reports.
        </p>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setEditing({ mode: "create", type: "objective", parentId: null })}
        >
          <Plus />
          New objective
        </Button>
      </div>

      <QueryView query={goals} loading={<SkeletonRows rows={4} />}>
        {(list) => {
          const { objectives, orphans } = buildObjectiveTree(list);
          if (objectives.length === 0 && orphans.length === 0) {
            return (
              <Card>
                <EmptyState
                  icon={Target}
                  title="No OKRs yet"
                  description="Start with one ambitious objective and two or three measurable key results."
                  action={
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setEditing({ mode: "create", type: "objective", parentId: null })}
                    >
                      <Plus />
                      New objective
                    </Button>
                  }
                />
              </Card>
            );
          }
          return (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {objectives.map(({ objective, keyResults, progress }) => (
                <Card key={objective.id}>
                  <div className="border-b border-border px-4 py-3">
                    <div className="flex items-start gap-3">
                      <Target aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{objective.title}</h3>
                          <GoalStatusBadge status={objective.status} />
                        </div>
                        {objective.description ? (
                          <p className="mt-1 text-sm text-muted">{objective.description}</p>
                        ) : null}
                        <div className="mt-2.5 flex items-center gap-3">
                          <Progress
                            value={progress ?? 0}
                            label={`${objective.title} progress`}
                            tone={GOAL_STATUS_TONE[objective.status]}
                          />
                          <span className="w-12 shrink-0 text-right text-sm font-medium tabular-nums">
                            {progress === null ? "—" : percent(Math.min(progress, 1))}
                          </span>
                        </div>
                        {objective.dueDate ? (
                          <p className="mt-1.5 flex items-center gap-1 text-xs text-subtle">
                            <CalendarDays aria-hidden className="size-3" /> Due{" "}
                            {formatDate(objective.dueDate)}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit objective ${objective.title}`}
                          onClick={() => setEditing({ mode: "edit", goal: objective })}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete objective ${objective.title}`}
                          onClick={() => setDeleting(objective)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <CardContent className="space-y-3">
                    {keyResults.length === 0 ? (
                      <p className="text-sm text-subtle">No key results yet.</p>
                    ) : null}
                    {keyResults.map((kr) => (
                      <KeyResultRow
                        key={kr.id}
                        kr={kr}
                        onEdit={() => setEditing({ mode: "edit", goal: kr })}
                        onDelete={() => setDeleting(kr)}
                      />
                    ))}
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        setEditing({ mode: "create", type: "key_result", parentId: objective.id })
                      }
                    >
                      <Plus />
                      Add key result
                    </Button>
                  </CardContent>
                </Card>
              ))}
              {orphans.length > 0 ? (
                <Card>
                  <div className="border-b border-border px-4 py-3">
                    <h3 className="font-semibold">Unassigned key results</h3>
                    <p className="text-xs text-muted">Key results without an objective.</p>
                  </div>
                  <CardContent className="space-y-3">
                    {orphans.map((kr) => (
                      <KeyResultRow
                        key={kr.id}
                        kr={kr}
                        onEdit={() => setEditing({ mode: "edit", goal: kr })}
                        onDelete={() => setDeleting(kr)}
                      />
                    ))}
                  </CardContent>
                </Card>
              ) : null}
            </div>
          );
        }}
      </QueryView>

      <GoalDialog editing={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        title={`Delete ${deleting?.type === "objective" ? "objective" : "key result"}?`}
        description={
          deleting?.type === "objective"
            ? `“${deleting.title}” and its key results will be removed.`
            : `“${deleting?.title ?? ""}” will be removed.`
        }
        confirmLabel="Delete"
      />
    </div>
  );
}

function KeyResultRow({ kr, onEdit, onDelete }: { kr: GoalDTO; onEdit: () => void; onDelete: () => void }) {
  const progress = goalProgress(kr);
  const [value, setValue] = useState(kr.currentValue === null ? "" : String(kr.currentValue));
  const [editingValue, setEditingValue] = useState(false);
  const update = useApiMutation(
    (currentValue: number) => api.patch<GoalDTO>(`/api/goals/${kr.id}`, { currentValue }),
    {
      success: "Key result updated",
      errorTitle: "Couldn't update the key result",
      invalidate: [qk.goals, qk.dashboard],
      onSuccess: () => setEditingValue(false),
    },
  );
  const numeric = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(numeric);

  return (
    <div className="rounded-lg border border-border bg-surface-2/40 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{kr.title}</p>
            <GoalStatusBadge status={kr.status} />
          </div>
          <div className="mt-2 flex items-center gap-3">
            <Progress
              value={progress ?? 0}
              label={`${kr.title} progress`}
              size="sm"
              tone={GOAL_STATUS_TONE[kr.status]}
            />
            {editingValue ? (
              <form
                className="flex shrink-0 items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (valid) update.mutate(numeric);
                }}
              >
                <label htmlFor={`kr-${kr.id}`} className="sr-only">
                  Current value
                </label>
                <Input
                  id={`kr-${kr.id}`}
                  type="number"
                  step="any"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="h-7 w-24 text-xs"
                  autoFocus
                />
                <Button
                  type="submit"
                  size="icon-sm"
                  variant="secondary"
                  aria-label="Save current value"
                  disabled={!valid}
                  loading={update.isPending}
                >
                  {update.isPending ? null : <Check />}
                </Button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setEditingValue(true)}
                className="shrink-0 rounded px-1 text-xs tabular-nums text-muted hover:bg-white/5 hover:text-fg"
                title="Update current value"
              >
                {formatGoalValue(kr.currentValue, kr.unit)} / {formatGoalValue(kr.targetValue, kr.unit)}
              </button>
            )}
          </div>
          {kr.dueDate ? <p className="mt-1 text-[11px] text-subtle">Due {formatDate(kr.dueDate)}</p> : null}
        </div>
        <div className="flex shrink-0 gap-0.5">
          <Button variant="ghost" size="icon-sm" aria-label={`Edit key result ${kr.title}`} onClick={onEdit}>
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete key result ${kr.title}`}
            onClick={onDelete}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </div>
  );
}

function GoalDialog({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const type = editing?.mode === "edit" ? editing.goal.type : (editing?.type ?? "objective");
  const title =
    editing?.mode === "edit"
      ? `Edit ${type === "objective" ? "objective" : "key result"}`
      : type === "objective"
        ? "New objective"
        : "New key result";
  return (
    <Dialog open={editing !== null} onClose={onClose} title={title} size="lg">
      {editing ? <GoalForm editing={editing} onDone={onClose} /> : null}
    </Dialog>
  );
}

function GoalForm({ editing, onDone }: { editing: NonNullable<Editing>; onDone: () => void }) {
  const goal = editing.mode === "edit" ? editing.goal : null;
  const type: GoalType = goal?.type ?? (editing.mode === "create" ? editing.type : "objective");
  const products = useProducts();
  const [title, setTitle] = useState(goal?.title ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [status, setStatus] = useState<GoalStatus>(goal?.status ?? "on_track");
  const [productId, setProductId] = useState(goal?.productId ?? "");
  const [target, setTarget] = useState(goal?.targetValue == null ? "" : String(goal.targetValue));
  const [current, setCurrent] = useState(goal?.currentValue == null ? "" : String(goal.currentValue));
  const [unit, setUnit] = useState(goal?.unit ?? "");
  const [dueDate, setDueDate] = useState(isoToDateInput(goal?.dueDate));
  const [touched, setTouched] = useState(false);

  const save = useApiMutation(
    (body: GoalBody) =>
      goal ? api.patch<GoalDTO>(`/api/goals/${goal.id}`, body) : api.post<GoalDTO>("/api/goals", body),
    {
      success: goal ? "Goal updated" : type === "objective" ? "Objective created" : "Key result added",
      errorTitle: "Couldn't save the goal",
      invalidate: [qk.goals, qk.dashboard],
      onSuccess: onDone,
    },
  );

  const toNumber = (v: string) => (v.trim() === "" ? null : Number(v));
  const targetNum = toNumber(target);
  const currentNum = toNumber(current);
  const numbersInvalid =
    (targetNum !== null && !Number.isFinite(targetNum)) ||
    (currentNum !== null && !Number.isFinite(currentNum));

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!title.trim() || numbersInvalid) return;
    const body: GoalBody = {
      type,
      title: title.trim(),
      description: description.trim(),
      status,
      productId: productId || null,
      dueDate: dueDate ? (dateInputToIso(dueDate) ?? null) : null,
    };
    if (editing.mode === "create" && editing.parentId) body.parentId = editing.parentId;
    if (type === "key_result" || targetNum !== null || currentNum !== null) {
      body.targetValue = targetNum;
      body.currentValue = currentNum;
      body.unit = unit.trim() || null;
    }
    save.mutate(body);
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field
        label="Title"
        htmlFor="goal-title"
        required
        error={touched && !title.trim() ? "Title is required" : undefined}
      >
        <Input
          id="goal-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          placeholder={
            type === "objective"
              ? "Become the default invoicing tool for freelancers"
              : "Reach 500 paying customers"
          }
        />
      </Field>
      <Field label="Description" htmlFor="goal-description">
        <Textarea
          id="goal-description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      {type === "key_result" ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Current" htmlFor="goal-current">
            <Input
              id="goal-current"
              type="number"
              step="any"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Target" htmlFor="goal-target" error={numbersInvalid ? "Enter numbers" : undefined}>
            <Input
              id="goal-target"
              type="number"
              step="any"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="500"
            />
          </Field>
          <Field label="Unit" htmlFor="goal-unit" hint="e.g. %, users, $">
            <Input
              id="goal-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="customers"
            />
          </Field>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Status" htmlFor="goal-status">
          <Select id="goal-status" value={status} onChange={(e) => setStatus(e.target.value as GoalStatus)}>
            {GOAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due date" htmlFor="goal-due">
          <Input id="goal-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Product" htmlFor="goal-product" hint="Optional">
          <Select id="goal-product" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Company-wide</option>
            {(products.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          {goal ? "Save changes" : "Create"}
        </Button>
      </div>
    </form>
  );
}
