/* What the Ask tutor may draw on, chosen like NotebookLM's source list.
 *
 * Before this, the panel said "Answers from my notes + web" on every page,
 * including for a student with no notes and on pages with nothing to look
 * up, and the web was on unless the student found the switch. Now:
 *
 *  - Notes default to "where you are": inside a lesson, only that lesson;
 *    on a subject's page, only that subject; anywhere else, all notes. A
 *    student can widen it, pick subjects, or turn notes off.
 *  - The web is off until the student turns it on here, and can only be on
 *    while Settings › Live web intelligence allows it.
 *  - With neither, the label says "general knowledge", which is what the
 *    answer then is.
 *
 * Kept on this device (it is a per-panel preference, like a filter), not on
 * the account. */

export type NotesScope = "context" | "all" | "subjects" | "off";

export interface ChatSources {
  notes: NotesScope;
  /** Folder ids, used when `notes` is "subjects". */
  subjectIds: string[];
  web: boolean;
}

export const DEFAULT_CHAT_SOURCES: ChatSources = Object.freeze({
  notes: "context",
  subjectIds: [],
  web: false,
}) as ChatSources;

const STORAGE_KEY = "learnora:chat-sources:v1";

export function loadChatSources(): ChatSources {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CHAT_SOURCES;
    const parsed = JSON.parse(raw) as Partial<ChatSources>;
    const notes: NotesScope = ["context", "all", "subjects", "off"].includes(
      parsed.notes as string,
    )
      ? (parsed.notes as NotesScope)
      : "context";
    return {
      notes,
      subjectIds: Array.isArray(parsed.subjectIds)
        ? parsed.subjectIds.filter((x) => typeof x === "string")
        : [],
      web: parsed.web === true,
    };
  } catch {
    return DEFAULT_CHAT_SOURCES;
  }
}

export function saveChatSources(sources: ChatSources): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sources));
  } catch {
    /* Private mode: the choice lasts this visit. */
  }
}

/** Where the student is, as far as sources care. */
export type PageContext =
  | { kind: "lesson"; materialId: string }
  | { kind: "subject"; folderId: string }
  | { kind: "none" };

export function pageContext(pathname: string): PageContext {
  const lesson = /^\/(?:lessons|notes)\/([^/?#]+)/.exec(pathname);
  if (lesson) return { kind: "lesson", materialId: safeDecode(lesson[1]) };
  const subject = /^\/subjects\/([^/?#]+)/.exec(pathname);
  if (subject) return { kind: "subject", folderId: safeDecode(subject[1]) };
  return { kind: "none" };
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export interface GroundingScope {
  materialIds?: string[];
  folderIds?: string[];
}

export type SourceModeId = "hybrid" | "notebook" | "web" | "none";

export interface ResolvedSources {
  sourceMode: SourceModeId;
  /** Undefined means every note. */
  scope: GroundingScope | undefined;
  /** Lower-case, for "Answers from …". */
  label: string;
  /** The web was asked for but Settings doesn't allow it. */
  webBlocked: boolean;
  notesOn: boolean;
}

export function resolveChatSources(
  sources: ChatSources,
  {
    context,
    materials,
    folders,
    webAllowed,
  }: {
    context: PageContext;
    /** Null while still loading: assume there are notes rather than flash
     *  "no notes yet" at someone who has plenty. */
    materials: Array<{
      id: string;
      title: string;
      folder_id: string | null;
    }> | null;
    folders: Array<{ id: string; name: string }>;
    webAllowed: boolean;
  },
): ResolvedSources {
  const web = sources.web && webAllowed;
  const webBlocked = sources.web && !webAllowed;
  const noNotesAtAll = materials !== null && materials.length === 0;

  let scope: GroundingScope | undefined;
  let notesLabel = "";
  let notesOn = !noNotesAtAll && sources.notes !== "off";

  if (notesOn) {
    if (sources.notes === "subjects") {
      const picked = folders.filter((f) => sources.subjectIds.includes(f.id));
      if (picked.length === 0) {
        notesOn = false;
      } else {
        scope = { folderIds: picked.map((f) => f.id) };
        notesLabel =
          picked.length <= 2
            ? picked.map((f) => f.name).join(" and ")
            : `${picked[0].name}, ${picked[1].name} and ${picked.length - 2} more`;
      }
    } else if (sources.notes === "context" && context.kind === "lesson") {
      scope = { materialIds: [context.materialId] };
      notesLabel = "this lesson";
    } else if (sources.notes === "context" && context.kind === "subject") {
      const folder = folders.find((f) => f.id === context.folderId);
      scope = { folderIds: [context.folderId] };
      notesLabel = folder ? `your ${folder.name} notes` : "this subject";
    } else {
      notesLabel = "all your notes";
    }
  }

  const sourceMode: SourceModeId = notesOn
    ? web
      ? "hybrid"
      : "notebook"
    : web
      ? "web"
      : "none";
  const label = notesOn
    ? web
      ? `${notesLabel} + the web`
      : notesLabel
    : web
      ? "the web"
      : "general knowledge";
  return { sourceMode, scope, label, webBlocked, notesOn };
}
