// ==========================================
// Mention Detection & Normalization Utilities
// ==========================================

export type AIMentionTarget = "k_ai" | "n_ai";

export interface DetectedMention {
  persona: AIMentionTarget;
  authorId: "agent-k" | "agent-n";
  displayName: "K AI" | "N AI";
  firstIndex: number;
}

// Regex matching @K AI, @k ai, @kai, @k-ai with safe word boundaries
// Preceded by start of string, whitespace, or opening bracket/quote
// Followed by end of string, whitespace, or punctuation
export const K_AI_MENTION_REGEX = /(?:^|[\s([{"'])@(k\s*ai|k-ai|kai)(?=$|[\s,.:;!?)\]}'"])/i;
export const N_AI_MENTION_REGEX = /(?:^|[\s([{"'])@(n\s*ai|n-ai|nai)(?=$|[\s,.:;!?)\]}'"])/i;

// Global regex for stripping mentions in extractMentionQuery
const K_AI_STRIP_REGEX = /@(k\s*ai|k-ai|kai)\b/gi;
const N_AI_STRIP_REGEX = /@(n\s*ai|n-ai|nai)\b/gi;

/**
 * Detects AI co-founder mentions in a message string.
 * Returns an ordered array of detected personas (e.g. ["k_ai"], ["n_ai"], or ["k_ai", "n_ai"]).
 */
export function detectAIMentions(content: string): AIMentionTarget[] {
  if (!content || !content.includes("@")) return [];

  const matches: DetectedMention[] = [];

  const kMatch = content.match(K_AI_MENTION_REGEX);
  if (kMatch && kMatch.index !== undefined) {
    matches.push({
      persona: "k_ai",
      authorId: "agent-k",
      displayName: "K AI",
      firstIndex: kMatch.index,
    });
  }

  const nMatch = content.match(N_AI_MENTION_REGEX);
  if (nMatch && nMatch.index !== undefined) {
    matches.push({
      persona: "n_ai",
      authorId: "agent-n",
      displayName: "N AI",
      firstIndex: nMatch.index,
    });
  }

  // Sort by order of appearance in the string
  matches.sort((a, b) => a.firstIndex - b.firstIndex);
  return matches.map((m) => m.persona);
}

/**
 * Strips mention handles and polite conversational preambles from user input.
 * e.g. "Hey @K AI, what is our CAC target?" -> "what is our CAC target?"
 */
export function extractMentionQuery(content: string): string {
  if (!content) return "";

  let clean = content
    .replace(K_AI_STRIP_REGEX, "")
    .replace(N_AI_STRIP_REGEX, "")
    .trim();

  // Collapse whitespace before trailing punctuation: "moat ?" -> "moat?"
  clean = clean.replace(/\s+([?.!,:;])/g, "$1").trim();

  // Strip leading polite openers like "hey", "hello", "hi", "please", "quick question"
  clean = clean.replace(/^(?:hey|hello|hi|please|quick\s+question)[,:\s-]+/i, "").trim();

  // Strip leading commas, colons, dashes or whitespace
  clean = clean.replace(/^[,:\s-]+/, "").trim();

  return clean || content.trim();
}

/**
 * Checks whether a single token or word represents an AI mention.
 */
export function isAIMention(token: string): boolean {
  if (!token) return false;
  const trimmed = token.trim();
  return (
    K_AI_MENTION_REGEX.test(trimmed) ||
    N_AI_MENTION_REGEX.test(trimmed)
  );
}
