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

/** Markdown with each run of labelled lines replaced by a card stack. */
export function cardifyNotes(markdown: string): string {
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
