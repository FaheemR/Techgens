export interface EntityLink {
  label: string;
  href: string;
}

interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
}

/** Operates on text nodes, never Markdown source, so existing links, code and destinations are untouched. */
export function remarkChatPresentation({
  entityLinks,
  preserveBreaks,
}: {
  entityLinks: readonly EntityLink[];
  preserveBreaks: boolean;
}) {
  const links = new Map(
    entityLinks
      .filter((entity) => entity.label && /^\/(?!\/)/.test(entity.href))
      .map((entity) => [entity.label, entity.href]),
  );
  const names = [...links.keys()]
    .sort((a, b) => b.length - a.length)
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const patterns = [
    ...(preserveBreaks ? ["\\n"] : []),
    ...(names.length ? [`(?<![\\p{L}\\p{N}_])(?:${names.join("|")})(?![\\p{L}\\p{N}_])`] : []),
  ];
  return (tree: MarkdownNode) => {
    if (!patterns.length) return;
    const visit = (node: MarkdownNode) => {
      if (["link", "linkReference", "code", "inlineCode", "html"].includes(node.type) || !node.children)
        return;
      node.children = node.children.flatMap((child): MarkdownNode[] => {
        if (child.type !== "text" || !child.value) {
          visit(child);
          return [child];
        }
        const parts: MarkdownNode[] = [];
        let start = 0;
        for (const match of child.value.matchAll(new RegExp(patterns.join("|"), "gu"))) {
          const index = match.index;
          if (index > start) parts.push({ type: "text", value: child.value.slice(start, index) });
          const href = links.get(match[0]);
          parts.push(
            match[0] === "\n"
              ? { type: "break" }
              : { type: "link", url: href, children: [{ type: "text", value: match[0] }] },
          );
          start = index + match[0].length;
        }
        if (start < child.value.length) parts.push({ type: "text", value: child.value.slice(start) });
        return parts;
      });
    };
    visit(tree);
  };
}
