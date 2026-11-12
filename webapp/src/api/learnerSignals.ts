/* Reading and writing `learner_signals` (migration 20261109000000); what
 * they mean lives in lib/learnerSignals.ts.
 *
 * Best-effort both ways, like every other evidence write: a signal that
 * fails to save loses a little personalisation, never the lesson. While the
 * table is missing (the migration not applied yet) reads give no signals and
 * writes do nothing, so the screens work the same with or without it. */

import { supabase } from "../lib/supabase";
import { queryClient } from "../lib/queryClient";
import { requireUserId } from "./session";
import {
  feedbackRule,
  SIGNAL_KINDS,
  SIGNAL_SURFACES,
  type LearnerSignal,
  type SignalKind,
  type SignalSurface,
} from "../lib/learnerSignals";

export const learnerSignalsKey = ["learner-signals"] as const;

/** Enough history for every rule in lib/learnerSignals.ts. */
const WINDOW_DAYS = 60;
const LIMIT = 500;
const CACHE_MS = 60_000;

export interface RecordSignalInput {
  kind: SignalKind;
  surface: SignalSurface;
  style?: string | null;
  value?: string | null;
  score?: number | null;
  topicKey?: string | null;
  ref?: string | null;
  /** Idempotency: a second write with the same id is a no-op. */
  clientId?: string | null;
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  return (
    !!error &&
    (["42P01", "PGRST205"].includes(error.code ?? "") || /does not exist|could not find/i.test(error.message ?? ""))
  );
}

interface Row {
  kind: string;
  surface: string;
  style: string | null;
  value: string | null;
  score: number | null;
  topic_key: string | null;
  ref: string | null;
  created_at: string;
}

const toSignal = (r: Row): LearnerSignal | null =>
  (SIGNAL_KINDS as readonly string[]).includes(r.kind) && (SIGNAL_SURFACES as readonly string[]).includes(r.surface)
    ? {
        kind: r.kind as SignalKind,
        surface: r.surface as SignalSurface,
        style: r.style,
        value: r.value,
        score: r.score,
        topicKey: r.topic_key,
        ref: r.ref,
        createdAt: r.created_at,
      }
    : null;

export interface SignalState {
  signals: LearnerSignal[];
  /** False while the table is missing (migration not applied): screens hide
   *  the controls rather than offer ones that save nothing. */
  available: boolean;
}

let cache: { userId: string; at: number; state: Promise<SignalState> } | null = null;

export const learnerSignalsApi = {
  /** The last 60 days, oldest first. [] on any failure. */
  async fetchRecent(): Promise<LearnerSignal[]> {
    return (await learnerSignalsApi.fetchState()).signals;
  },

  /** The signals, and whether they can be saved at all. A failed read keeps
   *  the controls (it may be a blip); only a missing table hides them. */
  async fetchState(): Promise<SignalState> {
    let userId: string;
    try {
      userId = await requireUserId();
    } catch {
      return { signals: [], available: false };
    }
    if (cache?.userId === userId && Date.now() - cache.at < CACHE_MS) return cache.state;
    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
    const state = (async (): Promise<SignalState> => {
      const { data, error } = await supabase
        .from("learner_signals")
        .select("kind, surface, style, value, score, topic_key, ref, created_at")
        .eq("user_id", userId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(LIMIT);
      if (error) {
        if (isMissingTable(error)) return { signals: [], available: false };
        console.warn("[learnerSignals] read failed:", error.message);
        return { signals: [], available: true };
      }
      const signals = ((data ?? []) as Row[])
        .map(toSignal)
        .filter((s): s is LearnerSignal => s !== null)
        .reverse();
      return { signals, available: true };
    })().catch((err: unknown) => {
      console.warn("[learnerSignals] read failed:", err);
      return { signals: [], available: true };
    });
    cache = { userId, at: Date.now(), state };
    return state;
  },

  /** Save one signal. Never throws. */
  async record(input: RecordSignalInput): Promise<void> {
    try {
      const userId = await requireUserId();
      const { error } = await supabase.from("learner_signals").insert({
        user_id: userId,
        kind: input.kind,
        surface: input.surface,
        style: input.style ?? null,
        value: input.value ?? null,
        score: input.score ?? null,
        topic_key: input.topicKey?.slice(0, 160) ?? null,
        ref: input.ref?.slice(0, 200) ?? null,
        client_id: input.clientId?.slice(0, 300) ?? null,
      });
      if (error && error.code !== "23505" && !isMissingTable(error)) {
        console.warn("[learnerSignals] write failed:", error.message);
        return;
      }
    } catch (err) {
      console.warn("[learnerSignals] write failed:", err);
      return;
    } finally {
      /* The next prompt and the screens should see it straight away. */
      cache = null;
      void queryClient.invalidateQueries({ queryKey: learnerSignalsKey });
    }
  },
};

/** The line a generation adds for what the student's recent ratings said;
 *  "" when there is nothing. Never throws. (Their standing preferences are
 *  part of their profile: api/learnerStyle loadLearnerProfileRule.) */
export async function loadAdaptationBlock(): Promise<string> {
  const signals = await learnerSignalsApi.fetchRecent().catch(() => [] as LearnerSignal[]);
  return feedbackRule(signals);
}

/** For tests. */
export function resetLearnerSignalsCache(): void {
  cache = null;
}
