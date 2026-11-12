import { modeShowsOpinions } from "./prompt";
import type {
  Category,
  ContextManifest,
  Decision,
  DocumentRow,
  Message,
  TaskMode,
  Thread,
} from "./types";

/* Context assembly: pick the parts of the shared knowledge that bear on a
 * discussion and freeze them into text plus a manifest saying what was used.
 *
 * Selection is by evidence, not "attach everything": documents the thread has
 * attached always go in; others are scored by category fit and keyword overlap
 * with the title, problem and latest messages; the overview always rides along
 * if it exists. Every document that is cut for length says so in the manifest,
 * and a document that is left out simply isn't listed — the user sees the real
 * list, never a claim that "all context" was included. */

export const DOC_CHAR_BUDGET = 5000;
export const TOTAL_CHAR_BUDGET = 28000;
export const MESSAGE_LIMIT = 14;
export const MESSAGE_CHAR_CAP = 1800;
export const DECISION_LIMIT = 6;
const MAX_AUTO_DOCS = 3;

/** Which document categories help which discussion category. */
const CATEGORY_DOCS: Record<Category, string[]> = {
  product: ["product", "roadmap", "overview", "sprint"],
  engineering: ["architecture", "engineering", "issues", "sprint"],
  design: ["design", "product"],
  qa: ["issues", "engineering", "sprint"],
  security: ["architecture", "issues", "engineering"],
  business: ["product", "roadmap", "decisions"],
  strategy: ["roadmap", "product", "decisions", "overview"],
  research: ["overview", "product", "architecture"],
  other: ["overview"],
};

const STOP = new Set(
  "the a an and or of to in on for with is are be was it this that we our i you my your should could would can do does what how why not as at by from about into than then them they their there have has had will just so if but".split(
    " ",
  ),
);

export function keywords(text: string, limit = 24): string[] {
  const counts = new Map<string, number>();
  for (const word of text.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? []) {
    if (STOP.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([w]) => w);
}

export interface DocWithText {
  doc: DocumentRow;
  content: string;
}

export interface ScoredDoc extends DocWithText {
  score: number;
  reason: string;
}

export function scoreDocuments(
  docs: DocWithText[],
  thread: Pick<Thread, "title" | "problem" | "category">,
  recentText: string,
  attachedIds: ReadonlySet<string>,
): ScoredDoc[] {
  const words = new Set(keywords(`${thread.title} ${thread.problem} ${recentText}`));
  const wanted = CATEGORY_DOCS[thread.category] ?? [];
  const scored: ScoredDoc[] = [];
  for (const entry of docs) {
    if (entry.doc.archived || entry.content.trim() === "") continue;
    if (attachedIds.has(entry.doc.id)) {
      scored.push({ ...entry, score: 100, reason: "attached to this discussion" });
      continue;
    }
    const haystack = `${entry.doc.title} ${entry.content}`.toLowerCase();
    let hits = 0;
    for (const w of words) if (haystack.includes(w)) hits += 1;
    const categoryFit = wanted.indexOf(entry.doc.category);
    const score = hits + (categoryFit >= 0 ? 6 - categoryFit : 0);
    if (entry.doc.category === "overview") {
      scored.push({ ...entry, score: Math.max(score, 5), reason: "project overview" });
    } else if (hits >= 2 || categoryFit >= 0) {
      const why =
        hits >= 2 && categoryFit >= 0
          ? `matches ${thread.category} and ${hits} discussion terms`
          : categoryFit >= 0
            ? `relevant to ${thread.category} discussions`
            : `${hits} discussion terms match`;
      scored.push({ ...entry, score, reason: why });
    }
  }
  return scored.sort((a, b) => b.score - a.score || a.doc.slug.localeCompare(b.doc.slug));
}

function clip(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max).trimEnd() + "\n[… cut for length]", truncated: true };
}

export interface AssembleInput {
  thread: Thread;
  /** Oldest first. */
  messages: Message[];
  authorName: (m: Message) => string;
  documents: DocWithText[];
  attachedIds: ReadonlySet<string>;
  decisions: Decision[];
  mode: TaskMode;
}

export interface Assembled {
  content: string;
  manifest: ContextManifest;
}

/** Modes where an agent must not see what the other agents said. */
export function hidesOtherOpinions(mode: TaskMode): boolean {
  return mode === "independent";
}

