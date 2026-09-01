import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  renderMarkdownNodes,
  renderMarkdownSegments,
  renderMathText,
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

  /* Diagrams: the tutor draws into an ```svg fence and the app renders it,
     which is what makes "create me some diagrams" a thing the app can answer
     rather than decline. */
  describe("diagrams", () => {
    const drawing =
      '<svg viewBox="0 0 100 100"><title>A circle</title>' +
      '<circle cx="50" cy="50" r="40" stroke="currentColor" fill="none" /></svg>';

    it("renders an svg fence as a drawing, not as a code listing", () => {
      renderMd(
        "Here it is:\n\n```svg\n" + drawing + "\n```\n\nNotice the radius.",
      );
      expect(out().querySelector("figure svg circle")).toBeInTheDocument();
      expect(out().querySelector("pre")).toBeNull();
      expect(out()).toHaveTextContent("Notice the radius.");
    });

    it("renders an unfenced drawing too — models forget the fence", () => {
      renderMd("Look at this:\n\n" + drawing + "\n\nThe centre is O.");
      expect(out().querySelector("figure svg circle")).toBeInTheDocument();
      expect(out()).toHaveTextContent("Look at this:");
      expect(out()).toHaveTextContent("The centre is O.");
    });

    it("still shows the source when a fence tagged svg is not a drawing", () => {
      renderMd("```svg\nhow do I write an svg?\n```");
      expect(out().querySelector("svg")).toBeNull();
      expect(out().querySelector("pre")).toHaveTextContent(
        "how do I write an svg?",
      );
    });

    it("sanitises the drawing rather than trusting the fence", () => {
      renderMd(
        '```svg\n<svg viewBox="0 0 10 10"><script>alert(1)</script>' +
          '<circle cx="5" cy="5" r="4" onclick="alert(2)" /></svg>\n```',
      );
      expect(out().querySelector("script")).toBeNull();
      expect(out().querySelector("circle")?.getAttribute("onclick")).toBeNull();
      expect(out().querySelector("circle")).toBeInTheDocument();
    });

    it("keeps a broken drawing's source on screen instead of swallowing it", () => {
      renderMd('```svg\n<svg viewBox="0 0 10 10"><circle\n```');
      expect(out().querySelector("svg")).toBeNull();
      expect(out()).toHaveTextContent("<circle");
    });
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

/* The safety net for maths the model forgot to wrap in dollars. A bare
 * `\sqrt{3}` reaching the student as literal backslashes is worse than the
 * plain "√3" it replaced, so the renderer catches the slip — but only for a
 * fixed list of unambiguous commands, never any `\word`. */
describe("splitMath — undelimited TeX", () => {
  const mathIn = (text: string) =>
    splitMath(text)
      .filter((p) => p.kind === "math")
      .map((p) => p.value);

  it("renders a bare command the model forgot to wrap", () => {
    expect(mathIn("that is why the \\sqrt{3} part changed")).toEqual([
      "\\sqrt{3}",
    ]);
  });

  it("keeps a multi-argument command together as one run", () => {
    expect(mathIn("take \\frac{3}{4} of it")).toEqual(["\\frac{3}{4}"]);
  });

  it("handles two bare commands separated by prose", () => {
    expect(mathIn("\\sqrt{3} times \\sqrt{2}")).toEqual([
      "\\sqrt{3}",
      "\\sqrt{2}",
    ]);
  });

  it("leaves a Windows path alone", () => {
    /* The reason this is an allowlist and not `\\[a-z]+`: maths is extracted
       before code spans, so inline code would not protect a path. */
    expect(mathIn("saved to C:\\Users\\nirav\\notes.txt")).toEqual([]);
  });

  it("leaves an unknown command alone", () => {
    expect(mathIn("the \\begin{document} line")).toEqual([]);
  });

  it("does not double-handle a command already inside dollars", () => {
    expect(mathIn("$\\sqrt{3}$")).toEqual(["\\sqrt{3}"]);
  });

  it("still prefers a real delimiter where both could match", () => {
    expect(splitMath("\\[\\sqrt{3}\\]")[0]).toMatchObject({
      value: "\\sqrt{3}",
      display: true,
    });
  });

  it("leaves ordinary prose with no backslashes untouched", () => {
    expect(mathIn("nothing mathematical here at all")).toEqual([]);
  });
});

/* `renderMathText` — the card renderer. Two things have to hold at once: the
 * maths gets typeset, and nothing else about the text changes. Card faces are
 * short, student- or model-written strings full of characters the markdown
 * pass would claim ("1." opens a list, "*" opens emphasis), so the tests that
 * matter most here are the ones asserting that it does NOT do markdown. */
describe("renderMathText", () => {
  const renderCard = (text: string) =>
    render(<div data-testid="out">{renderMathText(text)}</div>);

  it("typesets an equation in a card face", () => {
    renderCard("What is $x^2 + 1$ when x = 2?");
    expect(out().querySelector("span")).toBeInTheDocument();
    /* The delimiters are consumed, not printed — the whole point. */
    expect(out().textContent).not.toContain("$");
  });

  it("typesets a bare command the model forgot to wrap", () => {
    renderCard("Simplify \\frac{3}{4}");
    expect(out().querySelector("span")).toBeInTheDocument();
  });

  it("leaves a card with no maths byte-for-byte as written", () => {
    const text = "Who wrote the Second Treatise of Government?";
    renderCard(text);
    expect(out().textContent).toBe(text);
    /* No element children at all: the string went straight through. */
    expect(out().children).toHaveLength(0);
  });

  it("does not turn a numbered card front into a list", () => {
    const text = "1. Define entropy";
    renderCard(text);
    expect(out().querySelector("ol")).not.toBeInTheDocument();
    expect(out().querySelector("li")).not.toBeInTheDocument();
    expect(out().textContent).toBe(text);
  });

  it("does not wrap a card face in a paragraph", () => {
    renderCard("The capital of Peru");
    expect(out().querySelector("p")).not.toBeInTheDocument();
  });

  it("does not eat an asterisk as emphasis", () => {
    const text = "What does *args* mean in a Python signature?";
    renderCard(text);
    expect(out().querySelector("em")).not.toBeInTheDocument();
    expect(out().textContent).toBe(text);
  });

  it("does not read a code fence or backticks as code", () => {
    const text = "What does `len()` return?";
    renderCard(text);
    expect(out().querySelector("code")).not.toBeInTheDocument();
    expect(out().textContent).toBe(text);
  });

  it("leaves two prices alone", () => {
    /* Inherited from splitMath, and the reason cards can reuse it: a study
       app talks about money, and a card asking about a price must not have
       half its sentence swallowed into an equation. */
    const text = "The deposit is $50 and the balance is $200";
    renderCard(text);
    expect(out().textContent).toBe(text);
    expect(out().children).toHaveLength(0);
  });

  it("renders markup in a card as text, never as elements", () => {
    /* Card text round-trips through the database and is seeded from model
       output over uploaded documents, so it is untrusted. This is the
       property that makes rendering it safe at all. */
    renderCard('<img src=x onerror="alert(1)"> and $y = 2$');
    expect(out().querySelector("img")).not.toBeInTheDocument();
    expect(out().textContent).toContain('<img src=x onerror="alert(1)">');
  });

  it("renders markup as text even when the card has no maths at all", () => {
    const text = "<script>alert(1)</script>";
    renderCard(text);
    expect(out().querySelector("script")).not.toBeInTheDocument();
    expect(out().textContent).toBe(text);
  });
});
