"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { InitiativeDetailDTO } from "@techgens/core";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api";
import { dateInputToIso } from "@/lib/format";
import { useApiMutation } from "@/lib/mutations";
import { qk, useProducts } from "@/lib/queries";

interface CreateInitiativeBody {
  title: string;
  directive: string;
  productId?: string;
  targetDate?: string;
  budgetCredits?: number;
}

export function NewInitiativeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="New initiative"
      description="The Chief of Staff turns your directive into a charter and milestone roadmap, then asks for your approval."
    >
      <NewInitiativeForm onDone={onClose} />
    </Dialog>
  );
}

function NewInitiativeForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const products = useProducts();
  const [title, setTitle] = useState("");
  const [directive, setDirective] = useState("");
  const [productId, setProductId] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [budget, setBudget] = useState("");
  const [touched, setTouched] = useState(false);

  const create = useApiMutation(
    (body: CreateInitiativeBody) => api.post<InitiativeDetailDTO>("/api/initiatives", body),
    {
      success: "Initiative created — the Chief of Staff is drafting the charter",
      errorTitle: "Couldn't create the initiative",
      invalidate: [["initiatives"], qk.dashboard],
      onSuccess: (initiative) => {
        onDone();
        router.push(`/initiatives/${initiative.id}`);
      },
    },
  );

  const titleError =
    touched && title.trim().length < 3 ? "Give the initiative a name (at least 3 characters)" : undefined;
  const directiveError =
    touched && directive.trim().length < 10
      ? "Describe the outcome you want (at least a sentence)"
      : undefined;
  const budgetValue = budget.trim() === "" ? undefined : Number(budget);
  const budgetError =
    budgetValue !== undefined && (!Number.isFinite(budgetValue) || budgetValue <= 0)
      ? "Enter a positive number, or leave empty"
      : undefined;

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (title.trim().length < 3 || directive.trim().length < 10 || budgetError) return;
    const body: CreateInitiativeBody = { title: title.trim(), directive: directive.trim() };
    if (productId) body.productId = productId;
    const iso = dateInputToIso(targetDate);
    if (iso) body.targetDate = iso;
    if (budgetValue !== undefined) body.budgetCredits = budgetValue;
    create.mutate(body);
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Title" htmlFor="ni-title" required error={titleError}>
        <Input
          id="ni-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="InvoiceLite MVP"
          aria-invalid={Boolean(titleError)}
          autoFocus
        />
      </Field>
      <Field
        label="Directive"
        htmlFor="ni-directive"
        required
        error={directiveError}
        hint="What should be built, for whom, and why. Include constraints, deadline and success metrics if you have them."
      >
        <Textarea
          id="ni-directive"
          value={directive}
          onChange={(e) => setDirective(e.target.value)}
          rows={5}
          placeholder="Build InvoiceLite: invoicing SaaS for freelancers. MVP in 6 weeks with client management, invoice PDFs and Stripe payments."
          aria-invalid={Boolean(directiveError)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Product" htmlFor="ni-product" hint="Optional">
          <Select id="ni-product" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">New / unspecified</option>
            {(products.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Target date" htmlFor="ni-date" hint="Optional">
          <Input
            id="ni-date"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </Field>
        <Field label="Budget (credits)" htmlFor="ni-budget" hint="Optional cap" error={budgetError}>
          <Input
            id="ni-budget"
            type="number"
            min={1}
            step={10}
            inputMode="decimal"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="2400"
            aria-invalid={Boolean(budgetError)}
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={create.isPending}>
          Create initiative
        </Button>
      </div>
    </form>
  );
}