export function assembleContext(input: AssembleInput): Assembled {
  const { thread, mode } = input;
  /* Independent analysis never sees other AI answers. Modes that cross-examine
     get them in full in the prompt's own "submitted opinions" section, so they
     are left out of the clipped discussion here rather than shown twice. */
  const excludeAi = hidesOtherOpinions(mode);
  const separate = modeShowsOpinions(mode);
  const usable = input.messages.filter(
    (m) => m.author_type !== "system" && !((excludeAi || separate) && m.author_type === "ai"),
  );
  const recent = usable.slice(-MESSAGE_LIMIT);
  const recentText = recent.map((m) => m.content).join(" ");

  const scored = scoreDocuments(input.documents, thread, recentText, input.attachedIds);
  const attached = scored.filter((s) => input.attachedIds.has(s.doc.id));
  const overview = scored.filter(
    (s) => !input.attachedIds.has(s.doc.id) && s.doc.category === "overview",
  );
  const others = scored
    .filter((s) => !input.attachedIds.has(s.doc.id) && s.doc.category !== "overview")
    .slice(0, MAX_AUTO_DOCS);
  const chosen = [...attached, ...overview.slice(0, 1), ...others];

  const sections: string[] = [];
  const manifest: ContextManifest = {
    documents: [],
    decisions: [],
    messages: { count: 0, first: null, last: null, ids: [] },
    excludedAiMessages: excludeAi && input.messages.some((m) => m.author_type === "ai"),
    opinionIds: separate
      ? input.messages.filter((m) => m.author_type === "ai").map((m) => m.id)
      : [],
    attachments: [],
    characters: 0,
  };

  let used = 0;
  for (const s of chosen) {
    const room = Math.min(DOC_CHAR_BUDGET, TOTAL_CHAR_BUDGET - used);
    if (room < 400) break;
    const { text, truncated } = clip(s.content, room);
    used += text.length;
    manifest.documents.push({
      id: s.doc.id,
      slug: s.doc.slug,
      title: s.doc.title,
      version: s.doc.current_version,
      reason: s.reason,
      truncated,
    });
    sections.push(`### ${s.doc.title} (${s.doc.slug}, v${s.doc.current_version})\n${text}`);
  }
  const docSection = sections.length
    ? `## Project knowledge\n${sections.join("\n\n")}`
    : "## Project knowledge\n(no knowledge-base documents were relevant or available)";

  const finals = input.decisions
    .filter((d) => d.status === "final" && d.outcome !== "rejected")
    .sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? ""))
    .slice(0, DECISION_LIMIT);
  const rejected = input.decisions
    .filter((d) => d.status === "final" && d.outcome === "rejected")
    .slice(0, 3);
  const decisionLines = [...finals, ...rejected].map((d) => {
    manifest.decisions.push({ id: d.id, title: d.title, outcome: d.outcome });
    return `- ${d.title} — ${d.outcome.replace("_", " ")}: ${clip(d.rationale, 280).text}`;
  });
  const decisionSection = decisionLines.length
    ? `## Prior founder decisions\n${decisionLines.join("\n")}`
    : "## Prior founder decisions\n(none recorded yet)";

  const lines = recent.map((m) => {
    const who =
      m.author_type === "ai"
        ? `${input.authorName(m)}${m.round_label ? ` [${m.round_label}]` : ""}`
        : input.authorName(m);
    return `[${m.author_type === "ai" ? "AI" : "HUMAN"}] ${who}: ${clip(m.content, MESSAGE_CHAR_CAP).text}`;
  });
  manifest.messages = {
    count: recent.length,
    first: recent[0]?.created_at ?? null,
    last: recent[recent.length - 1]?.created_at ?? null,
    ids: recent.map((m) => m.id),
  };
  const messageSection = lines.length
    ? `## Recent discussion (oldest first)\n${lines.join("\n\n")}`
    : "## Recent discussion\n(no messages yet)";

  const attachedNames = [...attached].map((s) => s.doc.title);
  manifest.attachments = attachedNames;

  const header =
    `# ${thread.title}\nCategory: ${thread.category}\n` +
    `Problem statement: ${thread.problem.trim() || "(none written — see the discussion below)"}`;
  const content = [header, docSection, decisionSection, messageSection].join("\n\n");
  manifest.characters = content.length;
  return { content, manifest };
}
