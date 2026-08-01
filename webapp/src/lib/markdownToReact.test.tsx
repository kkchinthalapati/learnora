import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderMarkdownNodes, renderMarkdownSegments } from "./markdownToReact";

function renderMd(markdown: string) {
  return render(<div data-testid="out">{renderMarkdownNodes(markdown)}</div>);
}

const out = () => screen.getByTestId("out");

describe("renderMarkdownNodes", () => {
  it("renders paragraphs, keeping a single newline as a line break", () => {
    renderMd("first line\nsecond line");
    const p = out().querySelector("p");
    expect(p?.querySelector("br")).toBeInTheDocument();
    expect(p).toHaveTextContent("first linesecond line");
  });

  it("splits paragraphs on a blank line", () => {
    renderMd("one\n\ntwo");
    expect(out().querySelectorAll("p")).toHaveLength(2);
  });

  it("renders all four heading levels", () => {
    renderMd("# H1\n\n## H2\n\n### H3\n\n#### H4");
    expect(
      screen.getByRole("heading", { level: 1, name: "H1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "H2" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "H3" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 4, name: "H4" }),
    ).toBeInTheDocument();
  });

  it("renders bold, italic and both together", () => {
    renderMd("**bold** *italic* ***both***");
    expect(out().querySelector("strong")).toHaveTextContent("bold");
    expect(out().querySelector("em")).toHaveTextContent("italic");
    const nested = out().querySelector("strong em");
    expect(nested).toHaveTextContent("both");
  });

  it("renders inline code and fenced blocks", () => {
    renderMd("use `npm run dev`\n\n```js\nconst a = 1;\n```");
    expect(out().querySelector("code")).toHaveTextContent("npm run dev");
    expect(out().querySelector("pre code")).toHaveTextContent("const a = 1;");
  });

  it("leaves markdown inside a fence literal", () => {
    renderMd("```\n**not bold**\n```");
    expect(out().querySelector("pre")).toHaveTextContent("**not bold**");
    expect(out().querySelector("pre strong")).toBeNull();
  });

  /* The vanilla emitted bare <li> elements with an inline list-style and no
     list parent — invalid HTML, and a screen reader announces no list at all,
     so "3 items" never reached the student. */
  it("wraps consecutive bullets in a real list", () => {
    renderMd("- one\n- two\n- three");
    const list = screen.getByRole("list");
    expect(list.tagName).toBe("UL");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("wraps numbered items in an ordered list", () => {
    renderMd("1. one\n2. two");
    expect(screen.getByRole("list").tagName).toBe("OL");
  });

  it("starts a new list when the marker type changes", () => {
    renderMd("- bullet\n1. numbered");
    const lists = screen.getAllByRole("list");
    expect(lists.map((l) => l.tagName)).toEqual(["UL", "OL"]);
  });

  it("renders blockquotes and horizontal rules", () => {
    renderMd("> quoted\n\n---");
    expect(out().querySelector("blockquote")).toHaveTextContent("quoted");
    expect(out().querySelector("hr")).toBeInTheDocument();
  });

  it("applies inline formatting inside headings and list items", () => {
    renderMd("## A **bold** heading\n\n- an *italic* item");
    expect(out().querySelector("h2 strong")).toHaveTextContent("bold");
    expect(out().querySelector("li em")).toHaveTextContent("italic");
  });

  /* The whole reason this exists rather than `dangerouslySetInnerHTML` +
     renderMarkdown: escaping is structural. Model output is untrusted, and no
     ordering mistake in a regex pile can turn it into markup. */
  it("cannot produce markup from model text", () => {
    renderMd('<img src=x onerror="alert(1)"> <script>alert(2)</script>');
    expect(out().querySelector("img")).toBeNull();
    expect(out().querySelector("script")).toBeNull();
    expect(out()).toHaveTextContent("<img src=x");
  });

  it("does not treat HTML inside a fence as markup either", () => {
    renderMd("```html\n<script>alert(1)</script>\n```");
    expect(out().querySelector("script")).toBeNull();
    expect(out().querySelector("pre")).toHaveTextContent(
      "<script>alert(1)</script>",
    );
  });

  it("renders nothing for empty input", () => {
    renderMd("");
    expect(out()).toBeEmptyDOMElement();
  });
});

describe("renderMarkdownSegments", () => {
  it("keeps widget nodes in position between text runs", () => {
    render(
      <div data-testid="out">
        {renderMarkdownSegments([
          { kind: "text", text: "Done — " },
          { kind: "node", node: <span key="w">WIDGET</span> },
          { kind: "text", text: " enjoy!" },
        ])}
      </div>,
    );

    expect(out()).toHaveTextContent("Done — WIDGET enjoy!");
    expect(screen.getByText("WIDGET").tagName).toBe("SPAN");
  });

  it("renders markdown in the text runs around a widget", () => {
    render(
      <div data-testid="out">
        {renderMarkdownSegments([
          { kind: "text", text: "**before**" },
          { kind: "node", node: <span key="w">W</span> },
        ])}
      </div>,
    );
    expect(out().querySelector("strong")).toHaveTextContent("before");
  });
});
