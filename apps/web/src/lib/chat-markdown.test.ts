import { describe, expect, it } from "vitest";
import { remarkChatPresentation } from "./chat-markdown";

type Node = { type: string; value?: string; url?: string; children?: Node[] };
const text = (value: string): Node => ({ type: "text", value });
const link = (value: string, url = "/agents/morgan"): Node => ({
  type: "link",
  url,
  children: [text(value)],
});
const paragraph = (...children: Node[]): Node => ({ type: "paragraph", children });
const root = (...children: Node[]): Node => ({ type: "root", children });
const transform = (tree: Node, preserveBreaks = false) =>
  remarkChatPresentation({
    entityLinks: [
      { label: "Morgan", href: "/agents/morgan" },
      { label: "Morgan Lee", href: "/agents/morgan-lee" },
    ],
    preserveBreaks,
  })(tree);

describe("chat Markdown AST presentation", () => {
  it("links whole entity names longest first without partial or Unicode word matches", () => {
    const tree = root(
      paragraph(text("Morgan Lee, Morgan! Morgana _Morgan Morgan_ 2Morgan Morgan2 éMorgan Morgané")),
    );
    transform(tree);
    expect(tree).toEqual(
      root(
        paragraph(
          link("Morgan Lee", "/agents/morgan-lee"),
          text(", "),
          link("Morgan"),
          text("! Morgana _Morgan Morgan_ 2Morgan Morgan2 éMorgan Morgané"),
        ),
      ),
    );
  });

  it("preserves existing links reference links code HTML and their destinations", () => {
    const protectedNodes: Node[] = [
      { type: "link", url: "https://example.test/Morgan", children: [text("Morgan\nLee")] },
      { type: "linkReference", children: [text("Morgan")] },
      { type: "inlineCode", value: "Morgan\nLee" },
      { type: "code", value: "Morgan\nLee" },
      { type: "html", value: "<span>Morgan\nLee</span>" },
    ];
    const before = structuredClone(protectedNodes);
    const tree = root(paragraph(...protectedNodes, text(" Morgan")));
    transform(tree, true);
    expect(tree).toEqual(root(paragraph(...before, text(" "), link("Morgan"))));
  });

  it("preserves requested soft breaks and leaves natural breaks otherwise", () => {
    const tree = root(paragraph(text("Morgan\n\nNext line\n")));
    transform(tree, true);
    expect(tree).toEqual(
      root(
        paragraph(link("Morgan"), { type: "break" }, { type: "break" }, text("Next line"), { type: "break" }),
      ),
    );
    const natural = root(paragraph(text("Morgan\nNext line")));
    transform(natural);
    expect(natural).toEqual(root(paragraph(link("Morgan"), text("\nNext line"))));
  });

  it("escapes regex names and rejects external protocol-relative and empty links", () => {
    const tree = root(paragraph(text("C++ [Ops] Morgan Lee Empty")));
    remarkChatPresentation({
      entityLinks: [
        { label: "C++", href: "/projects/cpp" },
        { label: "[Ops]", href: "/teams/ops" },
        { label: "Morgan", href: "https://example.test" },
        { label: "Lee", href: "//example.test" },
        { label: "Empty", href: "" },
        { label: "", href: "/empty" },
      ],
      preserveBreaks: false,
    })(tree);
    expect(tree).toEqual(
      root(
        paragraph(
          link("C++", "/projects/cpp"),
          text(" "),
          link("[Ops]", "/teams/ops"),
          text(" Morgan Lee Empty"),
        ),
      ),
    );
  });

  it("handles break-only transformation and leaves an empty configuration unchanged", () => {
    const tree = root(paragraph(text("\nPlain\n"), text("")));
    remarkChatPresentation({ entityLinks: [], preserveBreaks: true })(tree);
    expect(tree).toEqual(root(paragraph({ type: "break" }, text("Plain"), { type: "break" }, text(""))));
    const untouched = root(paragraph(text("Morgan\nPlain")));
    const before = structuredClone(untouched);
    remarkChatPresentation({ entityLinks: [], preserveBreaks: false })(untouched);
    expect(untouched).toEqual(before);
  });
});
