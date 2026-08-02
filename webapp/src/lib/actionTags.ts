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
 *
 * A third pair, `widgetToken`/`restoreWidgets`, was ported alongside these in
 * step 14 and removed again in step 17. They existed only because the vanilla
 * renders a reply by assigning an HTML *string* to `innerHTML`, so app-built
 * widget markup had to hide behind an opaque placeholder to survive the
 * escaper. The React chat builds elements instead (lib/markdownToReact.tsx),
 * so a widget is a React node sitting between two text nodes and there is no
 * string for it to be smuggled through.
 */

/** Action tags the app executes when it sees them in a model reply. */
export const ACTION_TAGS = [
  "ADD_TASK",
  "COMPLETE_TASK",
  "DELETE_TASK",
  "RESCHEDULE_TASK",
  "ADD_EXAM",
  "DELETE_EXAM",
  "START_TIMER",
  "SET_THEME",
  "NAVIGATE",
  "GRADE_FLASHCARD",
  "ADD_QUIZ",
  "ADD_DECK",
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
