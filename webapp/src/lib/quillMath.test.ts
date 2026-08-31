import { describe, expect, it, beforeAll } from "vitest";
import Quill from "quill";
import { loadMathTypesetter } from "./quillMath";
import { renderMarkdown } from "./markdown";

/* The round trip that matters: a generated note goes markdown → HTML →
 * clipboard.convert() → Delta, and must come back out with its TeX intact.
 * Quill's own formula blot would throw on the first step (it requires
 * window.katex), which is the crash this module replaced. */
function mountQuill() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return new Quill(host, { formats: ["bold", "header", "formula"] });
}

describe("quill maths", () => {
  beforeAll(async () => {
    await loadMathTypesetter();
  });

  it("parses a generated note's formula without throwing", () => {
    const quill = mountQuill();
    const html = renderMarkdown("Simplify $\\sqrt{12}$ fully.");
    expect(() => {
      quill.setContents(quill.clipboard.convert({ html }), "silent");
    }).not.toThrow();
  });

  it("keeps the TeX in the delta so it survives a save", () => {
    const quill = mountQuill();
    const html = renderMarkdown("Simplify $\\sqrt{12}$ fully.");
    quill.setContents(quill.clipboard.convert({ html }), "silent");
    const formulas = quill
      .getContents()
      .ops.map((op) => (op.insert as { formula?: string })?.formula)
      .filter(Boolean);
    expect(formulas).toEqual(["\\sqrt{12}"]);
  });

  it("typesets to MathML rather than styled HTML, so the CSP cannot strip it", () => {
    const quill = mountQuill();
    const html = renderMarkdown("$x^2$");
    quill.setContents(quill.clipboard.convert({ html }), "silent");
    const node = quill.root.querySelector("span.ql-formula");
    expect(node).not.toBeNull();
    expect(node!.querySelector("math")).not.toBeNull();
    expect(node!.querySelectorAll("[style]").length).toBe(0);
  });
});
