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
export function lessonIdOfCard(card: Pick<Flashcard, "material_id" | "source_material_id">): string | null {
  return card.material_id ?? card.source_material_id ?? null;
}

/** A card counts as practised once it has been reviewed: it has a review
 *  time, or a scheduling interval above zero from before that column. */
export function isPractised(card: Pick<Flashcard, "last_reviewed_at" | "srs_interval">): boolean {
  return Boolean(card.last_reviewed_at) || (card.srs_interval ?? 0) > 0;
}

export function progressByLesson(
  cards: ReadonlyArray<Pick<Flashcard, "material_id" | "source_material_id" | "last_reviewed_at" | "srs_interval">>,
): Map<string, LessonProgress> {
  const out = new Map<string, LessonProgress>();
  for (const card of cards) {
    const id = lessonIdOfCard(card);
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

export function lessonIcon(type: MaterialType | string | null | undefined): IconName {
  return ICONS[type as MaterialType] ?? "book-open";
}

/** Strips a file extension from an upload's title ("Week 3 slides.pdf"),
 *  since a lesson is named for what it teaches, not the file it came in. */
export function lessonTitle(material: Pick<Material, "title">): string {
  return material.title.replace(/\.(pdf|docx?|txt|pptx?|mp3|m4a|wav|ogg|webm|mp4|aac|png|jpe?g|webp)$/i, "").trim() || material.title;
}

export const lessonPath = (materialId: string) => `/lessons/${encodeURIComponent(materialId)}`;
