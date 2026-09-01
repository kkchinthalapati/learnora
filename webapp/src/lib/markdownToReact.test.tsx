import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  renderMarkdownNodes,
  renderMarkdownSegments,
} from "./markdownToReact";
import { splitMath } from "./mathSyntax";

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

  it("renders emphasis nested inside bold, leaving no stray asterisks", () => {
    renderMd("a **failure to recognize the *applicability* of the rule** here");
    const strong = out().querySelector("strong");
    expect(strong).toHaveTextContent(
      "failure to recognize the applicability of the rule",
    );
    expect(strong?.querySelector("em")).toHaveTextContent("applicability");
    expect(out().textContent).not.toContain("*");
  });

  it("does not read spaced arithmetic as emphasis", () => {
    renderMd("compute 2 * 3 * 4 before squaring");
    expect(out().querySelector("em")).toBeNull();
    expect(out().textContent).toContain("2 * 3 * 4");
  });

  it("groups paren-numbered items into an ordered list", () => {
    renderMd("1) first step\n2) second step\n3) third step");
    const ol = out().querySelector("ol");
    expect(ol?.querySelectorAll("li")).toHaveLength(3);
    expect(out().textContent).not.toContain("1)");
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

/* The maths path. `splitMath` is tested directly rather than through the
 * rendered output because KaTeX loads asynchronously — the scanner's decisions
 * are the part that has to be exactly right, and they are synchronous. The
 * currency cases are the reason it exists: a study app talks about money, and
 * eating "$5 and $10" into an equation would be a visible regression. */
describe("splitMath", () => {
  const mathIn = (text: string) =>
    splitMath(text)
      .filter((p) => p.kind === "math")
      .map((p) => p.value);

  it("pulls inline maths out of a sentence", () => {
    expect(mathIn("so $x^2 + 1$ is even")).toEqual(["x^2 + 1"]);
  });

  it("treats $$…$$ and \\[…\\] as display maths", () => {
    expect(splitMath("$$x=1$$")[0]).toMatchObject({
      kind: "math",
      value: "x=1",
      display: true,
    });
    expect(splitMath("\\[y=2\\]")[0]).toMatchObject({
      value: "y=2",
      display: true,
    });
  });

  it("treats \\(…\\) as inline maths", () => {
    expect(splitMath("\\(z=3\\)")[0]).toMatchObject({
      value: "z=3",
      display: false,
    });
  });

  it("leaves currency alone", () => {
    expect(mathIn("it costs $5 and $10 for two")).toEqual([]);
    expect(mathIn("a single $ sign")).toEqual([]);
    expect(mathIn("$5")).toEqual([]);
  });

  it("rejects a body padded with spaces, which is how currency reads", () => {
    expect(mathIn("$ x $")).toEqual([]);
    expect(mathIn("$x $")).toEqual([]);
    expect(mathIn("$ x$")).toEqual([]);
  });

  it("does not let inline maths span a line break", () => {
    expect(mathIn("$a\nb$")).toEqual([]);
  });

  it("emits an escaped \\$ as a literal dollar and not a delimiter", () => {
    const parts = splitMath("\\$5 and \\$10");
    expect(parts.every((p) => p.kind === "text")).toBe(true);
    expect(parts.map((p) => p.value).join("")).toBe("$5 and $10");
  });

  it("keeps surrounding prose in order around an equation", () => {
    expect(splitMath("before $x$ after").map((p) => p.value)).toEqual([
      "before ",
      "x",
      " after",
    ]);
  });

  it("leaves an unclosed delimiter as plain text", () => {
    expect(mathIn("$$x=1")).toEqual([]);
    expect(mathIn("\\[x=1")).toEqual([]);
  });
});

describe("maths rendering", () => {
  it("renders inline maths as an element, not raw dollar signs", () => {
    renderMd("so $x^2$ is even");
    expect(out().textContent).not.toContain("$");
  });

  it("renders a fenced $$ block spanning several lines", () => {
    renderMd("before\n\n$$\nx = 1\n$$\n\nafter");
    expect(out().textContent).toContain("before");
    expect(out().textContent).toContain("after");
    expect(out().textContent).not.toContain("$$");
  });

  it("leaves an unclosed $$ fence as ordinary text", () => {
    renderMd("$$\nx = 1");
    expect(out().textContent).toContain("$$");
  });

  it("still renders markdown around an equation", () => {
    renderMd("**bold** and $x$ and *italic*");
    expect(out().querySelector("strong")).toHaveTextContent("bold");
    expect(out().querySelector("em")).toHaveTextContent("italic");
  });

  it("does not read the stars in an equation as emphasis", () => {
    renderMd("$a^*b^*$");
    expect(out().querySelector("em")).toBeNull();
  });
});
