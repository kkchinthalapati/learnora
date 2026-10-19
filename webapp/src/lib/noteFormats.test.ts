import { describe, expect, it } from "vitest";
import { richenNoteHtml, sanitizeDiagram } from "./noteFormats";

describe("richenNoteHtml", () => {
  it("turns labelled blockquotes into callouts and drops the label", () => {
    const html = `<blockquote style="x"><strong>Key idea:</strong> Rate rises with heat.</blockquote>`;
    expect(richenNoteHtml(html)).toBe(`<p class="ln-callout-key">Rate rises with heat.</p>`);
  });

  it("maps definitions and formulas to the definition callout", () => {
    expect(richenNoteHtml(`<blockquote><strong>Formula:</strong> v = k[S]</blockquote>`)).toContain(
      `class="ln-callout-def"`,
    );
  });

  it("leaves an unlabelled blockquote alone", () => {
    const html = `<blockquote>Just a quote</blockquote>`;
    expect(richenNoteHtml(html)).toBe(html);
  });

  it("turns ==words== into a key-idea highlight", () => {
    expect(richenNoteHtml("<p>The ==active site== binds.</p>")).toBe(
      `<p>The <span class="ln-mark-key">active site</span> binds.</p>`,
    );
  });

  it("highlights words that carry inline emphasis, as at the start of a bullet", () => {
    expect(
      richenNoteHtml("<ul><li>==<strong>Separate Legal Personality</strong>== – the concept</li></ul>"),
    ).toBe(
      `<ul><li><span class="ln-mark-key"><strong>Separate Legal Personality</strong></span> – the concept</li></ul>`,
    );
  });
});

describe("sanitizeDiagram", () => {
  it("removes scripts, event handlers and links from a drawing", () => {
    const clean = sanitizeDiagram(
      `<svg viewBox="0 0 10 10" onload="alert(1)"><script>alert(2)</script><a href="https://x.example"><circle r="4"/></a></svg>`,
    );
    expect(clean).not.toContain("script");
    expect(clean).not.toContain("onload");
    expect(clean).not.toContain("href");
    expect(clean).toContain("circle");
  });
});
