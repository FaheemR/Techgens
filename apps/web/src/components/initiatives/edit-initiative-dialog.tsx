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

type FieldErrors = Partial<Record<"title" | "budget", string>>;

function titleError(value: string): string | undefined {
  return value.trim() ? undefined : "Title is required";
}

function budgetError(value: string): string | undefined {
  if (value.trim() === "") return undefined;
  const n = Number(value);
  return !Number.isFinite(n) || n <= 0 ? "Enter a positive number, or leave empty for no cap" : undefined;
}

/** Same pattern as New initiative: uncontrolled fields read with FormData on submit, app-level validation. */
function EditForm({ initiative, onDone }: { initiative: InitiativeDetailDTO; onDone: () => void }) {
  const [errors, setErrors] = useState<FieldErrors>({});

  const save = useApiMutation(
    (body: PatchBody) => api.patch<InitiativeDetailDTO>(`/api/initiatives/${initiative.id}`, body),
    {
      success: "Initiative updated",
      errorTitle: "Couldn't update the initiative",
      invalidate: [["initiatives"], qk.dashboard],
      onSuccess: onDone,
    },
  );

  function revalidate(key: keyof FieldErrors, value: string) {
    const message = key === "title" ? titleError(value) : budgetError(value);
    setErrors((current) => (current[key] === message ? current : { ...current, [key]: message }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const read = (key: string) => {
      const value = data.get(key);
      return typeof value === "string" ? value : "";
    };
    const title = read("title");
    const budget = read("budget");
    const targetDate = read("targetDate");
    const next: FieldErrors = { title: titleError(title), budget: budgetError(budget) };
    setErrors(next);
    const firstInvalid = next.title ? "ei-title" : next.budget ? "ei-budget" : null;
    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus();
      return;
    }
    save.mutate({
      title: title.trim(),
      summary: read("summary"),
      targetDate: targetDate ? (dateInputToIso(targetDate) ?? null) : null,
      budgetCredits: budget.trim() === "" ? null : Number(budget),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Title" htmlFor="ei-title" required error={errors.title}>
        <Input
          id="ei-title"
          name="title"
          defaultValue={initiative.title}
          onInput={(e) => revalidate("title", e.currentTarget.value)}
          aria-invalid={Boolean(errors.title)}
          autoFocus
        />
      </Field>
      <Field label="Summary" htmlFor="ei-summary" hint="Markdown supported">
        <Textarea id="ei-summary" name="summary" rows={6} defaultValue={initiative.summary} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Target date" htmlFor="ei-date">
          <Input
            id="ei-date"
            name="targetDate"
            type="date"
            defaultValue={isoToDateInput(initiative.targetDate)}
          />
        </Field>
        <Field
          label="Budget (credits)"
          htmlFor="ei-budget"
          hint="Leave empty for no cap"
          error={errors.budget}
        >
          <Input
            id="ei-budget"
            name="budget"
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            defaultValue={initiative.budgetCredits === null ? "" : String(initiative.budgetCredits)}
            onInput={(e) => revalidate("budget", e.currentTarget.value)}
            aria-invalid={Boolean(errors.budget)}
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
