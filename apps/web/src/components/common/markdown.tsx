import Link from "next/link";
import Markdown, { type Components } from "react-markdown";
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

const plugins = [remarkGfm];

/** Renders agent-authored Markdown (PRDs, specs, summaries, chat). Raw HTML is not rendered. */
export function MarkdownView({
  content,
  className,
  compact = false,
}: {
  content: string | null | undefined;
  className?: string;
  compact?: boolean;
}) {
  if (!content || !content.trim()) return null;
  return (
    <div className={cn("markdown", compact && "markdown-compact", className)}>
      <Markdown remarkPlugins={plugins} components={components}>
        {content}
      </Markdown>
    </div>
  );
}
