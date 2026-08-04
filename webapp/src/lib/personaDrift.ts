import type { AiPersona, AiConciseness } from "./settings";

export interface PersonaDriftState {
  queries: string[];
  totalWords: number;
  reasks: number;
  followUps: number;
}

export const EMPTY_PERSONA_DRIFT: PersonaDriftState = {
  queries: [],
  totalWords: 0,
  reasks: 0,
  followUps: 0,
};

function words(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function isFollowUp(text: string): boolean {
  return /^(and|also|but|why|how|what about|can you|could you|please explain)\b/i.test(
    text.trim(),
  );
}

function isReask(text: string, previous: string[]): boolean {
  const normalized = normalize(text);
  if (!normalized) return false;
  return (
    /^(again|repeat|explain that|i dont understand|still confused|i still dont understand)\b/i.test(
      normalized,
    ) || previous.some((query) => query === normalized)
  );
}

export function observePersonaDrift(
  state: PersonaDriftState,
  query: string,
): PersonaDriftState {
  const normalized = normalize(query);
  if (!normalized) return state;
  const previous = state.queries.slice(-7);
  return {
    queries: [...previous, normalized].slice(-8),
    totalWords: state.totalWords + words(query),
    reasks: state.reasks + (isReask(normalized, previous) ? 1 : 0),
    followUps: state.followUps + (isFollowUp(query) ? 1 : 0),
  };
}

export interface PersonaDriftNudge {
  instruction: string;
  persona?: AiPersona;
  conciseness?: AiConciseness;
}

/**
 * Produces a deliberately small, non-persistent adjustment. Explicit user
 * preferences remain authoritative; this only helps the assistant respond to
 * the shape of the current conversation.
 */
export function getPersonaDriftNudge(
  state: PersonaDriftState,
): PersonaDriftNudge | null {
  const count = state.queries.length;
  if (count >= 2 && state.reasks >= 2) {
    return {
      instruction:
        "The student appears stuck or is asking again. Slow down, use a simpler concrete example, and end with one small next step.",
      conciseness: "short",
    };
  }
  if (count >= 3 && state.followUps >= 2 && state.totalWords / count >= 10) {
    return {
      instruction:
        "The student is engaged and asking connected follow-ups. Go one layer deeper than usual and connect your answer to what was just discussed.",
      conciseness: "detailed",
    };
  }
  if (count >= 3 && state.totalWords / count <= 6) {
    return {
      instruction:
        "The student's messages are brief. Lead with the answer, avoid unnecessary background, and offer one optional detail rather than a long lecture.",
      conciseness: "short",
    };
  }
  return null;
}
