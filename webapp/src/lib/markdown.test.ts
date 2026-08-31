import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("returns an empty string for empty input", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown(null)).toBe("");
    expect(renderMarkdown(undefined)).toBe("");
  });

  it("escapes raw HTML before applying any markdown", () => {
    expect(renderMarkdown("<script>alert(1)</script>")).not.toContain(
      "<script>",
    );
    expect(renderMarkdown("<script>alert(1)</script>")).toContain(
      "&lt;script&gt;",
    );
  });

  it("renders bold, italic and bold-italic", () => {
    expect(renderMarkdown("**bold**")).toContain("<strong>bold</strong>");
    expect(renderMarkdown("*italic*")).toContain("<em>italic</em>");
    expect(renderMarkdown("***both***")).toContain(
      "<strong><em>both</em></strong>",
    );
  });

  it("renders headers, longest first so shorter markers don't misfire", () => {
    expect(renderMarkdown("# H1")).toContain("<h1");
    expect(renderMarkdown("## H2")).toContain("<h2");
    expect(renderMarkdown("### H3")).toContain("<h3");
    expect(renderMarkdown("#### H4")).toContain("<h4");
  });

  it("renders fenced code blocks distinctly from inline code", () => {
    expect(renderMarkdown("```js\nconst x = 1;\n```")).toContain("<pre");
    expect(renderMarkdown("`inline`")).toContain("<code");
    expect(renderMarkdown("`inline`")).not.toContain("<pre");
  });

  it("renders unordered and ordered list items", () => {
    expect(renderMarkdown("- item")).toContain("list-style-type:disc");
    expect(renderMarkdown("1. item")).toContain("list-style-type:decimal");
  });

  it("renders a horizontal rule", () => {
    expect(renderMarkdown("---")).toContain("<hr");
  });

  it("converts remaining newlines to <br/>", () => {
    expect(renderMarkdown("line one\nline two")).toContain(
      "line one<br/>line two",
    );
  });
});


/* Maths in the notes editor. renderMarkdown emits Quill formula blots rather
 * than typesetting anything itself — lib/quillMath.ts turns these into MathML
 * when the document mounts. */
describe("renderMarkdown maths", () => {
  it("emits a formula blot carrying the TeX source", () => {
    const html = renderMarkdown("area is $x^2$ here");
    expect(html).toContain('<span class="ql-formula" data-value="x^2"></span>');
    expect(html).not.toContain("$");
  });

  it("keeps a heading intact when the equation is on the heading line", () => {
    /* The reason equations are tokenised rather than rendered segment by
       segment: the header rule is line-anchored, so a split would leave the
       equation outside the closing tag. */
    const html = renderMarkdown("## Area of $x^2$");
    const heading = /<h2[^>]*>(.*?)<\/h2>/s.exec(html);
    expect(heading).not.toBeNull();
    expect(heading![1]).toContain("ql-formula");
    expect(heading![1]).toContain("Area of");
  });

  it("handles display maths on its own line", () => {
    const html = renderMarkdown("$$\\sqrt{12} = 2\\sqrt{3}$$");
    expect(html).toContain('data-value="\\sqrt{12} = 2\\sqrt{3}"');
  });

  it("leaves currency alone", () => {
    const html = renderMarkdown("it costs $5 and $10 for two");
    expect(html).not.toContain("ql-formula");
    expect(html).toContain("$5 and $10");
  });

  it("escapes quotes and angle brackets in the data-value attribute", () => {
    const html = renderMarkdown('$a<b$ and $x"y$');
    expect(html).toContain('data-value="a&lt;b"');
    expect(html).toContain('data-value="x&quot;y"');
  });

  it("cannot be tricked into swapping in a forged token", () => {
    /* NUL is stripped from the input, so a document containing what looks
       like a placeholder cannot reach the swap-back step as one. */
    const html = renderMarkdown("\u0000MATH0\u0000 and $x$");
    expect(html).toContain('data-value="x"');
    // Exactly one formula: the real one.
    expect(html.match(/ql-formula/g)).toHaveLength(1);
  });

  it("leaves a document with no maths untouched by the maths path", () => {
    const plain = "# Title\n\nSome **bold** text.";
    expect(renderMarkdown(plain)).not.toContain("ql-formula");
  });
});
