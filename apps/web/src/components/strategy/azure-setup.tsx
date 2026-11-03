"use client";

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AzureSetupDTO, ProductDTO } from "@techgens/core";
import { Cloud, Download, Pencil, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { ErrorState } from "@/components/ui/error-state";
import { Field, Input } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { useApiMutation } from "@/lib/mutations";
import { qk, useAzureSetup } from "@/lib/queries";
import { downloadText } from "@/lib/utils";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREFIX = /^[A-Za-z0-9_-]{1,20}$/;

const CONFIG_LABELS: Record<string, string> = {
  subscriptionId: "Subscription",
  tenantId: "Tenant",
  location: "Region",
  resourceGroupPrefix: "Resource group prefix",
  stagingClientId: "Staging client ID",
  productionClientId: "Production client ID",
};

/** Azure deployment section of the product drawer: subscription settings and the generated setup script. */
export function AzureSection({ product }: { product: ProductDTO }) {
  const [showScript, setShowScript] = useState(false);
  const azure = product.azure ?? {};
  const hasRepo = Boolean(product.repoOwner && product.repoName);
  const hasSubscription = Boolean(azure.subscriptionId);
  const setup = useAzureSetup(product.id, showScript && hasRepo && hasSubscription);

  return (
    <section className="rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Cloud aria-hidden className="size-4 text-accent" />
        <h3 className="text-sm font-semibold">Azure deployment</h3>
      </div>
      <div className="space-y-4 p-4 text-sm">
        <p className="text-muted">
          A one-time Azure CLI script creates the resource groups and app registrations with GitHub OIDC
          federation for each environment; the repository&apos;s workflows then deploy to Azure Container
          Apps.
        </p>
        <AzureConfig key={JSON.stringify(azure)} product={product} />
        {!hasRepo ? (
          <p
            role="status"
            className="rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2 text-amber-100"
          >
            Bootstrap the GitHub repository first — the setup script federates its environments with Azure.
          </p>
        ) : !hasSubscription ? (
          <p
            role="status"
            className="rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2 text-amber-100"
          >
            Add the product&apos;s Azure subscription above to generate the setup script.
          </p>
        ) : !showScript ? (
          <Button variant="secondary" size="sm" onClick={() => setShowScript(true)}>
            <Terminal />
            Show Azure setup script
          </Button>
        ) : setup.data ? (
          <AzureSetupView setup={setup.data} fileName={`${product.slug}-azure-setup.sh`} />
        ) : setup.isError ? (
          <ErrorState
            error={setup.error}
            compact
            title="Couldn't generate the setup script"
            onRetry={() => void setup.refetch()}
          />
        ) : (
          <LoadingBlock label="Generating script…" />
        )}
      </div>
    </section>
  );
}

function AzureConfig({ product }: { product: ProductDTO }) {
  const queryClient = useQueryClient();
  const azure = product.azure ?? {};
  const [editing, setEditing] = useState(!azure.subscriptionId);
  const [subscriptionId, setSubscriptionId] = useState(azure.subscriptionId ?? "");
  const [tenantId, setTenantId] = useState(azure.tenantId ?? "");
  const [location, setLocation] = useState(azure.location ?? "eastus2");
  const [prefix, setPrefix] = useState(azure.resourceGroupPrefix ?? "");
  const [touched, setTouched] = useState(false);

  const save = useApiMutation(
    (config: Record<string, string>) =>
      api.patch<ProductDTO>(`/api/products/${product.id}`, { azure: config }),
    {
      success: "Azure settings saved",
      errorTitle: "Couldn't save the Azure settings",
      invalidate: [qk.products],
      onSuccess: (updated) => {
        queryClient.setQueryData<ProductDTO[]>(qk.products, (list) =>
          list?.map((p) => (p.id === updated.id ? updated : p)),
        );
        setEditing(false);
      },
    },
  );

  const subscriptionError =
    touched && !GUID.test(subscriptionId.trim()) ? "Enter the subscription ID (a GUID)" : undefined;
  const tenantError =
    tenantId.trim() && !GUID.test(tenantId.trim())
      ? "Tenant ID must be a GUID — or leave it empty"
      : undefined;
  const locationError = touched && !location.trim() ? "Region is required, e.g. eastus2" : undefined;
  const prefixError =
    prefix.trim() && !PREFIX.test(prefix.trim()) ? "1–20 letters, digits, “_” or “-”" : undefined;

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!GUID.test(subscriptionId.trim()) || !location.trim() || tenantError || prefixError) return;
    // PATCH replaces the whole `azure` object, so keep keys this form doesn't edit (e.g. client IDs).
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries(azure))
      if (typeof value === "string" && value) next[key] = value;
    const set = (key: string, value: string) => {
      if (value.trim()) next[key] = value.trim();
      else delete next[key];
    };
    set("subscriptionId", subscriptionId);
    set("tenantId", tenantId);
    set("location", location);
    set("resourceGroupPrefix", prefix);
    save.mutate(next);
  }

  const entries = Object.entries(azure).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "",
  );

  if (!editing) {
    return (
      <div className="space-y-2">
        <dl className="divide-y divide-border/60 rounded-md border border-border">
          {entries.map(([key, value]) => (
            <div key={key} className="grid grid-cols-[11rem_minmax(0,1fr)] gap-3 px-3 py-1.5">
              <dt className="text-muted">{CONFIG_LABELS[key] ?? key}</dt>
              <dd className="truncate font-mono text-xs" title={value}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <Button variant="ghost" size="xs" onClick={() => setEditing(true)}>
          <Pencil />
          Edit Azure settings
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border border-border bg-surface-2/40 p-3"
      noValidate
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Subscription ID" htmlFor={`az-sub-${product.id}`} required error={subscriptionError}>
          <Input
            id={`az-sub-${product.id}`}
            value={subscriptionId}
            onChange={(e) => setSubscriptionId(e.target.value)}
            placeholder="11111111-2222-3333-4444-555555555555"
            className="font-mono text-xs"
            spellCheck={false}
          />
        </Field>
        <Field
          label="Tenant ID"
          htmlFor={`az-tenant-${product.id}`}
          hint="Optional — defaults to the subscription's tenant"
          error={tenantError}
        >
          <Input
            id={`az-tenant-${product.id}`}
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            className="font-mono text-xs"
            spellCheck={false}
          />
        </Field>
        <Field
          label="Region"
          htmlFor={`az-loc-${product.id}`}
          required
          error={locationError}
          hint="Azure region name, e.g. eastus2 or westeurope"
        >
          <Input
            id={`az-loc-${product.id}`}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            spellCheck={false}
          />
        </Field>
        <Field
          label="Resource group prefix"
          htmlFor={`az-rg-${product.id}`}
          hint="Optional — defaults to “rg”"
          error={prefixError}
        >
          <Input
            id={`az-rg-${product.id}`}
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            placeholder="rg"
            spellCheck={false}
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        {azure.subscriptionId ? (
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" variant="primary" size="sm" loading={save.isPending}>
          Save Azure settings
        </Button>
      </div>
    </form>
  );
}

/** Steps, GitHub environment variables (one table per environment) and the setup script. */
export function AzureSetupView({ setup, fileName }: { setup: AzureSetupDTO; fileName: string }) {
  const environments = Object.entries(setup.variables ?? {});
  const steps = setup.steps ?? [];

  if (environments.length === 0 && steps.length === 0) {
    // Prerequisites missing: the script is a single "# …" comment telling the CEO what to do first.
    const message = setup.script.replace(/^#\s*/gm, "").trim() || "The setup script isn't available yet.";
    return (
      <p
        role="status"
        className="rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2 text-amber-100"
      >
        {message}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {steps.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">Steps</p>
          <ol className="list-decimal space-y-1.5 pl-5 text-muted marker:text-subtle">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {environments.length > 0 ? (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
            GitHub environment variables
          </p>
          {environments.map(([environment, variables]) => (
            <div key={environment} className="overflow-hidden rounded-md border border-border">
              <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-1.5">
                <Badge tone={environment.toLowerCase().startsWith("prod") ? "info" : "neutral"}>
                  {environment}
                </Badge>
                <span className="text-xs text-subtle">
                  {Object.keys(variables).length} variable{Object.keys(variables).length === 1 ? "" : "s"}
                </span>
              </div>
              <table className="w-full text-left">
                <caption className="sr-only">GitHub environment variables for {environment}</caption>
                <thead className="sr-only">
                  <tr>
                    <th scope="col">Variable</th>
                    <th scope="col">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {Object.entries(variables).map(([name, value]) => {
                    const placeholder = /^<.*>$/.test(value);
                    return (
                      <tr key={name}>
                        <th
                          scope="row"
                          className="w-1/2 px-3 py-1.5 font-mono text-xs font-normal text-muted"
                        >
                          {name}
                        </th>
                        <td
                          className={
                            placeholder
                              ? "break-all px-3 py-1.5 text-xs italic text-subtle"
                              : "break-all px-3 py-1.5 font-mono text-xs"
                          }
                        >
                          {value}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-2 px-3 py-1.5">
          <span className="font-mono text-xs text-muted">{fileName}</span>
          <div className="flex gap-1.5">
            <CopyButton text={setup.script} size="xs" variant="ghost" label="Copy" />
            <Button
              size="xs"
              variant="ghost"
              onClick={() => downloadText(fileName, setup.script, "text/x-shellscript")}
            >
              <Download />
              Download
            </Button>
          </div>
        </div>
        <pre className="max-h-[28rem] overflow-auto bg-[#060a10] p-3 font-mono text-xs leading-relaxed text-slate-200">
          {setup.script}
        </pre>
      </div>
    </div>
  );
}
