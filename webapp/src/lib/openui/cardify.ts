/* Turns the labelled lines a note already has into Callout cards, without
 * asking the model for anything.
 *
 * A model writes "Definition: …", "Key idea: …", "Common mistake: …" and
 * "Formula: …" as ordinary paragraphs whether or not it was asked for cards.
 * Those lines are the ones a student should see boxed, so this finds them and
 * writes the same OpenUI block the model would have written. It runs when a
 * note is shown, so it works on every note, old ones included, and the stored
 * Markdown is never changed.
 *
 * Lines inside a code fence are left alone, and so is any line that is not a
 * labelled sentence. Consecutive labelled lines (blank lines between them
 * allowed) form one card stack. */

const LABEL =
  /^\s*(?:>\s*)?(?:\*\*|__|\*|_)?(Definition|Key idea|Common mistake|Formula)(?:\*\*|__|\*|_)?\s*:\s*(?:\*\*|__|\*|_)?(.*?)(?:\*\*|__|\*|_)?\s*$/i;

const KIND: Record<string, string> = {
  definition: "definition",
  "key idea": "key",
  "common mistake": "mistake",
  formula: "formula",
};

/** A string safe inside an OpenUI double-quoted literal. Curly quotes keep the
 *  student's text intact without any escaping rules. */
function literal(text: string): string {
  return text.replace(/"/g, "”").replace(/\\/g, "");
}

function stack(items: { kind: string; text: string }[]): string {
  const names = items.map((_, i) => `c${i + 1}`);
  const lines = [`root = Stack([${names.join(", ")}])`];
  items.forEach((item, i) => {
    lines.push(`${names[i]} = Callout("${item.kind}", "${literal(item.text)}")`);
  });
  return ["```openui", ...lines, "```"].join("\n");
}

/** Markdown with each run of labelled lines replaced by a card stack, and a
 *  "Words to know" card for each section that defines several terms. */
export function cardifyNotes(markdown: string): string {
  return addTermCards(cardifyLabels(markdown));
}

function cardifyLabels(markdown: string): string {
  if (!markdown || !LABEL_HINT.test(markdown)) return markdown;
  const lines = markdown.split("\n");
  const out: string[] = [];
  let inFence = false;
  let run: { kind: string; text: string }[] = [];
  let gap: string[] = [];

  const flush = () => {
    if (run.length > 0) {
      out.push("", stack(run), "");
    } else {
      out.push(...gap);
    }
    run = [];
    gap = [];
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      flush();
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    const match = LABEL.exec(line);
    if (match && match[2].trim()) {
      gap = [];
      run.push({
        kind: KIND[match[1].toLowerCase()],
        text: match[2].replace(/\*\*|__/g, "").trim(),
      });
      continue;
    }
    if (run.length > 0 && line.trim() === "") {
      gap.push(line);
      continue;
    }
    flush();
    out.push(line);
  }
  flush();
  return out.join("\n");
}

/* Cheap pre-check: skip the line-by-line pass for notes with no labels. */
const LABEL_HINT = /(Definition|Key idea|Common mistake|Formula)\s*:/i;

/* ---------------------------------------------------------------------------
   "Words to know" from the note's own definitions.

   Notes bold each key term where they introduce it, and most define it in
   the same line: "**Osmosis** is the diffusion of water…", or a bullet
   "- **Solute**: the substance that dissolves". A section that defines
   several terms that way is exactly where a KeyTerms card helps, and the
   card can be written from those lines alone. Nothing is invented: each
   pair is the note's own term and the note's own words for it. The prose
   stays as written; the card is the section's vocabulary at a glance.
   --------------------------------------------------------------------------- */

/** Fewer defined terms than this in a section is a sentence, not a glossary. */
const MIN_TERMS = 3;
const MAX_TERMS = 8;
const MAX_DEFINITION_CHARS = 180;

/* "- **Term**: definition", "- **Term** — definition", "- **Term** - definition" */
const BULLET_TERM = /^\s*(?:[-*+]\s+)?\*\*([^*\n]{2,48})\*\*\s*(?::|—|–|-)\s*(.+)$/;
/* "**Term** is / are / means / refers to … ." (the first sentence) */
const SENTENCE_TERM =
  /\*\*([^*\n]{2,48})\*\*\s+((?:is|are|means|refers to|describes)\s[^.!?\n]{8,}[.!?])/;

/* "is the diffusion of water" → "The diffusion of water": the definition
   reads on its own beside the term. */
const LINKING_VERB = /^(?:is|are|means|refers to|describes)\s+/i;

function plainDefinition(text: string): string {
  let clean = text.replace(/\*\*|__|==/g, "").replace(/\s+/g, " ").trim().replace(LINKING_VERB, "");
  clean = clean.charAt(0).toUpperCase() + clean.slice(1);
  if (clean.length <= MAX_DEFINITION_CHARS) return clean;
  const cut = clean.slice(0, MAX_DEFINITION_CHARS);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

/** The terms a block of note lines defines, in order, first definition wins. */
export function definedTerms(lines: string[]): [string, string][] {
  const terms: [string, string][] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const bullet = BULLET_TERM.exec(line);
    const sentence = bullet ? null : SENTENCE_TERM.exec(line);
    const term = (bullet?.[1] ?? sentence?.[1])?.replace(/[:.]$/, "").trim();
    const definition = bullet?.[2] ?? sentence?.[2] ?? "";
    if (!term || !definition.trim()) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push([term, plainDefinition(definition)]);
  }
  return terms;
}

function termCard(terms: [string, string][]): string {
  const pairs = terms
    .slice(0, MAX_TERMS)
    .map(([t, d]) => `["${literal(t)}", "${literal(d)}"]`)
    .join(", ");
  return ["```openui", "root = Stack([t])", `t = KeyTerms("Words to know", [${pairs}])`, "```"].join("\n");
}

/** A KeyTerms card at the end of each section that defines MIN_TERMS or more
 *  terms and has no card of its own yet. */
export function addTermCards(markdown: string): string {
  if (!markdown || !markdown.includes("**")) return markdown;
  const lines = markdown.split("\n");
  const out: string[] = [];
  let section: string[] = [];
  let inFence = false;
  /* Only a vocabulary card already there stops a new one: a callout stack
     (cardifyLabels, or the model's) is a different card. */
  let sectionHasCard = false;

  const close = () => {
    // oxlint-disable-next-line no-control-regex
    const terms = sectionHasCard ? [] : definedTerms(section.filter((l) => !/^\u0000/.test(l)));
    out.push(...section);
    if (terms.length >= MIN_TERMS) {
      while (out.length && out[out.length - 1].trim() === "") out.pop();
      out.push("", termCard(terms), "");
    }
    section = [];
    sectionHasCard = false;
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      // Fence markers are kept but never read for terms.
      section.push(`\u0000${line}`);
      continue;
    }
    if (inFence && /\bKeyTerms\(/.test(line)) sectionHasCard = true;
    if (!inFence && /^#{2,4}\s/.test(line)) close();
    // Fenced lines are kept but never read for terms.
    section.push(inFence ? `\u0000${line}` : line);
  }
  close();
  // oxlint-disable-next-line no-control-regex
  return out.map((l) => l.replace(/^\u0000/, "")).join("\n");
}
