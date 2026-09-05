/* Where the app parks work-in-progress that has not been saved to the server
 * yet, so the keys live somewhere other than the component that happens to
 * write them — a test, or a future "you have unsaved work" prompt, should not
 * have to import a view to know where to look.
 *
 * Everything here is a localStorage key written by hooks/useQuizDraft. */

/** The material-creation panel's pasted text. One key, not one per folder:
 *  the panel is a single global modal and the folder is chosen inside it, so
 *  keying by folder would strand the draft the moment the student changed
 *  their mind about where it belongs. */
export const MATERIAL_DRAFT_KEY = "learnora:material_draft";

/** A card written in a deck's add-card form but not yet added. Per deck, so
 *  drafting a card in one and switching to another doesn't carry the
 *  half-written card across. */
export function cardDraftKey(deckId: string): string {
  return `learnora:card_draft:${deckId}`;
}

/** An in-progress quiz run. */
export function quizDraftKey(quizId: string): string {
  return `learnora_quiz_draft_${quizId}`;
}

/** An in-progress mock exam sitting. */
export function examDraftKey(quizId: string): string {
  return `learnora_exam_draft_${quizId}`;
}
