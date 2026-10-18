/* The OPENUI CARDS prompt section. Separate from fence.ts because it needs
 * the component library, and with it the renderer and Zod; callers load this
 * file only when the `openUi` flag is on. */

import { askLibrary } from "./library";

const EXAMPLE = `root = Stack([k, w, t, q, f])
k = Callout("key", "A catalyst speeds up a reaction without changing where equilibrium sits.")
w = WorkedExample("Find the rate when k = 0.5 and [A] = 4 for a first-order reaction.", ["First order means rate = k[A].", "Substitute: rate = 0.5 × 4."], "rate = 2 mol dm$^{-3}$ s$^{-1}$")
t = KeyTerms("Words to know", [["Activation energy", "The minimum energy needed for a collision to react."], ["Catalyst", "Speeds a reaction up and is not used up."]])
q = MiniQuiz("What does a catalyst change?", ["The equilibrium position", "How fast equilibrium is reached", "The enthalpy change"], 1, "It speeds up both directions equally, so equilibrium arrives sooner but does not move.")
f = FollowUps(["Quiz me on this", "Show a harder example"])`;

/** The prompt section teaching the model the library. Built once; the
 *  library is a module constant. */
let cached: string | null = null;
export function openUiPromptSection(): string {
  if (cached) return cached;
  const reference = askLibrary.prompt({
    preamble:
      "OpenUI Lang describes a small interface built from the components below.",
    additionalRules: [
      "Use the fewest components that help; one or two is typical.",
      "Text fields are plain text; TeX goes in $…$. No Markdown or HTML inside them.",
    ],
    examples: [EXAMPLE],
  });
  cached = `OPENUI CARDS:
- Besides Markdown you may add ONE fenced code block whose language is openui (three backticks, the word openui, the OpenUI Lang program, three backticks) when structured content helps more than prose: a definition or common mistake worth boxing, ordered steps, a comparison table, or a one-question check of the student's understanding. The app draws it as a card.
- The block supports your answer and never replaces it: still explain in words around it. Skip it for short answers, chat, task or exam actions, and whenever the student just wants a direct reply.
- Never put action tags inside the block, and never mention the block or the word "openui" to the student.
- Everything between the dashes below describes the language and the components available.
-----
${reference}
-----`;
  return cached;
}
