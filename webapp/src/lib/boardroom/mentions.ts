import type { Agent, Member, Provider } from "./types";

/* @mention parsing for the Boardroom composer.
 *
 * Handles are not hard-coded: they come from the workspace's own members and
 * AI profiles ("Claude (Nirav)", "Karthik"), so a renamed member or a third
 * profile works without a code change. The full profile handle always beats a
 * bare "@Claude", and a bare provider name that fits more than one profile is
 * reported as ambiguous instead of being guessed. */

export interface MentionTarget {
  kind: "agent" | "human";
  id: string;
  /** Text shown after the @, e.g. "Claude (Nirav)". */
  handle: string;
  /** Account owner, for an agent. */
  ownerName?: string;
  provider?: Provider;
}

export interface ParsedMention {
  start: number;
  end: number;
  raw: string;
  target: MentionTarget;
}

export interface AmbiguousMention {
  start: number;
  end: number;
  raw: string;
  candidates: MentionTarget[];
}

export interface MentionResult {
  /** Resolved, in order of appearance, one per distinct target. */
  mentions: ParsedMention[];
  /** Bare @Claude / @ChatGPT that fits several profiles: the user must pick. */
  ambiguous: AmbiguousMention[];
  /** A target named twice; the later one is ignored, not turned into a second task. */
  duplicates: ParsedMention[];
  /** AI profiles mentioned but switched off. No task may be created for these. */
  disabled: ParsedMention[];
}

const PROVIDER_WORDS: Record<string, Provider> = {
  claude: "claude",
  chatgpt: "chatgpt",
};

export function agentTarget(agent: Agent, members: Member[]): MentionTarget {
  return {
    kind: "agent",
    id: agent.id,
    handle: agent.display_name,
    provider: agent.provider,
    ownerName: members.find((m) => m.user_id === agent.owner_id)?.display_name,
  };
}

export function humanTarget(member: Member): MentionTarget {
  return { kind: "human", id: member.user_id, handle: member.display_name };
}

const isWordChar = (ch: string | undefined) => !!ch && /[\p{L}\p{N}_]/u.test(ch);

/** Find every @mention in `text`. */
export function parseMentions(
  text: string,
  agents: Agent[],
  members: Member[],
): MentionResult {
  const result: MentionResult = {
    mentions: [],
    ambiguous: [],
    duplicates: [],
    disabled: [],
  };
  const agentById = new Map(agents.map((a) => [a.id, a]));

  type Candidate = { handle: string; targets: MentionTarget[] };
  const candidates: Candidate[] = [];
  for (const a of agents) {
    candidates.push({ handle: a.display_name, targets: [agentTarget(a, members)] });
  }
  for (const m of members) {
    candidates.push({ handle: m.display_name, targets: [humanTarget(m)] });
  }
  for (const [word, provider] of Object.entries(PROVIDER_WORDS)) {
    const matching = agents.filter((a) => a.provider === provider);
    if (matching.length > 0) {
      candidates.push({
        handle: word,
        targets: matching.map((a) => agentTarget(a, members)),
      });
    }
  }
  // Longest handle first so "@Claude (Nirav)" is never read as "@Claude".
  candidates.sort((a, b) => b.handle.length - a.handle.length);

  const seen = new Set<string>();
  const lower = text.toLowerCase();
  let i = 0;
  while (i < text.length) {
    if (text[i] !== "@" || (i > 0 && isWordChar(text[i - 1]))) {
      i += 1;
      continue;
    }
    let matched = false;
    for (const c of candidates) {
      const handle = c.handle.toLowerCase();
      if (!lower.startsWith(handle, i + 1)) continue;
      const end = i + 1 + handle.length;
      if (isWordChar(text[end]) && isWordChar(handle[handle.length - 1])) continue;
      const raw = text.slice(i, end);
      matched = true;
      if (c.targets.length > 1) {
        result.ambiguous.push({ start: i, end, raw, candidates: c.targets });
      } else {
        const target = c.targets[0];
        const mention: ParsedMention = { start: i, end, raw, target };
        const key = `${target.kind}:${target.id}`;
        if (seen.has(key)) {
          result.duplicates.push(mention);
        } else {
          seen.add(key);
          result.mentions.push(mention);
          if (target.kind === "agent" && agentById.get(target.id)?.enabled === false) {
            result.disabled.push(mention);
          }
        }
      }
      i = end;
      break;
    }
    if (!matched) i += 1;
  }
  return result;
}

/** Replace an ambiguous "@Claude" by the profile the user picked. */
export function resolveAmbiguous(
  text: string,
  mention: AmbiguousMention,
  chosen: MentionTarget,
): string {
  return text.slice(0, mention.start) + `@${chosen.handle}` + text.slice(mention.end);
}

export interface MentionQuery {
  /** Index of the "@". */
  start: number;
  query: string;
}

/** The @token the caret is currently inside, if any — drives autocomplete. */
export function activeMentionQuery(text: string, caret: number): MentionQuery | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && isWordChar(before[at - 1])) return null;
  const query = before.slice(at + 1);
  // Handles may contain spaces and a bracketed owner, but a newline or a
  // closed-off sentence ends the mention.
  if (/[\n]/.test(query) || query.length > 40) return null;
  return { start: at, query };
}

/** Rank targets for a partial handle: prefix matches first, then substring. */
export function suggestMentions(
  query: string,
  targets: MentionTarget[],
  limit = 6,
): MentionTarget[] {
  const q = query.trim().toLowerCase();
  const scored = targets
    .map((t) => {
      const h = t.handle.toLowerCase();
      const score = q === "" ? 1 : h.startsWith(q) ? 3 : h.includes(q) ? 2 : 0;
      return { t, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.t.handle.localeCompare(b.t.handle));
  return scored.slice(0, limit).map((s) => s.t);
}

/** Splits text into plain and mention runs for highlighting. */
export function splitForHighlight(
  text: string,
  agents: Agent[],
  members: Member[],
): { text: string; mention: MentionTarget | null }[] {
  const parsed = parseMentions(text, agents, members);
  const all: { start: number; end: number; target: MentionTarget | null }[] = [
    ...parsed.mentions,
    ...parsed.duplicates,
    ...parsed.ambiguous.map((a) => ({ start: a.start, end: a.end, target: null })),
  ].sort((a, b) => a.start - b.start);
  const out: { text: string; mention: MentionTarget | null }[] = [];
  let cursor = 0;
  for (const m of all) {
    if (m.start > cursor) out.push({ text: text.slice(cursor, m.start), mention: null });
    out.push({ text: text.slice(m.start, m.end), mention: m.target });
    cursor = m.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), mention: null });
  return out;
}
