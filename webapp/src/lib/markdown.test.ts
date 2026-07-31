import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("returns an empty string for empty input", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown(null)).toBe("");
    expect(renderMarkdown(undefined)).toBe("");
  });

  it("escapes raw HTML before applying any markdown", () => {
    expect(renderMarkdown("<script>alert(1)</script>")).not.toContain("<script>");
    expect(renderMarkdown("<script>alert(1)</script>")).toContain("&lt;script&gt;");
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
    expect(renderMarkdown("- item")).toContain('list-style-type:disc');
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
