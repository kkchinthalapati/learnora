import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { extractSvgSource, parseDiagramSvg } from "./diagramSvg";

function renderSvg(source: string) {
  const { node, error } = parseDiagramSvg(source);
  const view = render(<div data-testid="out">{node}</div>);
  return { view, error, root: screen.getByTestId("out") };
}

const svg = (body: string, attrs = 'viewBox="0 0 100 100"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

describe("parseDiagramSvg", () => {
  it("renders the shapes a diagram is made of", () => {
    const { root } = renderSvg(
      svg(
        '<circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" />' +
          '<line x1="10" y1="50" x2="90" y2="50" stroke="currentColor" />' +
          '<path d="M10 10 L90 90" />' +
          '<polygon points="0,0 10,0 5,10" />' +
          '<text x="50" y="20" text-anchor="middle">O</text>',
      ),
    );
    expect(root.querySelector("circle")).toHaveAttribute("r", "40");
    expect(root.querySelector("line")).toHaveAttribute("x1", "10");
    expect(root.querySelector("path")).toHaveAttribute("d", "M10 10 L90 90");
    expect(root.querySelector("polygon")).toBeInTheDocument();
    expect(root.querySelector("text")).toHaveTextContent("O");
  });

  it("keeps the attributes a drawing needs, in the spellings the DOM uses", () => {
    const { root } = renderSvg(
      svg(
        '<rect x="1" y="2" width="10" height="8" stroke-width="2" ' +
          'stroke-linecap="round" fill-opacity="0.5" font-size="15" />',
      ),
    );
    const rect = root.querySelector("rect");
    expect(rect).toHaveAttribute("stroke-width", "2");
    expect(rect).toHaveAttribute("stroke-linecap", "round");
    expect(rect).toHaveAttribute("fill-opacity", "0.5");
    expect(rect).toHaveAttribute("font-size", "15");
  });

  it("renders markers and gradients so arrowheads survive", () => {
    const { root } = renderSvg(
      svg(
        '<defs><marker id="a" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">' +
          '<path d="M0 0 L6 3 L0 6 z" /></marker>' +
          '<linearGradient id="g"><stop offset="0%" stop-color="#2563EB" /></linearGradient></defs>' +
          '<line x1="0" y1="0" x2="9" y2="9" marker-end="url(#a)" />',
      ),
    );
    expect(root.querySelector("marker")).toHaveAttribute("markerWidth", "6");
    expect(root.querySelector("stop")).toHaveAttribute("stop-color", "#2563EB");
    expect(root.querySelector("line")).toHaveAttribute("marker-end", "url(#a)");
  });

  /* The whole reason this parser exists rather than an innerHTML assignment:
     every one of these is untrusted model output. */
  describe("refuses everything that is not drawing", () => {
    it("drops a script element and its contents", () => {
      const { root } = renderSvg(
        svg('<script>alert(1)</script><circle cx="5" cy="5" r="1" />'),
      );
      expect(root.querySelector("script")).toBeNull();
      expect(root.textContent).not.toContain("alert");
      expect(root.querySelector("circle")).toBeInTheDocument();
    });

    it("drops event-handler attributes", () => {
      const { root } = renderSvg(
        svg(
          '<circle cx="5" cy="5" r="1" onload="alert(1)" onclick="alert(2)" />',
        ),
      );
      const circle = root.querySelector("circle");
      expect(circle?.getAttribute("onload")).toBeNull();
      expect(circle?.getAttribute("onclick")).toBeNull();
    });

    it("drops foreignObject, image, use and links", () => {
      const { root } = renderSvg(
        svg(
          "<foreignObject><b>html</b></foreignObject>" +
            '<image href="https://example.com/x.png" />' +
            '<use href="#x" />' +
            '<a href="javascript:alert(1)"><circle cx="1" cy="1" r="1" /></a>',
        ),
      );
      expect(root.querySelector("foreignObject")).toBeNull();
      expect(root.querySelector("image")).toBeNull();
      expect(root.querySelector("use")).toBeNull();
      expect(root.querySelector("a")).toBeNull();
      expect(root.innerHTML).not.toContain("javascript:");
    });

    it("drops a javascript: value and an external url() reference", () => {
      const { root } = renderSvg(
        svg(
          '<rect fill="url(https://evil.test/x)" clip-path="url(#ok)" x="0" y="0" width="1" height="1" />',
        ),
      );
      const rect = root.querySelector("rect");
      expect(rect?.getAttribute("fill")).toBeNull();
      expect(rect).toHaveAttribute("clip-path", "url(#ok)");
    });

    it("filters unsafe declarations out of a style attribute", () => {
      const { root } = renderSvg(
        svg(
          '<circle cx="5" cy="5" r="1" style="fill: red; background: url(https://evil.test/x)" />',
        ),
      );
      const circle = root.querySelector("circle");
      expect(circle?.getAttribute("style")).toContain("red");
      expect(circle?.getAttribute("style")).not.toContain("evil.test");
    });

    it("refuses a doctype or entity declaration outright", () => {
      const { node, error } = parseDiagramSvg(
        '<!DOCTYPE svg [<!ENTITY x "boom">]><svg viewBox="0 0 1 1"></svg>',
      );
      expect(node).toBeNull();
      expect(error).toBeTruthy();
    });

    it("refuses anything that is not an svg root", () => {
      expect(parseDiagramSvg("<div>hello</div>").node).toBeNull();
      expect(parseDiagramSvg("just prose").node).toBeNull();
      expect(parseDiagramSvg("").node).toBeNull();
    });

    it("refuses malformed markup rather than rendering half of it", () => {
      const { node, error } = parseDiagramSvg('<svg viewBox="0 0 1 1"><circle');
      expect(node).toBeNull();
      expect(error).toBe("This diagram is not valid SVG.");
    });
  });

  it("hands sizing to CSS: no width or height, always a viewBox", () => {
    const { root } = renderSvg(
      svg('<circle cx="1" cy="1" r="1" />', 'width="640" height="400"'),
    );
    const el = root.querySelector("svg");
    expect(el).toHaveAttribute("viewBox", "0 0 640 400");
    expect(el?.getAttribute("width")).toBeNull();
    expect(el?.getAttribute("height")).toBeNull();
  });

  it("names the figure from its <title>, falling back to the caption", () => {
    const withTitle = parseDiagramSvg(svg("<title>Circle theorems</title>"));
    expect(withTitle.title).toBe("Circle theorems");

    const { root } = renderSvg(svg("<title>Circle theorems</title>"));
    expect(root.querySelector("svg")).toHaveAttribute(
      "aria-label",
      "Circle theorems",
    );

    const { node } = parseDiagramSvg(svg('<circle cx="1" cy="1" r="1" />'), {
      ariaLabel: "Fallback name",
    });
    render(<div data-testid="fallback">{node}</div>);
    expect(screen.getByTestId("fallback").querySelector("svg")).toHaveAttribute(
      "aria-label",
      "Fallback name",
    );
  });
});

describe("extractSvgSource", () => {
  it("finds the drawing inside a fenced reply", () => {
    const reply =
      'Here it is:\n\n```svg\n<svg viewBox="0 0 1 1"></svg>\n```\n\nNotice the radius.';
    expect(extractSvgSource(reply)).toBe('<svg viewBox="0 0 1 1"></svg>');
  });

  it("returns null when the reply has no drawing", () => {
    expect(extractSvgSource("no picture here")).toBeNull();
  });
});
