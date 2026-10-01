import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/* jsdom cannot lay out an SVG (no getBBox), so mermaid itself is stood in
   for. What is under test is everything around it: what it is configured
   with, what reaches it, how its output is sanitised and shown, and what the
   student sees when it fails. The real library is exercised in Chromium by
   tests/e2e/chat-diagram.spec.ts. */
const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  parse: vi.fn(),
  render: vi.fn(),
}));
vi.mock("mermaid", () => ({ default: mermaid }));

/* Re-imported per test: the component keeps a module-level cache of
   finished drawings, which must not carry one test's result into the next. */
let MermaidDiagram: typeof import("./MermaidDiagram").MermaidDiagram;
let MAX_DIAGRAM_CHARS: number;

const HOSTILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320.5 180" width="100%" style="max-width: 320px;">
  <style>#learnora-diagram-1 .node rect { fill: #eee; }</style>
  <script>alert("svg")</script>
  <g class="node" onclick="alert('click')"><rect width="10" height="10"></rect><text>Photosynthesis</text></g>
  <a href="javascript:alert('link')"><text>Link</text></a>
  <foreignObject width="100" height="20"><div xmlns="http://www.w3.org/1999/xhtml"><span onmouseover="alert(1)">Light</span><img src="x" onerror="alert(2)"></div></foreignObject>
</svg>`;

const FLOW = "flowchart TD\n  A[Light] --> B[Glucose]";

let blobs: Blob[] = [];

beforeEach(async () => {
  vi.resetModules();
  ({ MermaidDiagram, MAX_DIAGRAM_CHARS } = await import("./MermaidDiagram"));
  blobs = [];
  mermaid.initialize.mockReset();
  mermaid.parse.mockReset().mockResolvedValue({ diagramType: "flowchart" });
  mermaid.render.mockReset().mockResolvedValue({ svg: HOSTILE_SVG });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: (blob: Blob) => {
      blobs.push(blob);
      return `blob:learnora/diagram-${blobs.length}`;
    },
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => {} });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  document.body.classList.remove("dark-theme");
  vi.restoreAllMocks();
});

describe("MermaidDiagram", () => {
  it("draws the diagram as an image, never as markup in the page", async () => {
    const { container } = render(<MermaidDiagram code={FLOW} />);

    const img = await screen.findByRole("img", { name: /A flowchart/ });
    expect(img).toHaveAttribute("src", "blob:learnora/diagram-1");
    expect(blobs[0].type).toBe("image/svg+xml");
    // Sized from the viewBox, so the image has a natural size to scale from.
    expect(img).toHaveAttribute("width", "321");
    expect(img).toHaveAttribute("height", "180");
    // Nothing from the SVG was put into this document.
    expect(container.querySelector("svg, script, foreignObject")).toBeNull();
    // The words stay available to a screen reader and for copying.
    expect(screen.getByText("Diagram text")).toBeInTheDocument();
    expect(container.querySelector("details code")?.textContent).toBe(FLOW);
  });

  it("strips script, event handlers, javascript: links and HTML, and keeps the drawing", async () => {
    render(<MermaidDiagram code={FLOW} />);
    await screen.findByRole("img", { name: /A flowchart/ });
    const svg = await blobs[0].text();

    expect(svg).not.toMatch(/<script/i);
    expect(svg).not.toMatch(/\bon(?:click|mouseover|error)=/i);
    expect(svg).not.toMatch(/javascript:/i);
    // SVG only: HTML smuggled in a <foreignObject> goes, whole.
    expect(svg).not.toMatch(/foreignObject|<div|<img/i);
    expect(svg).toContain("Photosynthesis");
    expect(svg).toMatch(/<style>/);
    expect(svg).not.toMatch(/max-width/);
  });

  it("runs mermaid strictly, and never lets the diagram reconfigure it", async () => {
    render(
      <MermaidDiagram
        code={'%%{init: {"securityLevel": "loose", "themeCSS": "x"}}%%\n' + FLOW}
      />,
    );
    await screen.findByRole("img", { name: /A flowchart/ });

    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        securityLevel: "strict",
        startOnLoad: false,
        htmlLabels: false,
      }),
    );
    expect(mermaid.parse).toHaveBeenCalledWith(FLOW);
    expect(mermaid.render.mock.calls[0][1]).toBe(FLOW);
  });

  it("follows the app's dark theme", async () => {
    document.body.classList.add("dark-theme");
    render(<MermaidDiagram code={FLOW} />);
    await screen.findByRole("img", { name: /A flowchart/ });
    expect(mermaid.initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({ theme: "dark" }),
    );

    document.body.classList.remove("dark-theme");
    await waitFor(() =>
      expect(mermaid.initialize).toHaveBeenLastCalledWith(
        expect.objectContaining({ theme: "default" }),
      ),
    );
  });

  it("shows the source with a note when the diagram will not parse", async () => {
    mermaid.parse.mockRejectedValue(new Error("Parse error on line 2"));
    const { container } = render(<MermaidDiagram code={"flowchart TD\n  A -->"} />);

    expect(await screen.findByRole("note")).toHaveTextContent(
      "Couldn't draw this diagram",
    );
    expect(container.querySelector("pre code")?.textContent).toBe("flowchart TD\n  A -->");
    expect(screen.queryByRole("img")).toBeNull();
    expect(mermaid.render).not.toHaveBeenCalled();
  });

  it("draws a diagram once, however often the reply around it re-renders", async () => {
    const code = "flowchart LR\n  Q[Once] --> R[Only]";
    const first = render(<MermaidDiagram code={code} />);
    await screen.findByRole("img", { name: /A flowchart/ });
    first.unmount();

    // A remount — what every chat re-render does — comes straight back.
    render(<MermaidDiagram code={code} />);
    expect(screen.getByRole("img", { name: /A flowchart/ })).toBeInTheDocument();
    expect(mermaid.render).toHaveBeenCalledTimes(1);
  });

  it("does not hand mermaid a diagram past the size ceiling", async () => {
    render(<MermaidDiagram code={`flowchart TD\n${"A-->B\n".repeat(MAX_DIAGRAM_CHARS)}`} />);
    expect(await screen.findByRole("note")).toBeInTheDocument();
    expect(mermaid.parse).not.toHaveBeenCalled();
  });
});
