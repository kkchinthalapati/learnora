import { describe, expect, it } from "vitest";
import {
  IMPORT_CLOZE_BLANK,
  MAX_CARD_SIDE_CHARS,
  clozeToCards,
  decodeEntities,
  htmlToPlainText,
  isAnkiPackageName,
  looksLikeZip,
  parseCardImport,
  parseDelimited,
  titleFromFileName,
  withoutExisting,
} from "./cardImport";

const B = IMPORT_CLOZE_BLANK;

describe("parseCardImport — Quizlet", () => {
  it("reads the default export: tab between, new line after", () => {
    const r = parseCardImport("mitosis\tcell division\nmeiosis\tmakes gametes\n");
    expect(r.source).toBe("quizlet");
    expect(r.fieldSeparator).toBe("\t");
    expect(r.rowSeparator).toBe("\n");
    expect(r.cards).toEqual([
      { front: "mitosis", back: "cell division" },
      { front: "meiosis", back: "makes gametes" },
    ]);
    expect(r.totalRows).toBe(2);
  });

  it("detects comma between and semicolon after", () => {
    const r = parseCardImport("chat,cat;chien,dog;oiseau,bird");
    expect(r.fieldSeparator).toBe(",");
    expect(r.rowSeparator).toBe(";");
    expect(r.cards).toHaveLength(3);
    expect(r.cards[2]).toEqual({ front: "oiseau", back: "bird" });
  });

  it("keeps a semicolon inside a definition when rows end at new lines", () => {
    const r = parseCardImport("ion\tcharged atom; or molecule\nacid\tproton donor");
    expect(r.rowSeparator).toBe("\n");
    expect(r.cards[0].back).toBe("charged atom; or molecule");
  });

  it("only splits a definition at the first separator", () => {
    const r = parseCardImport("list\ta, b, c", { source: "quizlet", fieldSeparator: "\t" });
    expect(r.cards[0]).toEqual({ front: "list", back: "a, b, c" });
  });

  it("uses custom separators, keeping new lines inside definitions", () => {
    const text = "Krebs cycle::step 1\nstep 2\nstep 3%%%ATP::energy currency%%%";
    const r = parseCardImport(text, {
      source: "quizlet",
      fieldSeparator: "::",
      rowSeparator: "%%%",
    });
    expect(r.cards).toEqual([
      { front: "Krebs cycle", back: "step 1\nstep 2\nstep 3" },
      { front: "ATP", back: "energy currency" },
    ]);
  });

  it("folds a line with no separator into the definition above", () => {
    const r = parseCardImport("photosynthesis\tlight reactions\nthen the Calvin cycle\nATP\tenergy");
    expect(r.cards).toEqual([
      { front: "photosynthesis", back: "light reactions\nthen the Calvin cycle" },
      { front: "ATP", back: "energy" },
    ]);
  });

  it("does not treat Quizlet text as HTML", () => {
    const r = parseCardImport("bold tag\t<b>text</b> &amp; more", { source: "quizlet" });
    expect(r.cards[0].back).toBe("<b>text</b> &amp; more");
  });

  it("counts blank sides and exact duplicates", () => {
    const r = parseCardImport("a\t1\n\tno front\nno back\t\na\t1\na\t2\n");
    expect(r.cards).toEqual([
      { front: "a", back: "1" },
      { front: "a", back: "2" },
    ]);
    expect(r.skippedBlank).toBe(2);
    expect(r.duplicates).toBe(1);
  });

  it("handles CRLF line endings and a BOM", () => {
    const r = parseCardImport("\uFEFFone\tuno\r\ntwo\tdos\r\n");
    expect(r.cards).toEqual([
      { front: "one", back: "uno" },
      { front: "two", back: "dos" },
    ]);
  });

  it("preserves TeX and dollar signs exactly", () => {
    const front = String.raw`$\int_0^1 x^2\,dx$`;
    const back = String.raw`\(\frac{1}{3}\) costs \$3 \\ newline`;
    const r = parseCardImport(`${front}\t${back}`);
    expect(r.cards[0]).toEqual({ front, back });
  });

  it("skips a side so long it must be a mis-split", () => {
    const r = parseCardImport(`a\t${"x".repeat(MAX_CARD_SIDE_CHARS + 1)}\nb\tc`);
    expect(r.skippedTooLong).toBe(1);
    expect(r.cards).toEqual([{ front: "b", back: "c" }]);
  });

  it("parses a few thousand cards quickly", () => {
    const text = Array.from({ length: 5000 }, (_, i) => `term ${i}\tdef ${i}`).join("\n");
    const started = performance.now();
    const r = parseCardImport(text);
    expect(r.cards).toHaveLength(5000);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe("parseCardImport — Anki plain text", () => {
  it("reads the headers and ignores tags, deck and notetype columns", () => {
    const text = [
      "#separator:tab",
      "#html:true",
      "#notetype column:1",
      "#deck column:2",
      "#tags column:5",
      "Basic\tBio::Cells\tWhat makes ATP?\tThe <b>mitochondria</b>\tbio cells",
      "Basic\tBio::Cells\tNucleus?\tHolds DNA\textra",
    ].join("\n");
    const r = parseCardImport(text);
    expect(r.source).toBe("anki");
    expect(r.cards).toEqual([
      { front: "What makes ATP?", back: "The mitochondria" },
      { front: "Nucleus?", back: "Holds DNA" },
    ]);
    expect(r.deckName).toBe("Bio / Cells");
  });

  it("ignores extra columns after the back", () => {
    const r = parseCardImport("#separator:tab\nfront\tback\tmy tags\tmore");
    expect(r.cards).toEqual([{ front: "front", back: "back" }]);
  });

  it.each([
    ["comma", ","],
    ["semicolon", ";"],
    ["Comma", ","],
  ])("honours #separator:%s", (name, sep) => {
    const r = parseCardImport(`#separator:${name}\nq1${sep}a1\nq2${sep}a2`);
    expect(r.fieldSeparator).toBe(sep);
    expect(r.cards).toHaveLength(2);
  });

  it("reads quoted fields with separators, new lines and doubled quotes", () => {
    const text =
      '#separator:tab\n#html:false\n"term\twith tab"\t"line one\nline two"\n"say ""hi"""\t"a, b; c"\n';
    const r = parseCardImport(text);
    expect(r.cards).toEqual([
      { front: "term\twith tab", back: "line one\nline two" },
      { front: 'say "hi"', back: "a, b; c" },
    ]);
  });

  it("turns HTML into plain text and decodes entities", () => {
    const text =
      "#separator:tab\n#html:true\nline<br>break<div>next</div>\t&lt;b&gt; is &quot;bold&quot; &amp; x&nbsp;&gt;&nbsp;y &#8594; &#x3b1;";
    const r = parseCardImport(text);
    expect(r.cards[0]).toEqual({
      front: "line\nbreak\nnext",
      back: '<b> is "bold" & x > y → α',
    });
  });

  it("drops scripts and styles with their contents", () => {
    const r = parseCardImport(
      '#html:true\nQ<script>alert(1)</script>\t<style>b{}</style><span style="x">A</span><img src=x onerror=alert(1)>',
    );
    expect(r.cards[0]).toEqual({ front: "Q", back: "A" });
  });

  it("strips sound and images and counts the cards that lost media", () => {
    const text = [
      "#separator:tab",
      "#html:true",
      'hola [sound:hola.mp3]\thello <img src="hi.png">',
      "adios\tgoodbye",
      '<img src="only.png">\tA picture',
      "[sound:x.mp3]\tjust sound",
    ].join("\n");
    const r = parseCardImport(text);
    expect(r.cards).toEqual([
      { front: "hola", back: "hello" },
      { front: "adios", back: "goodbye" },
    ]);
    expect(r.mediaStripped).toBe(1);
    expect(r.skippedBlank).toBe(2);
    expect(r.skippedMediaOnly).toBe(2);
  });

  it("turns cloze notes into one card per number", () => {
    const r = parseCardImport(
      "#separator:tab\n#html:true\n{{c1::Canberra}} is the capital of {{c2::Australia::country}}.\tGeography",
    );
    expect(r.clozeNotes).toBe(1);
    expect(r.cards).toEqual([
      { front: `${B} is the capital of Australia.`, back: "Canberra\n\nGeography" },
      { front: "Canberra is the capital of [country].", back: "Australia\n\nGeography" },
    ]);
  });

  it("leaves `<` and `>` alone when the file says it is not HTML", () => {
    const r = parseCardImport("#separator:tab\n#html:false\na<b\tvector<int>");
    expect(r.cards[0]).toEqual({ front: "a<b", back: "vector<int>" });
  });

  it("keeps TeX intact through HTML conversion", () => {
    const r = parseCardImport(
      String.raw`#html:true` + "\n" + String.raw`\(e^{i\pi}+1=0\)<br>$x$` + "\t" + String.raw`\[\sum_{n=1}^\infty \frac{1}{n^2}\]`,
    );
    expect(r.cards[0]).toEqual({
      front: String.raw`\(e^{i\pi}+1=0\)` + "\n$x$",
      back: String.raw`\[\sum_{n=1}^\infty \frac{1}{n^2}\]`,
    });
  });

  it("treats a later # line as a card, not a header", () => {
    const r = parseCardImport("#separator:tab\n#include <stdio.h>\tC header");
    expect(r.cards[0].front).toBe("#include <stdio.h>");
  });

  it("detects Anki from HTML when the headers were not pasted", () => {
    const r = parseCardImport("Q<br>two\tA");
    expect(r.source).toBe("anki");
    expect(r.cards[0]).toEqual({ front: "Q\ntwo", back: "A" });
  });
});

describe("parseCardImport — generic CSV/TSV", () => {
  it("reads quoted CSV and drops a header row", () => {
    const r = parseCardImport('Front,Back\n"a, b","c ""d"""\nx,y\n', { fileName: "deck.csv" });
    expect(r.source).toBe("csv");
    expect(r.cards).toEqual([
      { front: "a, b", back: 'c "d"' },
      { front: "x", back: "y" },
    ]);
  });

  it("reads a quoted TSV with a multi-line field", () => {
    const r = parseCardImport('q\t"one\ntwo"\nr\ts');
    expect(r.source).toBe("csv");
    expect(r.cards).toEqual([
      { front: "q", back: "one\ntwo" },
      { front: "r", back: "s" },
    ]);
  });

  it("keeps a quote in the middle of a field", () => {
    expect(parseDelimited('5" disk,floppy', ",")).toEqual([['5" disk', "floppy"]]);
  });
});

describe("helpers", () => {
  it("recognises Anki packages", () => {
    expect(isAnkiPackageName("Spanish.apkg")).toBe(true);
    expect(isAnkiPackageName("all.colpkg")).toBe(true);
    expect(isAnkiPackageName("deck.txt")).toBe(false);
    expect(looksLikeZip("PK\u0003\u0004rest")).toBe(true);
  });

  it("makes a title from a file name", () => {
    expect(titleFromFileName("C:\\x\\Bio_unit_2.txt")).toBe("Bio unit 2");
  });

  it("decodes each entity once", () => {
    expect(decodeEntities("&amp;lt; &unknown; &#0;")).toBe("&lt; &unknown; &#0;");
  });

  it("keeps superscripts and lists readable", () => {
    expect(htmlToPlainText("x<sup>2</sup> H<sub>2</sub>O<ul><li>a</li><li>b</li></ul>")).toBe(
      "x^2 H_2O\n- a\n- b",
    );
  });

  it("makes one line per Anki div and keeps a deliberate blank line", () => {
    expect(htmlToPlainText("<div>a</div><div>b</div>")).toBe("a\nb");
    expect(htmlToPlainText("a<br><br>b")).toBe("a\n\nb");
    expect(htmlToPlainText("<div>a<br></div><div>b</div>")).toBe("a\nb");
    expect(htmlToPlainText("<div>a<br><br></div><div>b</div>")).toBe("a\n\nb");
  });

  it("closes a cloze around TeX braces correctly", () => {
    expect(clozeToCards(String.raw`Area is {{c1::\frac{1}{2}bh}}`)).toEqual([
      { front: `Area is ${B}`, back: String.raw`\frac{1}{2}bh` },
    ]);
    expect(clozeToCards("no cloze")).toBeNull();
  });

  it("filters cards already in a set", () => {
    expect(
      withoutExisting(
        [
          { front: "a", back: "1" },
          { front: "b", back: "2" },
        ],
        [{ front: "a ", back: "1" }],
      ),
    ).toEqual([{ front: "b", back: "2" }]);
  });
});
