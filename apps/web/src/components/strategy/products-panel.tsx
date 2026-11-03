"use client";

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ProductDTO } from "@techgens/core";
import { ExternalLink, FolderGit2, GitBranch, Github, Package, Plus } from "lucide-react";
import { MarkdownView } from "@/components/common/markdown";
import { QueryView } from "@/components/common/query-view";
import { GenericStatusBadge } from "@/components/common/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, Sheet } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useQueryParams } from "@/lib/hooks";
import { useApiMutation } from "@/lib/mutations";
import { qk, useProducts } from "@/lib/queries";
import { AzureSection } from "./azure-setup";

interface ProductBody {
  name: string;
  description?: string;
  vision?: string;
  repoOwner?: string;
  repoName?: string;
}

export function ProductsPanel() {
  const { get, set } = useQueryParams();
  const productId = get("product");
  const products = useProducts();
  const [createOpen, setCreateOpen] = useState(false);
  const selected = products.data?.find((p) => p.id === productId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">
          Products own a GitHub repository (bootstrapped from the Techgens template with CI and environments)
          and an Azure Container Apps deployment.
        </p>
        <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus />
          New product
        </Button>
      </div>

      <QueryView
        query={products}
        loading={
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        }
      >
        {(list) =>
          list.length === 0 ? (
            <Card>
              <EmptyState
                icon={Package}
                title="No products yet"
                description="Create a product, or let the Chief of Staff create one when you give a directive for something new."
                action={
                  <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus />
                    New product
                  </Button>
                }
              />
            </Card>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {list.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => set({ product: product.id })}
                    className="flex h-full w-full flex-col rounded-xl border border-border bg-surface/90 p-4 text-left transition-colors hover:border-border-strong hover:bg-surface-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{product.name}</p>
                        <p className="font-mono text-xs text-subtle">{product.slug}</p>
                      </div>
                      <GenericStatusBadge status={product.status} />
                    </div>
                    <p className="mt-2 line-clamp-2 min-h-10 text-sm text-muted">
                      {product.description || "No description yet."}
                    </p>
                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/70 pt-3 text-xs">
                      {product.repoOwner && product.repoName ? (
                        <span className="inline-flex min-w-0 items-center gap-1.5 text-muted">
                          <Github aria-hidden className="size-3.5 shrink-0" />
                          <span className="truncate">
                            {product.repoOwner}/{product.repoName}
                          </span>
                        </span>
                      ) : (
                        <span className="text-amber-300">No repository yet</span>
                      )}
                      <span className="shrink-0 text-subtle">Created {formatDate(product.createdAt)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )
        }
      </QueryView>

      <ProductDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(p) => set({ product: p.id })}
      />
      <ProductSheet product={selected} onClose={() => set({ product: null })} />
    </div>
  );
}

function ProductDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (product: ProductDTO) => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New product"
      size="lg"
      description="Repository details are optional — you can bootstrap the repo later."
    >
      <ProductForm onDone={onClose} onCreated={onCreated} />
    </Dialog>
  );
}

