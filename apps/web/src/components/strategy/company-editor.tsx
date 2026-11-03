"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { CompanyDTO } from "@techgens/core";
import { BookOpenText, Plus, RotateCcw, Save, ScrollText, X } from "lucide-react";
import { MarkdownView } from "@/components/common/markdown";
import { QueryView } from "@/components/common/query-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { PageSkeleton } from "@/components/ui/skeleton";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { useApiMutation } from "@/lib/mutations";
import { qk, useCompany } from "@/lib/queries";
import { cn } from "@/lib/utils";

type Draft = Pick<CompanyDTO, "name" | "mission" | "vision" | "values" | "policies"> & {
  githubOwner: string;
};

const STARTER_POLICIES = `## Product principles
- Ship the smallest valuable increment; validate with real users before expanding scope.
- Every feature has measurable success criteria defined in the PRD.

## Engineering standards
- TypeScript (strict) for web and services; tests accompany every change (unit + critical-path e2e).
- Every change lands through a reviewed pull request with green CI. No direct pushes to \`main\`.
- Deploy to Azure Container Apps via GitHub Actions; staging first, production only with CEO approval.

## Security & privacy
- Least-privilege credentials, secrets only in GitHub/Azure secret stores, never in code.
- Threat model for every new service; dependencies kept patched.

## Spending
- Stay within the budgets set by the CEO; escalate before exceeding them with a clear recommendation.

## Communication
- Be concise. Lead with the decision needed, the recommendation and the trade-offs.
`;

function toDraft(company: CompanyDTO): Draft {
  return {
    name: company.name,
    mission: company.mission,
    vision: company.vision,
    values: [...company.values],
    policies: company.policies,
    githubOwner: company.githubOwner ?? "",
  };
}

export function CompanyEditor() {
  const company = useCompany();
  return (
    <QueryView query={company} loading={<PageSkeleton />}>
      {(data) => <CompanyForm company={data} />}
    </QueryView>
  );
}

