/* The five ways a Session teaches. One screen (views/session), one shell;
 * the mode decides what fills the centre column and which AI endpoint
 * answers. Kept here, not in the view, because Today, the sidebar, the
 * results screen and the old-URL redirects all name modes too. */

export const SESSION_MODES = [
  "explain",
  "socratic",
  "practice",
  "teach",
  "recall",
] as const;

export type SessionMode = (typeof SESSION_MODES)[number];

export const MODE_LABELS: Record<SessionMode, string> = {
  explain: "Explain",
  socratic: "Socratic",
  practice: "Practice",
  teach: "Teach",
  recall: "Recall",
};

export function isSessionMode(value: unknown): value is SessionMode {
  return (
    typeof value === "string" &&
    (SESSION_MODES as readonly string[]).includes(value)
  );
}

/** A new Session in `mode`, optionally about one topic or misconception. */
export function newSessionHref(
  mode: SessionMode,
  params: { topic?: string; misconception?: string; minutes?: number } = {},
): string {
  const q = new URLSearchParams({ mode });
  if (params.topic) q.set("topic", params.topic);
  if (params.misconception) q.set("misconception", params.misconception);
  if (params.minutes) q.set("minutes", String(params.minutes));
  return `/study/new?${q.toString()}`;
}

export function sessionHref(id: string, mode: string): string {
  return `/study/${encodeURIComponent(id)}?mode=${encodeURIComponent(mode)}`;
}
