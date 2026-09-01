/* What the model is told about drawing.
 *
 * The app renders a ```svg fence as a real diagram (see `markdownToReact.tsx`
 * and `lib/diagramSvg.tsx`), so the tutor can genuinely draw — it used to
 * answer "I can't create or draw diagrams directly" because nothing had ever
 * told it otherwise. These rules are the contract between what the model
 * writes and what the sanitiser will keep: anything outside the allowlist is
 * dropped silently, so the instructions and `ALLOWED_TAGS`/`ALLOWED_ATTRS`
 * have to be changed together.
 *
 * The same rules live in `supabase/functions/learnora-ai/index.ts` for the
 * plain chat surface — that runs on Deno and cannot import from here.
 */

export const DIAGRAM_INSTRUCTIONS = `HOW TO DRAW A DIAGRAM — the app renders these, so draw rather than describe:
- Put the drawing in a fenced block tagged svg (\`\`\`svg … \`\`\`) containing one <svg> element and nothing else. Prose goes outside the fence.
- Open with <svg viewBox="0 0 640 420" xmlns="http://www.w3.org/2000/svg"> — always a viewBox, never a width or height attribute, so it scales on a phone.
- Give every diagram a <title> saying what it shows, in one short line.
- Allowed elements only: g, defs, title, desc, path, line, polyline, polygon, rect, circle, ellipse, text, tspan, marker, linearGradient, radialGradient, stop, clipPath. Never use script, style, image, use, foreignObject, links or animation — they are stripped and the diagram arrives broken.
- Colour: stroke="currentColor" for construction lines and fill="currentColor" for labels, so the diagram follows the student's light or dark theme. For emphasis use at most three explicit colours that read on either background — #2E9E6B, #2563EB, #C2410C — and never fill a large area with white, black or a near-background colour.
- Keep strokes at stroke-width="2" or less, use fill="none" on shapes that are outlines, and leave at least 24 units of padding inside the viewBox so nothing is clipped.
- Label everything the explanation refers to. Text at font-size="15" or larger, with text-anchor="middle" for centred labels; write labels as plain characters (A, θ, 2x) — TeX is not typeset inside a drawing.
- Keep it to one idea per diagram and under about 60 elements. Two clear diagrams beat one crowded one.
- After each drawing, add one or two short sentences saying what to notice in it.`;

/** Appended to the tutor's system prompt so it knows drawing is on the table
 *  and reaches for it at the right moments — not on every reply. */
export const DIAGRAM_CHAT_HINT = `You can draw diagrams, and should whenever a picture carries the idea better than a sentence — geometry, graphs, force or circuit sketches, number lines, Venn diagrams, flowcharts, timelines, concept maps, labelled structures. Never say you are unable to create or draw diagrams, and never tell the student to sketch it themselves instead.

${DIAGRAM_INSTRUCTIONS}`;

/** The Studio's "Diagram" tool: one focused drawing of a topic, with the
 *  student's own sources in front of the model. */
export function buildDiagramTaskPrompt(
  topic: string,
  request?: string,
): string {
  const brief = request?.trim()
    ? `The student asked for: ${request.trim()}`
    : `Choose the single most useful diagram for revising "${topic}" — the one that shows how the parts of the topic relate, not a decorative illustration.`;

  return `Draw one clear revision diagram for "${topic}".

${brief}

Answer with a one-line heading naming the diagram, then the \`\`\`svg fence, then two or three short bullet points saying what each labelled part means. Use British English.

${DIAGRAM_INSTRUCTIONS}`;
}
