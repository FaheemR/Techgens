import type { RoleDefinition } from "@techgens/core";

/** Input for {@link renderProductRepo}: everything needed to bootstrap a product repository. */
export interface ProductRepoInput {
  productName: string;
  /** Kebab-case slug (see `slugify` in @techgens/core); names the npm package, the azd project and Azure resources. */
  productSlug: string;
  description: string;
  owner: string;
  repo: string;
  /** Production branch (e.g. "main"); pushes deploy to the `production` environment after CEO approval. */
  defaultBranch: string;
  /** Integration branch (e.g. "develop"); feature pull requests target it and pushes deploy to `staging`. */
  integrationBranch: string;
  companyName: string;
  /** Company constitution (Markdown) rendered into `.github/copilot-instructions.md` and the custom agent files. */
  policies: string;
  /** Role definitions (see @techgens/agents); every `executor: "cloud-agent"` role gets `.github/agents/<id>.agent.md`. */
  roles: readonly RoleDefinition[];
  azure?: { location?: string };
}

export interface RepoFile {
  path: string;
  content: string;
}

/** A GitHub issue label (colour is 6-digit hex without `#`). */
export interface ProductLabel {
  name: string;
  color: string;
  description: string;
}
