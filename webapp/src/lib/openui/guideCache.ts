import { Storage } from "../storage";

/* A generated guide, kept in this browser so reopening a note does not ask
   (and bill) the tutor again. Keyed by material and a fingerprint of the note
   text: edit the note and the stored guide stops matching, so it is offered
   as out of date rather than shown as if it described the new text. */

interface StoredGuide {
  fingerprint: string;
  code: string;
  at: string;
}

const key = (materialId: string) => `learnora:studyGuide:${materialId}`;

/** A cheap, stable fingerprint (djb2) of the note text. Not a security
 *  boundary — only used to notice that the note changed. */
export function fingerprint(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${text.length}:${(h >>> 0).toString(36)}`;
}

export function loadGuide(materialId: string): StoredGuide | null {
  const stored = Storage.get<StoredGuide | null>(key(materialId), null);
  return stored && typeof stored.code === "string" && stored.code ? stored : null;
}

export function saveGuide(materialId: string, text: string, code: string): void {
  Storage.set(key(materialId), {
    fingerprint: fingerprint(text),
    code,
    at: new Date().toISOString(),
  } satisfies StoredGuide);
}

export function clearGuide(materialId: string): void {
  Storage.remove(key(materialId));
}
