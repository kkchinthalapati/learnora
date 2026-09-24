/* Subjects first and by default: "one folder per class" is how students
   already organise school. Notebooks — several sources you can ask cited
   questions across — is the advanced idea, and opening on it left new
   students guessing how Subjects, Notebooks and Library related. Each tab
   says, in one line, what it holds. */
export const LIBRARY_TABS = [
  {
    id: "folders",
    label: "Subjects",
    blurb: "One folder per class. Notes, flashcards and quizzes for Biology all live in Biology.",
  },
  {
    id: "materials",
    label: "Files & notes",
    blurb: "Everything you've uploaded or pasted, and the notes made from it — from every subject.",
  },
  {
    id: "flashcards",
    label: "Flashcards",
    blurb: "All your flashcard decks, from every subject.",
  },
  {
    id: "quizzes",
    label: "Quizzes",
    blurb: "All your practice quizzes, from every subject.",
  },
  {
    id: "notebooks",
    label: "Notebooks",
    blurb: "Put several sources side by side and ask questions that answer with quotes from them.",
  },
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
