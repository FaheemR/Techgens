import Link from "next/link";
import Markdown, { type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

const components: Components = {
  a: ({ href, title, children }) => {
    if (href && href.startsWith("/")) {
      return (
        <Link href={href} title={title}>
          {children}
        </Link>
      );
    }
    return (
      <a href={href} title={title} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  },
};

/** The slice of the mdast tree the heading plugin needs. */
interface MdNode {
  type: string;
  depth?: number;
  value?: string;
  children?: MdNode[];
  data?: { hProperties?: Record<string, unknown> };
}

function nodeText(node: MdNode): string {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(nodeText).join("");
}

function normalizeTitle(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Fits agent-authored headings into the page outline: drops a leading H1 that repeats the page title, then shifts
 * every heading down by `offset` levels (capped at h6). Headings keep the look of their authored level via `md-hN`.
 */
function remarkHeadings({ offset, dropTitle }: { offset: number; dropTitle: string | undefined }) {
  return (tree: MdNode) => {
    const children = tree.children ?? [];
    if (dropTitle) {
      const index = children.findIndex((node) => node.type !== "html" && node.type !== "definition");
      const lead = children[index];
      if (
        lead?.type === "heading" &&
        lead.depth === 1 &&
        normalizeTitle(nodeText(lead)) === normalizeTitle(dropTitle)
      ) {
        children.splice(index, 1);
      }
    }
    const visit = (node: MdNode) => {
      if (node.type === "heading" && node.depth) {
        node.data = {
          ...node.data,
          hProperties: { ...node.data?.hProperties, className: [`md-h${node.depth}`] },
        };
        node.depth = Math.min(6, node.depth + offset);
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

/** Renders agent-authored Markdown (PRDs, specs, summaries, chat). Raw HTML is not rendered. */
export function MarkdownView({
  content,
  className,
  compact = false,
  headingOffset = 0,
  dropTitle,
}: {
  content: string | null | undefined;
  className?: string;
  compact?: boolean;
  /** Shift h1…h6 down by this many levels (capped at h6) so the content nests under the page's own headings. */
  headingOffset?: number;
  /** Skip a leading H1 whose text equals this (case- and whitespace-insensitive), e.g. the page title. */
  dropTitle?: string | undefined;
}) {
  if (!content || !content.trim()) return null;
  const offset = Math.max(0, Math.trunc(headingOffset));
  const remarkPlugins = [remarkGfm, [remarkHeadings, { offset, dropTitle }]] as Options["remarkPlugins"];
  return (
    <div className={cn("markdown", compact && "markdown-compact", className)}>
      <Markdown remarkPlugins={remarkPlugins} components={components}>
        {content}
      </Markdown>
    </div>
  );
}
