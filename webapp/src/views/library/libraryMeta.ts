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

export function pathForTab(tab: LibraryTabId): string {
  return tab === "folders" ? "/library" : `/library/${tab}`;
}

// Folder colors come from a free-text database column, so inline styles accept
// only hex values.
export function safeColor(color: string | null, fallback = "#4A90E2"): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(String(color || "")) ? color! : fallback;
}

export function formatCreatedLong(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatCreatedShort(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString();
}
