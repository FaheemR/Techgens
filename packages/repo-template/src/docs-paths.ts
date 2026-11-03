import { createHash } from "node:crypto";
import { slugify, type DocumentKind } from "@techgens/core";

const FOLDERS: Partial<Record<DocumentKind, string>> = {
  charter: "docs/product",
  roadmap: "docs/product",
  research: "docs/product",
  prd: "docs/product",
  ux_spec: "docs/product",
  architecture: "docs/architecture",
  threat_model: "docs/architecture",
  adr: "docs/architecture/adr",
  test_plan: "docs/qa",
  runbook: "docs/runbooks",
  release_notes: "docs/releases",
};

/** Repository folder for a document kind; kinds without a dedicated folder go to `docs/<kind>/`. */
export function docsFolderForDocument(kind: DocumentKind): string {
  return FOLDERS[kind] ?? `docs/${slugify(String(kind)) || "other"}`;
}

/** "ADR 7: Use Postgres" / "0007 Use Postgres" → "0007-use-postgres"; other titles → slug. */
function adrFileName(title: string): string | null {
  const match = /^\s*(?:adr[\s#:_-]*(\d{1,4})|(\d{4}))(?!\d)[\s#:._-]*(.*)$/i.exec(title);
  if (!match) return null;
  const number = (match[1] ?? match[2] ?? "").padStart(4, "0");
  const rest = slugify(match[3] ?? "");
  return rest ? `${number}-${rest}` : number;
}

/**
 * Maps a Techgens document to its path in the product repository, e.g. `prd` "Checkout v2" →
 * `docs/product/checkout-v2.md`. Titles without any slug-able characters fall back to a stable hash.
 */
export function docsPathForDocument(kind: DocumentKind, title: string): string {
  const name =
    (kind === "adr" ? adrFileName(title) : null) ??
    (slugify(title) || `untitled-${createHash("sha256").update(title).digest("hex").slice(0, 8)}`);
  return `${docsFolderForDocument(kind)}/${name}.md`;
}
