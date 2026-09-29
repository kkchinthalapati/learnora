/* What a reply sounds like read aloud.
 *
 * The tutor writes for the screen: markdown markers, TeX, fenced code and
 * mermaid diagrams. A speech engine reads all of that literally — "asterisk
 * asterisk", "dollar backslash frac" — so the spoken version keeps the words
 * and drops the typesetting. Anything that only makes sense to look at (a
 * diagram, a code listing) is replaced by a short cue to look at the screen.
 */

/** Longest reply read aloud in one go; past it the rest is left on screen. */
export const MAX_SPOKEN_CHARS = 1200;

export function toSpeakableText(markdown: string): string {
  const text = markdown
    // Fences first: their contents are for reading, not listening.
    .replace(/```mermaid[\s\S]*?```/g, " (See the diagram on screen.) ")
    .replace(/```[\s\S]*?```/g, " (See the code on screen.) ")
    // Display maths, then inline maths.
    .replace(/\$\$[\s\S]*?\$\$/g, " (See the working on screen.) ")
    .replace(/\\\[[\s\S]*?\\\]/g, " (See the working on screen.) ")
    .replace(/\$([^$\n]+)\$/g, (_, tex: string) => spokenTex(tex))
    // [label](url) → label; bare URLs are not worth spelling out.
    .replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "the link on screen")
    // Headings, quotes and list markers at the start of a line.
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "")
    // Emphasis and inline code markers.
    .replace(/(\*\*\*|\*\*|\*|__|_|`)(?=\S)([\s\S]*?\S)\1/g, "$2")
    .replace(/`/g, "")
    // Citation markers like [1] add nothing spoken.
    .replace(/\[\d+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= MAX_SPOKEN_CHARS) return text;
  /* Cut at a sentence end where one is close, so the voice does not stop
     mid-word. */
  const cut = text.slice(0, MAX_SPOKEN_CHARS);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  const head = lastStop > MAX_SPOKEN_CHARS * 0.6 ? cut.slice(0, lastStop + 1) : cut;
  return `${head.trim()} The rest is on screen.`;
}

/* A short inline expression is read in plain words where that is easy
   ($x^2$ → "x squared"); anything harder is pointed at rather than mangled. */
function spokenTex(tex: string): string {
  const simple = tex
    .replace(/\\(?:left|right)/g, "")
    .replace(/\^\{?2\}?/g, " squared")
    .replace(/\^\{?3\}?/g, " cubed")
    .replace(/\\times/g, " times ")
    .replace(/\\cdot/g, " times ")
    .replace(/\\div/g, " divided by ")
    .replace(/\\pi/g, " pi ")
    .replace(/=/g, " equals ")
    .replace(/\s+/g, " ")
    .trim();
  return /[\\{}^_]/.test(simple) ? " (see the maths on screen) " : ` ${simple} `;
}
