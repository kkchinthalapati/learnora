/* Fetching a hint ladder (lib/tutorPolicy.ts) for one question.
 *
 * One AI call per question and level, cached on the device, and shared by
 * concurrent callers, so a double-click or a re-render doesn't bill twice.
 * Billed to "chat" (the most generous allowance), routed through callEdge so
 * the daily limits and consent-at-first-use apply as for every AI feature.
 *
 * Nothing is invented on failure: a reply that can't be parsed is retried
 * once, and if there is still no usable ladder the caller gets `degraded`
 * and shows a retry. A template hint would read like the tutor's. */

import { AiError, callEdge } from "./ai";
import { buildHintPrompt, parseHintLadder, type HintLadder, type LadderQuestion } from "../lib/tutorPolicy";
import { cacheLadder, cachedLadder } from "../lib/hintState";
import { questionKey } from "../lib/questionKey";
import { fenceUntrusted } from "../lib/actionTags";

export type HintLadderResult =
  | { ladder: HintLadder; degraded?: undefined }
  | { ladder?: undefined; degraded: { message: string } };

const inflight = new Map<string, Promise<HintLadderResult>>();

/** For tests. */
export function resetHintRequests(): void {
  inflight.clear();
}

function reason(err: unknown): string {
  if (err instanceof AiError && !err.retryable) return err.message;
  return "Couldn't reach the tutor just now.";
}

export function getHintLadder(q: LadderQuestion, level?: string | null): Promise<HintLadderResult> {
  const key = questionKey(q.question);
  const cached = cachedLadder(key, level);
  if (cached) return Promise.resolve({ ladder: cached });
  const id = `${key}|${level ?? ""}`;
  const pending = inflight.get(id);
  if (pending) return pending;

  const safe: LadderQuestion = {
    question: fenceUntrusted(q.question),
    choices: q.choices.map((c) => fenceUntrusted(c)),
    correctIndex: q.correctIndex,
    topic: q.topic ? fenceUntrusted(q.topic) : null,
  };

  const run = (async (): Promise<HintLadderResult> => {
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const result = await callEdge({
          history: [{ role: "user", content: buildHintPrompt(safe, level) }],
          mode: "quiz",
          tool: "chat",
          ...(q.ref?.startsWith("bank:") ? { itemCache: { ref: q.ref } } : {}),
        });
        const { ladder } = parseHintLadder(result.text, q);
        if (ladder) {
          cacheLadder(key, level, ladder);
          return { ladder };
        }
      }
      return { degraded: { message: "The tutor replied, but not with hints we could use." } };
    } catch (err) {
      return { degraded: { message: reason(err) } };
    } finally {
      inflight.delete(id);
    }
  })();
  inflight.set(id, run);
  return run;
}
