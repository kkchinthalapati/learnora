/* Bi-directional Wiki Link Parser & Resolver
 *
 * Supports [[Topic]] and [[Target|Alias]] syntax inside notes, chat, and
 * concept topologies.
 */

export interface WikiLinkMatch {
  raw: string;
  target: string;
  alias?: string;
  index: number;
}

export interface ResolvedWikiTarget {
  type: "folder" | "note" | "concept";
  id: string;
  title: string;
  url?: string;
}

export interface WikiLinkContext {
  notes?: Array<{ id: string; material_id?: string | null; title?: string }>;
  folders?: Array<{ id: string; name: string }>;
  concepts?: Array<{ id: string; name: string }>;
}

const WIKI_LINK_REGEX = /\[\[([^[\]|]+)(?:\|([^[\]|]+))?\]\]/g;

/**
 * Extract all [[Target]] or [[Target|Alias]] matches from markdown/plain text.
 */
export function extractWikiLinks(text: string): WikiLinkMatch[] {
  if (!text || typeof text !== "string") return [];
  const matches: WikiLinkMatch[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  WIKI_LINK_REGEX.lastIndex = 0;

  while ((match = WIKI_LINK_REGEX.exec(text)) !== null) {
    const raw = match[0];
    const target = match[1]?.trim();
    const alias = match[2]?.trim();

    if (target) {
      matches.push({
        raw,
        target,
        alias: alias || undefined,
        index: match.index,
      });
    }
  }

  return matches;
}

/**
 * Format a target into a [[Target]] or [[Target|Alias]] string.
 */
export function formatWikiLink(target: string, alias?: string): string {
  const cleanTarget = target.trim();
  const cleanAlias = alias?.trim();
  if (!cleanTarget) return "";
  if (cleanAlias && cleanAlias !== cleanTarget) {
    return `[[${cleanTarget}|${cleanAlias}]]`;
  }
  return `[[${cleanTarget}]]`;
}

/**
 * Match a target name against available workspace notes, subjects/folders, or concepts.
 */
export function resolveWikiLink(
  target: string,
  context: WikiLinkContext,
): ResolvedWikiTarget | null {
  const clean = target.trim().toLowerCase();
  if (!clean) return null;

  // 1. Check folders / subjects
  if (context.folders) {
    const matchedFolder = context.folders.find(
      (f) => f.name.toLowerCase() === clean,
    );
    if (matchedFolder) {
      return {
        type: "folder",
        id: matchedFolder.id,
        title: matchedFolder.name,
        url: `/folders/${matchedFolder.id}`,
      };
    }
  }

  // 2. Check notes
  if (context.notes) {
    const matchedNote = context.notes.find(
      (n) => n.title?.toLowerCase() === clean,
    );
    if (matchedNote) {
      const targetUrl = matchedNote.material_id
        ? `/notes/${matchedNote.material_id}`
        : `/library/notes`;
      return {
        type: "note",
        id: matchedNote.id,
        title: matchedNote.title || target,
        url: targetUrl,
      };
    }
  }

  // 3. Check concepts
  if (context.concepts) {
    const matchedConcept = context.concepts.find(
      (c) => c.name.toLowerCase() === clean || c.id.toLowerCase() === clean,
    );
    if (matchedConcept) {
      return {
        type: "concept",
        id: matchedConcept.id,
        title: matchedConcept.name,
      };
    }
  }

  // Fallback as concept term
  return {
    type: "concept",
    id: target.toLowerCase().replace(/\s+/g, "-"),
    title: target,
  };
}
