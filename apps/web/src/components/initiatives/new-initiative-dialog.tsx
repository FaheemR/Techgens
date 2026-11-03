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

type FieldErrors = Partial<Record<"title" | "directive" | "budget", string>>;

function titleError(value: string): string | undefined {
  return value.trim().length < 3 ? "Give the initiative a name (at least 3 characters)" : undefined;
}

function directiveError(value: string): string | undefined {
  return value.trim().length < 10 ? "Describe the outcome you want (at least a sentence)" : undefined;
}

function budgetError(value: string): string | undefined {
  if (value.trim() === "") return undefined;
  const n = Number(value);
  return !Number.isFinite(n) || n <= 0 ? "Enter a positive number, or leave empty" : undefined;
}

/**
 * Uncontrolled fields read with FormData on submit: what the CEO sees in the fields is what gets submitted, even when
 * text arrives without a React change event (autofill, paste helpers, automation) or a re-render races the click.
 */
function NewInitiativeForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const products = useProducts();
  const [errors, setErrors] = useState<FieldErrors>({});
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

  // After the first submit attempt, errors update as the CEO types; the budget is checked from the start.
  function revalidate(key: keyof FieldErrors, value: string) {
    if (key !== "budget" && !touched) return;
    const message =
      key === "title" ? titleError(value) : key === "directive" ? directiveError(value) : budgetError(value);
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
    const directive = read("directive");
    const budget = read("budget");
    const next: FieldErrors = {
      title: titleError(title),
      directive: directiveError(directive),
      budget: budgetError(budget),
    };
    setTouched(true);
    setErrors(next);
    const firstInvalid = next.title
      ? "ni-title"
      : next.directive
        ? "ni-directive"
        : next.budget
          ? "ni-budget"
          : null;
    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus();
      return;
    }
    const body: CreateInitiativeBody = { title: title.trim(), directive: directive.trim() };
    const productId = read("productId");
    if (productId) body.productId = productId;
    const iso = dateInputToIso(read("targetDate"));
    if (iso) body.targetDate = iso;
    if (budget.trim() !== "") body.budgetCredits = Number(budget);
    create.mutate(body);
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Title" htmlFor="ni-title" required error={errors.title}>
        <Input
          id="ni-title"
          name="title"
          defaultValue=""
          onInput={(e) => revalidate("title", e.currentTarget.value)}
          placeholder="InvoiceLite MVP"
          aria-invalid={Boolean(errors.title)}
          autoFocus
        />
      </Field>
      <Field
        label="Directive"
        htmlFor="ni-directive"
        required
        error={errors.directive}
        hint="What should be built, for whom, and why. Include constraints, deadline and success metrics if you have them."
      >
        <Textarea
          id="ni-directive"
          name="directive"
          defaultValue=""
          onInput={(e) => revalidate("directive", e.currentTarget.value)}
          rows={5}
          placeholder="Build InvoiceLite: invoicing SaaS for freelancers. MVP in 6 weeks with client management, invoice PDFs and Stripe payments."
          aria-invalid={Boolean(errors.directive)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Product" htmlFor="ni-product" hint="Optional">
          <Select id="ni-product" name="productId" defaultValue="">
            <option value="">New / unspecified</option>
            {(products.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Target date" htmlFor="ni-date" hint="Optional">
          <Input id="ni-date" name="targetDate" type="date" defaultValue="" />
        </Field>
        <Field label="Budget (credits)" htmlFor="ni-budget" hint="Optional cap" error={errors.budget}>
          <Input
            id="ni-budget"
            name="budget"
            type="number"
            min={1}
            step="any"
            inputMode="decimal"
            defaultValue=""
            onInput={(e) => revalidate("budget", e.currentTarget.value)}
            placeholder="2400"
            aria-invalid={Boolean(errors.budget)}
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
