/* Ports the action-tag machinery from js/ai.js (:193-253).
 *
 * The model can emit tags like `<ADD_TASK>Read chapter 3</ADD_TASK>` that the
 * app executes. Three separate concerns live here, and conflating them is how
 * this becomes a prompt-injection hole:
 *
 *  1. `fenceUntrusted` — applied to attacker-influenced text *going into* a
 *     prompt (note bodies, uploaded documents, link contents). Only the
 *     model's own reply may ever trigger an action.
 *  2. `stripActionTagBlocks` — applied to model output *coming out*, before
 *     it is displayed or written into chat history. A leftover tag reads to
 *     the student as a confirmed action.
 *  3. `widgetToken`/`restoreWidgets` — app-built HTML is parked behind an
 *     opaque token so it can be spliced back in *after* the model's text has
 *     been escaped and rendered, never round-tripped through the escaper.
 */

/** Action tags the app executes when it sees them in a model reply. */
export const ACTION_TAGS = [
  "ADD_TASK",
  "START_TIMER",
  "SET_THEME",
  "NAVIGATE",
  "GRADE_FLASHCARD",
  "ADD_QUIZ",
  "ADD_PLAN",
] as const;

export type ActionTag = (typeof ACTION_TAGS)[number];

const TAG_NAMES = ACTION_TAGS.join("|");

/** Defang action tags inside untrusted text before it is interpolated into a
 *  prompt. A PDF containing "<SET_THEME>x</SET_THEME>" or "<NAVIGATE>…</NAVIGATE>"
 *  could otherwise steer the app, and several tags execute with no
 *  confirmation prompt. */
export function stripActionTags(text: string | null | undefined): string {
  if (!text) return "";
  return String(text).replace(
    new RegExp(`<(/?)(?:${TAG_NAMES})>`, "gi"),
    "($1tag removed)",
  );
}

/** Prepare attacker-influenced text for interpolation into a prompt. Strips
 *  executable action tags and neutralises the `"""` fence used to delimit
 *  quoted content, so injected text cannot close the block early and pose as
 *  app-level instructions. */
export function fenceUntrusted(text: string | null | undefined): string {
  if (!text) return "";
  return stripActionTags(String(text)).replace(/"""/g, "“””");
}

/** Remove complete action-tag blocks (tag, payload and closer) from model
 *  output before it is displayed or written back into chat history. */
export function stripActionTagBlocks(text: string | null | undefined): string {
  if (!text) return "";
  return String(text).replace(
    new RegExp(`<(${TAG_NAMES})>[\\s\\S]*?</\\1>`, "g"),
    "",
  );
}

/** Opaque placeholder standing in for a piece of app-built (trusted) HTML in
 *  untrusted model text. Contains no markdown/HTML-significant characters, so
 *  it passes through renderMarkdown() untouched. */
export function widgetToken(i: number): string {
  return `⟦learnora-widget:${i}⟧`;
}

/** Swap widget tokens back for their real HTML *after* escaping/rendering. */
export function restoreWidgets(html: string, widgets: string[]): string {
  return html.replace(
    /⟦learnora-widget:(\d+)⟧/g,
    (_, i: string) => widgets[Number(i)] ?? "",
  );
}