function CompanyForm({ company }: { company: CompanyDTO }) {
  const queryClient = useQueryClient();
  const [base, setBase] = useState<Draft>(() => toDraft(company));
  const [draft, setDraft] = useState<Draft>(base);
  const [valueInput, setValueInput] = useState("");
  const [policyTab, setPolicyTab] = useState("write");
  const dirty = JSON.stringify(draft) !== JSON.stringify(base);

  const save = useApiMutation((body: Partial<CompanyDTO>) => api.put<CompanyDTO>("/api/company", body), {
    success: "Company constitution saved — agents use it from their next task",
    errorTitle: "Couldn't save the company profile",
    invalidate: [qk.dashboard],
    onSuccess: (result) => {
      queryClient.setQueryData(qk.company, result);
      const next = toDraft(result);
      setBase(next);
      setDraft(next);
    },
  });

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  function addValue() {
    const value = valueInput.trim();
    if (!value || draft.values.some((v) => v.toLowerCase() === value.toLowerCase())) {
      setValueInput("");
      return;
    }
    update("values", [...draft.values, value]);
    setValueInput("");
  }

  function onValueKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addValue();
    } else if (event.key === "Backspace" && !valueInput && draft.values.length > 0) {
      update("values", draft.values.slice(0, -1));
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) return;
    save.mutate({
      name: draft.name.trim(),
      mission: draft.mission,
      vision: draft.vision,
      values: draft.values,
      policies: draft.policies,
      githubOwner: draft.githubOwner.trim() || null,
      // Saving the constitution completes onboarding (hides the dashboard setup callout).
      onboarded: true,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <CardHeader title="Identity" description="Who you are and where you're going" icon={BookOpenText} />
          <CardContent className="space-y-4">
            <Field
              label="Company name"
              htmlFor="co-name"
              required
              error={!draft.name.trim() ? "Name is required" : undefined}
            >
              <Input id="co-name" value={draft.name} onChange={(e) => update("name", e.target.value)} />
            </Field>
            <Field
              label="Mission"
              htmlFor="co-mission"
              hint="Why the company exists, in one or two sentences."
            >
              <Textarea
                id="co-mission"
                rows={3}
                value={draft.mission}
                onChange={(e) => update("mission", e.target.value)}
              />
            </Field>
            <Field label="Vision" htmlFor="co-vision" hint="What the world looks like when you succeed.">
              <Textarea
                id="co-vision"
                rows={3}
                value={draft.vision}
                onChange={(e) => update("vision", e.target.value)}
              />
            </Field>
            <Field
              label="Values"
              htmlFor="co-values"
              hint="Press Enter to add. Agents weigh trade-offs against these."
            >
              <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-[#0a1019] p-1.5 focus-within:border-accent/70">
                {draft.values.map((value) => (
                  <span
                    key={value}
                    className="inline-flex items-center gap-1 rounded-md border border-accent/25 bg-accent/10 py-0.5 pl-2 pr-1 text-xs text-cyan-100"
                  >
                    {value}
                    <button
                      type="button"
                      onClick={() =>
                        update(
                          "values",
                          draft.values.filter((v) => v !== value),
                        )
                      }
                      className="rounded p-0.5 text-cyan-200/70 hover:bg-white/10 hover:text-fg"
                      aria-label={`Remove value ${value}`}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                <input
                  id="co-values"
                  value={valueInput}
                  onChange={(e) => setValueInput(e.target.value)}
                  onKeyDown={onValueKey}
                  onBlur={addValue}
                  placeholder={draft.values.length ? "Add value…" : "e.g. Customer obsession"}
                  className="min-w-32 flex-1 bg-transparent px-1.5 py-1 text-sm text-fg outline-none placeholder:text-subtle"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={addValue}
                  aria-label="Add value"
                  disabled={!valueInput.trim()}
                >
                  <Plus />
                </Button>
              </div>
            </Field>
            <Field
              label="GitHub owner"
              htmlFor="co-owner"
              hint="Organisation or user that owns product repositories."
            >
              <Input
                id="co-owner"
                value={draft.githubOwner}
                onChange={(e) => update("githubOwner", e.target.value)}
                placeholder="acme-inc"
              />
            </Field>
          </CardContent>
        </Card>

        <Card className="flex min-w-0 flex-col">
          <CardHeader
            title="Policies — the company constitution"
            description="Standards and rules injected into every agent's instructions. Markdown."
            icon={ScrollText}
            action={
              !draft.policies.trim() ? (
                <Button variant="secondary" size="xs" onClick={() => update("policies", STARTER_POLICIES)}>
                  Insert starter policies
                </Button>
              ) : null
            }
          />
          <div className="px-4 pt-3">
            <Tabs
              idBase="policies"
              label="Policies editor mode"
              variant="pills"
              value={policyTab}
              onChange={setPolicyTab}
              tabs={[
                { id: "write", label: "Write" },
                { id: "preview", label: "Preview" },
                { id: "split", label: "Split" },
              ]}
              className="w-fit"
            />
          </div>
          <TabPanel
            idBase="policies"
            id={policyTab}
            className={cn("min-h-0 flex-1 p-4", policyTab === "split" && "grid gap-4 lg:grid-cols-2")}
          >
            {policyTab !== "preview" ? (
              <>
                <label htmlFor="co-policies" className="sr-only">
                  Policies (Markdown)
                </label>
                <Textarea
                  id="co-policies"
                  value={draft.policies}
                  onChange={(e) => update("policies", e.target.value)}
                  spellCheck
                  className="h-full min-h-[440px] resize-y font-mono text-[13px] leading-relaxed"
                  placeholder={"## Engineering standards\n- …"}
                />
              </>
            ) : null}
            {policyTab !== "write" ? (
              <div className="min-h-[440px] overflow-y-auto rounded-lg border border-border bg-surface-2/40 p-4">
                {draft.policies.trim() ? (
                  <MarkdownView content={draft.policies} />
                ) : (
                  <p className="text-sm text-subtle">Nothing to preview yet.</p>
                )}
              </div>
            ) : null}
          </TabPanel>
        </Card>
      </div>

      <div className="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-xl border border-border bg-surface/95 px-4 py-3 shadow-xl shadow-black/40 backdrop-blur">
        <p className="mr-auto text-sm text-muted">
          {dirty ? "You have unsaved changes." : "All changes saved."}
        </p>
        <Button variant="ghost" size="sm" onClick={() => setDraft(base)} disabled={!dirty || save.isPending}>
          <RotateCcw />
          Discard
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={!dirty || !draft.name.trim()}
          loading={save.isPending}
        >
          {save.isPending ? null : <Save />}
          Save constitution
        </Button>
      </div>
    </form>
  );
}
