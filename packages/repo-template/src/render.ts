import { buildRenderContext } from "./context";
import { appFiles } from "./files/app";
import { azdFiles } from "./files/azd";
import { resourcesBicepFile } from "./files/bicep-resources";
import { containerFiles } from "./files/container";
import { deployWorkflowFile } from "./files/deploy";
import { docsFiles } from "./files/docs";
import { githubFiles } from "./files/github";
import { repoFiles } from "./files/repo";
import { workflowFiles } from "./files/workflows";
import type { ProductRepoInput, RepoFile } from "./types";

/**
 * Renders the files of a new product repository: a minimal, working Node.js + TypeScript web service with tests,
 * a container image, Copilot cloud agent configuration, CI/CodeQL/deploy workflows and azd + Bicep infrastructure for
 * Azure Container Apps. Throws a `DomainError` ("invalid") when the input cannot produce a valid repository.
 */
export function renderProductRepo(input: ProductRepoInput): RepoFile[] {
  const ctx = buildRenderContext(input);
  const files: RepoFile[] = [
    ...repoFiles(ctx),
    ...appFiles(ctx),
    ...containerFiles(ctx),
    ...githubFiles(ctx),
    ...workflowFiles(ctx),
    deployWorkflowFile(ctx),
    ...azdFiles(ctx),
    resourcesBicepFile(ctx),
    ...docsFiles(ctx),
  ];
  const seen = new Set<string>();
  for (const file of files) {
    if (seen.has(file.path)) throw new Error(`renderProductRepo: duplicate path ${file.path}`);
    seen.add(file.path);
  }
  return files.map((file) => ({
    path: file.path,
    content: file.content.endsWith("\n") ? file.content : `${file.content}\n`,
  }));
}
