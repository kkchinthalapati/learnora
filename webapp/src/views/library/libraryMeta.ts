/* Shared constants and formatting for the Library tabs and a subject's
 * workspace (ported from js/router.js:6-8, :251-267, :330-385). */

export const LIBRARY_TABS = [
  { id: "folders", label: "Folders" },
  { id: "materials", label: "Materials" },
  { id: "flashcards", label: "Flashcards" },
  { id: "quizzes", label: "Quizzes" },
] as const;

export type LibraryTabId = (typeof LIBRARY_TABS)[number]["id"];

export function isLibraryTab(value: string | undefined): value is LibraryTabId {
  return LIBRARY_TABS.some((t) => t.id === value);
}

/** Folders is the Library's default tab, so it owns the bare `/library` path —
 *  the same split the vanilla made between `#library` and `#library-<tab>`. */
export function pathForTab(tab: LibraryTabId): string {
  return tab === "folders" ? "/library" : `/library/${tab}`;
}

/** The vanilla's `safeColor` (js/router.js:6-8): a folder's colour is written
 *  straight into an inline style, and the column is free text, so anything
 *  that isn't a plain hex falls back to the default blue. */
export function safeColor(color: string | null, fallback = "#4A90E2"): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(String(color || "")) ? color! : fallback;
}

/** Matches the vanilla folder card's `toLocaleDateString(undefined, {...})`. */
export function formatCreatedLong(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Matches the vanilla material/deck/quiz cards' bare `toLocaleDateString()`. */
export function formatCreatedShort(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString();
}
