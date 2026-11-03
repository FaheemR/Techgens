"use client";

import { useState, type FormEvent } from "react";
import type { InitiativeDetailDTO } from "@techgens/core";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api";
import { dateInputToIso, isoToDateInput } from "@/lib/format";
import { useApiMutation } from "@/lib/mutations";
import { qk } from "@/lib/queries";

interface PatchBody {
  title?: string;
  summary?: string;
  targetDate?: string | null;
  budgetCredits?: number | null;
}

export function EditInitiativeDialog({
  initiative,
  open,
  onClose,
}: {
  initiative: InitiativeDetailDTO;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Edit initiative" size="lg">
      <EditForm initiative={initiative} onDone={onClose} />
    </Dialog>
  );
}

function EditForm({ initiative, onDone }: { initiative: InitiativeDetailDTO; onDone: () => void }) {
  const [title, setTitle] = useState(initiative.title);
  const [summary, setSummary] = useState(initiative.summary);
  const [targetDate, setTargetDate] = useState(isoToDateInput(initiative.targetDate));
  const [budget, setBudget] = useState(
    initiative.budgetCredits === null ? "" : String(initiative.budgetCredits),
  );

  const save = useApiMutation(
    (body: PatchBody) => api.patch<InitiativeDetailDTO>(`/api/initiatives/${initiative.id}`, body),
    {
      success: "Initiative updated",
      errorTitle: "Couldn't update the initiative",
      invalidate: [["initiatives"], qk.dashboard],
      onSuccess: onDone,
    },
  );

  const budgetValue = budget.trim() === "" ? null : Number(budget);
  const budgetInvalid = budgetValue !== null && (!Number.isFinite(budgetValue) || budgetValue < 0);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || budgetInvalid) return;
    save.mutate({
      title: title.trim(),
      summary,
      targetDate: targetDate ? (dateInputToIso(targetDate) ?? null) : null,
      budgetCredits: budgetValue,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field
        label="Title"
        htmlFor="ei-title"
        required
        error={!title.trim() ? "Title is required" : undefined}
      >
        <Input id="ei-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Summary" htmlFor="ei-summary" hint="Markdown supported">
        <Textarea id="ei-summary" rows={6} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Target date" htmlFor="ei-date">
          <Input
            id="ei-date"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </Field>
        <Field
          label="Budget (credits)"
          htmlFor="ei-budget"
          hint="Leave empty for no cap"
          error={budgetInvalid ? "Enter a positive number" : undefined}
        >
          <Input
            id="ei-budget"
            type="number"
            min={0}
            step={10}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
