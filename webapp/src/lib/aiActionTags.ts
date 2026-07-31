/* Ports js/ai.js's action-tag defenses (:194-255) — pure string transforms,
 * no network/DOM dependency, so they're portable ahead of the chat surface
 * that will actually execute tags (ledger step 17). Nothing calls
 * `stripActionTags`/`fenceUntrusted` yet outside this module's own tests:
 * they exist now because they are the AI layer's job per this step's own
 * description ("action-tag parser"), the same way Step 5 shipped API
 * functions before any view called them.
 *
 * `ACTION_TAGS` is the authoritative list the chat surface will execute:
 * ADD_TASK, START_TIMER, SET_THEME, NAVIGATE, GRADE_FLASHCARD, ADD_QUIZ,
 * ADD_PLAN. Four of them (START_TIMER, SET_THEME, NAVIGATE, GRADE_FLASHCARD)
 * run with no confirmation dialog in the vanilla — which is exactly why any
 * text that isn't the model's own live reply has to be defanged before it
 * ever reaches a prompt. */
export const ACTION_TAGS = [
  "ADD_TASK",
  "START_TIMER",
  "SET_THEME",
  "NAVIGATE",
  "GRADE_FLASHCARD",
  "ADD_QUIZ",
  "ADD_PLAN",
] as const;

/** Defang action tags inside untrusted text before it is interpolated into
 *  a prompt. Notes and uploaded documents are attacker-influenced input: a
 *  PDF containing "<SET_THEME>x</SET_THEME>" or "<NAVIGATE>…</NAVIGATE>"
 *  could otherwise steer the app, and those tags execute with no
 *  confirmation prompt. Neutralising them at the boundary means only the
 *  model's own reply can ever trigger an action. */
export function stripActionTags(text: string | null | undefined): string {
  if (!text) return "";
  const names = ACTION_TAGS.join("|");
  return String(text).replace(
    new RegExp(`<(/?)(?:${names})>`, "gi"),
    "($1tag removed)",
  );
}

/** Prepare attacker-influenced text for interpolation into a prompt. Strips
 *  executable action tags and neutralises the `"""` fence used to delimit
 *  quoted content, so injected text cannot close the block early and pose
 *  as app-level instructions. */
export function fenceUntrusted(text: string | null | undefined): string {
  if (!text) return "";
  return stripActionTags(String(text)).replace(/"""/g, "“””");
}

/** Remove complete action-tag blocks (tag, payload and closer) from model
 *  output before it is displayed or written back into chat history. The app
 *  executes these tags, so they must never survive into rendered text — a
 *  leftover tag reads to the student as a confirmed action. */
export function stripActionTagBlocks(text: string | null | undefined): string {
  if (!text) return "";
  const names = ACTION_TAGS.join("|");
  return String(text).replace(
    new RegExp(`<(${names})>[\\s\\S]*?</\\1>`, "g"),
    "",
  );
}

/** Token used to reserve a spot for trusted, app-built widget HTML inside
 *  untrusted model text. Contains no markdown/HTML-significant characters,
 *  so it passes through renderMarkdown() untouched. */
export function widgetToken(i: number): string {
  return `⟦learnora-widget:${i}⟧`;
}

/** Swap widget tokens back for their real HTML *after* escaping/rendering.
 *
 *  Order matters wherever this is used: `renderMarkdown()` must run first
 *  (the token contains no `<`/`>`/`&`, so it survives HTML-escaping and every
 *  markdown regex untouched), and only then does this splice the real,
 *  already-safe widget HTML back in by index. That ordering — not the token
 *  syntax itself — is what makes it impossible for model text to *become* a
 *  widget merely by containing a token- or tag-like substring: widgets are
 *  populated exclusively by the app's own code from actions it already
 *  verified and executed, never derived from text that passed through the
 *  model. */
export function restoreWidgets(html: string, widgets: string[]): string {
  return html.replace(
    /⟦learnora-widget:(\d+)⟧/g,
    (_, i: string) => widgets[Number(i)] ?? "",
  );
}

/** Decodes a base64 string as UTF-8 text — `atob()` alone stops at the first
 *  non-Latin1 byte, which mangles multi-byte characters. Used to read back
 *  the base64-encoded text-file/link payloads this module builds. */
export function decodeBase64UTF8(base64Str: string): string {
  const binaryString = atob(base64Str);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}
