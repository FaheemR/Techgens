"use client";

import { useState, type FormEvent } from "react";
import type { WorkItemDTO, WorkItemKind } from "@techgens/core";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api";
import { humanize } from "@/lib/format";
import { useApiMutation } from "@/lib/mutations";
import { useInitiatives, useOrg } from "@/lib/queries";

interface CreateWorkItemBody {
  title: string;
  description: string;
  kind?: CeoKind;
  initiativeId?: string;
  assigneeRoleId?: string;
}

/** Kinds accepted by `POST /api/work-items` for CEO-created tasks. */
const CEO_KINDS = [
  "task",
  "research",
  "document",
  "review",
  "bug",
] as const satisfies readonly WorkItemKind[];
type CeoKind = (typeof CEO_KINDS)[number];

export function NewTaskDialog({
  open,
  onClose,
  defaultInitiativeId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  defaultInitiativeId?: string | undefined;
  onCreated?: (item: WorkItemDTO) => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="New task"
      description="Assign work directly. The responsible agent picks it up like any delegated task."
    >
      <NewTaskForm onDone={onClose} defaultInitiativeId={defaultInitiativeId} onCreated={onCreated} />
    </Dialog>
  );
}

function NewTaskForm({
  onDone,
  defaultInitiativeId,
  onCreated,
}: {
  onDone: () => void;
  defaultInitiativeId?: string | undefined;
  onCreated?: ((item: WorkItemDTO) => void) | undefined;
}) {
  const org = useOrg();
  const initiatives = useInitiatives();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<CeoKind>("task");
  const [initiativeId, setInitiativeId] = useState(defaultInitiativeId ?? "");
  const [roleId, setRoleId] = useState("");
  const [touched, setTouched] = useState(false);

  const create = useApiMutation(
    (body: CreateWorkItemBody) => api.post<WorkItemDTO>("/api/work-items", body),
    {
      success: "Task created",
      errorTitle: "Couldn't create the task",
      invalidate: [["work-items"], ["initiatives"]],
      onSuccess: (item) => {
        onCreated?.(item);
        onDone();
      },
    },
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (title.trim().length < 3) return;
    const body: CreateWorkItemBody = { title: title.trim(), description: description.trim(), kind };
    if (initiativeId) body.initiativeId = initiativeId;
    if (roleId) body.assigneeRoleId = roleId;
    create.mutate(body);
  }

  const roles = [...(org.data?.roles ?? [])].sort((a, b) => a.title.localeCompare(b.title));

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field
        label="Title"
        htmlFor="nt-title"
        required
        error={touched && title.trim().length < 3 ? "At least 3 characters" : undefined}
      >
        <Input
          id="nt-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          placeholder="Benchmark competitor onboarding flows"
        />
      </Field>
      <Field
        label="Description"
        htmlFor="nt-description"
        hint="Markdown supported. Include acceptance criteria."
      >
        <Textarea
          id="nt-description"
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Kind" htmlFor="nt-kind">
          <Select id="nt-kind" value={kind} onChange={(e) => setKind(e.target.value as CeoKind)}>
            {CEO_KINDS.map((k) => (
              <option key={k} value={k}>
                {humanize(k)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Initiative" htmlFor="nt-initiative" hint="Optional">
          <Select id="nt-initiative" value={initiativeId} onChange={(e) => setInitiativeId(e.target.value)}>
            <option value="">None</option>
            {(initiatives.data ?? []).map((i) => (
              <option key={i.id} value={i.id}>
                {i.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Assign to role" htmlFor="nt-role" hint="Optional — Chief of Staff routes it otherwise">
          <Select id="nt-role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">Let the Chief of Staff route it</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={create.isPending}>
          Create task
        </Button>
      </div>
    </form>
  );
}