function ProductForm({
  onDone,
  onCreated,
}: {
  onDone: () => void;
  onCreated: (product: ProductDTO) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [vision, setVision] = useState("");
  const [repoOwner, setRepoOwner] = useState("");
  const [repoName, setRepoName] = useState("");
  const [touched, setTouched] = useState(false);

  const create = useApiMutation((body: ProductBody) => api.post<ProductDTO>("/api/products", body), {
    success: (p) => `${p.name} created`,
    errorTitle: "Couldn't create the product",
    invalidate: [qk.products],
    onSuccess: (p) => {
      onDone();
      onCreated(p);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!name.trim()) return;
    const body: ProductBody = { name: name.trim() };
    if (description.trim()) body.description = description.trim();
    if (vision.trim()) body.vision = vision.trim();
    if (repoOwner.trim()) body.repoOwner = repoOwner.trim();
    if (repoName.trim()) body.repoName = repoName.trim();
    create.mutate(body);
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field
        label="Name"
        htmlFor="pr-name"
        required
        error={touched && !name.trim() ? "Name is required" : undefined}
      >
        <Input
          id="pr-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="InvoiceLite"
          autoFocus
        />
      </Field>
      <Field label="Description" htmlFor="pr-description">
        <Textarea
          id="pr-description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Invoicing SaaS for freelancers"
        />
      </Field>
      <Field label="Vision" htmlFor="pr-vision" hint="Markdown supported">
        <Textarea id="pr-vision" rows={3} value={vision} onChange={(e) => setVision(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Repository owner" htmlFor="pr-owner" hint="GitHub org or user">
          <Input
            id="pr-owner"
            value={repoOwner}
            onChange={(e) => setRepoOwner(e.target.value)}
            placeholder="acme-inc"
          />
        </Field>
        <Field label="Repository name" htmlFor="pr-repo">
          <Input
            id="pr-repo"
            value={repoName}
            onChange={(e) => setRepoName(e.target.value)}
            placeholder="invoicelite"
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={create.isPending}>
          Create product
        </Button>
      </div>
    </form>
  );
}

function ProductSheet({ product, onClose }: { product: ProductDTO | null; onClose: () => void }) {
  return (
    <Sheet
      open={product !== null}
      onClose={onClose}
      width="lg"
      title={product?.name ?? "Product"}
      description={product ? <span className="font-mono text-xs">{product.slug}</span> : null}
      headerExtra={product ? <GenericStatusBadge status={product.status} /> : null}
    >
      {product ? <ProductDetail key={product.id} product={product} /> : null}
    </Sheet>
  );
}

function ProductDetail({ product }: { product: ProductDTO }) {
  const queryClient = useQueryClient();
  const [bootstrapOpen, setBootstrapOpen] = useState(false);
  const [createRepo, setCreateRepo] = useState(true);
  const [isPrivate, setIsPrivate] = useState(true);
  const hasRepo = Boolean(product.repoOwner && product.repoName);

  const bootstrap = useApiMutation(
    (body: { createRepo: boolean; private?: boolean }) =>
      api.post<ProductDTO>(`/api/products/${product.id}/bootstrap`, body),
    {
      success: (p) => `Repository ${p.repoOwner ?? ""}/${p.repoName ?? ""} bootstrapped`,
      errorTitle: "Bootstrap failed",
      invalidate: [qk.products],
      onSuccess: (p) => {
        queryClient.setQueryData<ProductDTO[]>(qk.products, (list) =>
          list?.map((x) => (x.id === p.id ? p : x)),
        );
        setBootstrapOpen(false);
      },
    },
  );

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">About</h3>
        <p className="text-sm text-fg">
          {product.description || <span className="text-subtle">No description.</span>}
        </p>
        {product.vision ? (
          <div className="mt-3 rounded-lg border border-border bg-surface-2/40 p-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">Vision</p>
            <MarkdownView content={product.vision} compact />
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-border">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <FolderGit2 aria-hidden className="size-4 text-accent" />
          <h3 className="text-sm font-semibold">GitHub repository</h3>
        </div>
        <div className="space-y-3 p-4 text-sm">
          {hasRepo ? (
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-subtle">Repository</dt>
                <dd className="mt-0.5">
                  {product.repoUrl ? (
                    <a
                      href={product.repoUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-accent hover:underline"
                    >
                      {product.repoOwner}/{product.repoName} <ExternalLink aria-hidden className="size-3" />
                    </a>
                  ) : (
                    `${product.repoOwner}/${product.repoName}`
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-subtle">Branches</dt>
                <dd className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-xs">
                  <span className="inline-flex items-center gap-1">
                    <GitBranch aria-hidden className="size-3" /> {product.defaultBranch}
                  </span>
                  <span className="text-subtle">←</span>
                  <span className="inline-flex items-center gap-1">
                    <GitBranch aria-hidden className="size-3" /> {product.integrationBranch}
                  </span>
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-muted">
              No repository is linked yet. Bootstrapping creates it from the product template (CI,
              environments, branch protection).
            </p>
          )}
          <Button
            variant={product.repoUrl ? "secondary" : "primary"}
            size="sm"
            onClick={() => setBootstrapOpen(true)}
          >
            <Github />
            {product.repoUrl ? "Re-run bootstrap" : "Bootstrap GitHub repo"}
          </Button>
        </div>
      </section>

      <AzureSection product={product} />

      <Dialog
        open={bootstrapOpen}
        onClose={() => setBootstrapOpen(false)}
        size="sm"
        title="Bootstrap GitHub repository"
        description="Applies the Techgens product template: CI workflows, staging/production environments and branch setup."
        footer={
          <>
            <Button variant="ghost" onClick={() => setBootstrapOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={bootstrap.isPending}
              onClick={() =>
                bootstrap.mutate(createRepo ? { createRepo, private: isPrivate } : { createRepo })
              }
            >
              <Github />
              Bootstrap
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={createRepo}
              onChange={(e) => setCreateRepo(e.target.checked)}
              className="mt-0.5 size-4 accent-cyan-400"
            />
            <span>
              <span className="font-medium">Create the repository</span>
              <span className="block text-xs text-muted">
                Uncheck if {hasRepo ? `${product.repoOwner}/${product.repoName}` : "the repository"} already
                exists.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={isPrivate}
              disabled={!createRepo}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="mt-0.5 size-4 accent-cyan-400"
            />
            <span>
              <span className="font-medium">Private repository</span>
              <span className="block text-xs text-muted">Recommended.</span>
            </span>
          </label>
        </div>
      </Dialog>
    </div>
  );
}
