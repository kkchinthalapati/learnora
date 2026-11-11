/** Ends `text` with exactly one full stop, for a choice or a model-written
 *  phrase dropped into "The answer is …." (audit F-04: "glucose.."). Text
 *  that already ends in a stop, "?" or "!" (optionally inside a closing
 *  quote or bracket) is left as it is. */
export function asSentence(text: string): string {
  const trimmed = text.trim();
  if (/[.?!…][)"'”’\]]*$/.test(trimmed)) return trimmed;
  return `${trimmed}.`;
}
