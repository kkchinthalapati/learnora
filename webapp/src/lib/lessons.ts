import type { Flashcard, Material, MaterialType } from "../api/types";
import type { IconName } from "../components/icons";

/* A lesson is a material (DESIGN.md rule 0.1): one upload, link, set of notes
 * or topic, with the notes, quizzes and cards that point back at it. These
 * helpers are pure so Home and the Lesson page agree on what "progress"
 * means and can be tested without rendering either. */

export interface LessonProgress {
  /** Cards made from this lesson. */
  total: number;
  /** Of those, cards reviewed at least once. */
  practised: number;
}

/** Which lesson a card belongs to. Cards from the study-package pipeline
 *  carry `material_id`; cards added from a source quote carry
 *  `source_material_id`. Either counts. */
export function lessonIdOfCard(
  card: Pick<Flashcard, "material_id" | "source_material_id"> & { deck_id?: string | null },
  /** Deck id → the lesson its set was made from. The study package links the
   *  set, not each card (audit F-16), so a card is found through its deck. */
  deckLessons?: ReadonlyMap<string, string>,
): string | null {
  return (
    card.material_id ??
    card.source_material_id ??
    (card.deck_id ? deckLessons?.get(card.deck_id) : undefined) ??
    null
  );
}

/** Deck id → lesson id, for the sets that record one. */
export function deckLessonMap(
  decks: ReadonlyArray<{ id: string; material_id?: string | null }>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of decks) if (d.material_id) out.set(d.id, d.material_id);
  return out;
}

/** A card counts as practised once it has been reviewed: it has a review
 *  time, or a scheduling interval above zero from before that column. */
export function isPractised(card: Pick<Flashcard, "last_reviewed_at" | "srs_interval">): boolean {
  return Boolean(card.last_reviewed_at) || (card.srs_interval ?? 0) > 0;
}

export function progressByLesson(
  cards: ReadonlyArray<
    Pick<Flashcard, "material_id" | "source_material_id" | "last_reviewed_at" | "srs_interval"> & {
      deck_id?: string | null;
    }
  >,
  deckLessons?: ReadonlyMap<string, string>,
): Map<string, LessonProgress> {
  const out = new Map<string, LessonProgress>();
  for (const card of cards) {
    const id = lessonIdOfCard(card, deckLessons);
    if (!id) continue;
    const entry = out.get(id) ?? { total: 0, practised: 0 };
    entry.total += 1;
    if (isPractised(card)) entry.practised += 1;
    out.set(id, entry);
  }
  return out;
}

/** The ring's fraction, or null when the lesson has no cards yet. */
export function progressValue(p: LessonProgress | undefined): number | null {
  if (!p || p.total === 0) return null;
  return p.practised / p.total;
}

/** What the ring says aloud (DESIGN.md rule 0.6: say what is counted). */
export function progressLabel(p: LessonProgress | undefined): string {
  if (!p || p.total === 0) return "No cards yet";
  return `${p.practised} of ${p.total} cards practised`;
}

const ICONS: Record<MaterialType, IconName> = {
  pdf: "file-text",
  youtube: "play",
  text: "book-open",
  audio: "mic",
};

/** The subject a lesson's mistakes are recorded under when it has none.
 *  The ledger is keyed by subject name, so the lesson's Mistakes tab reads
 *  the same string back. */
export const UNFILED_SUBJECT = "General";

export function lessonIcon(type: MaterialType | string | null | undefined): IconName {
  return ICONS[type as MaterialType] ?? "book-open";
}

/** Strips a file extension from an upload's title ("Week 3 slides.pdf"),
 *  since a lesson is named for what it teaches, not the file it came in. */
export function lessonTitle(material: Pick<Material, "title">): string {
  return material.title.replace(/\.(pdf|docx?|txt|pptx?|mp3|m4a|wav|ogg|webm|mp4|aac|png|jpe?g|webp)$/i, "").trim() || material.title;
}

/* The notes' opening "## " title, as NOTES_INSTRUCTIONS asks for it, minus
   the welcome the prompt also asks for ("Your guide to …", "Let's break
   down …") and any emoji. */
const NOTES_GREETING =
  /^(?:(?:your|a|the)\s+(?:complete\s+|friendly\s+|ultimate\s+)?(?:study\s+)?guide\s+to|let(?:'|’)s\s+(?:break\s+down|explore|dive\s+into|learn(?:\s+about)?)|here(?:'|’)s\s+your\s+guide\s+to|understanding|mastering|welcome\s+to)\s+/i;

function notesHeadingTopic(markdown: string): string | null {
  const heading = /^##\s+(.+)$/m.exec(markdown)?.[1];
  if (!heading) return null;
  const topic = heading
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
    .replace(/[*_=`]/g, "")
    .trim()
    .replace(NOTES_GREETING, "")
    .replace(/[:!.\s]+$/, "")
    .trim();
  return topic.length >= 3 ? topic : null;
}

/** What a session started from this lesson is about. A session gets a topic,
 *  not the lesson, and finds the student's passages by that topic's words, so
 *  the notes' own title beats an upload's filename ("route0-2024-05-05.gpx",
 *  "IMG_4412") whenever there are notes to read it from. */
export function lessonTopic(material: Pick<Material, "title">, notesMarkdown?: string | null): string {
  return (notesMarkdown && notesHeadingTopic(notesMarkdown)) || lessonTitle(material);
}

export const lessonPath = (materialId: string) => `/lessons/${encodeURIComponent(materialId)}`;
