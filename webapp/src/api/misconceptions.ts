import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import {
  conceptKey,
  isPlaceholderSummary,
  prepareCandidates,
  type Misconception,
  type MisconceptionCandidate,
  type MisconceptionObservation,
  type MisconceptionSeverity,
  type MisconceptionTool,
} from "../lib/misconceptions";

/* Persistence for the misconception ledger.
 * See supabase/migrations/20260907000000_add_misconception_ledger.sql.
 *
 * The pure half — normalisation, ranking, and the extractors that read a
 * diagnosis out of each tool's result — is in lib/misconceptions.ts, kept
 * apart for the same reason lib/studentEvidence.ts is: the merge rule is the
 * part worth testing and it should not need a Supabase double.
 *
 * Rows are snake_case and flat; the app's Misconception type is camelCase.
 * The mapping lives here.
 */

interface MisconceptionRow {
  id: string;
  subject: string;
  concept: string;
  concept_key: string;
  summary: string;
  status: Misconception["status"];
  severity: MisconceptionSeverity;
  origin_tool: MisconceptionTool;
  times_observed: number;
  times_corrected: number;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  /* Present once 20261005010000_mistake_loop.sql is applied. */
  provisional?: boolean;
  error_type?: Misconception["errorType"];
  catalogue_id?: string | null;
  repair_text?: string | null;
  contrast_text?: string | null;
  repaired_at?: string | null;
  retest_due_at?: string | null;
  excluded_question_keys?: string[] | null;
}

interface ObservationRow {
  id: string;
  misconception_id: string;
  source_tool: MisconceptionTool;
  source_id: string | null;
  kind: "evidence" | "correction";
  detail: string;
  occurred_at: string;
}

const toMisconception = (r: MisconceptionRow): Misconception => ({
  id: r.id,
  subject: r.subject,
  concept: r.concept,
  conceptKey: r.concept_key,
  summary: r.summary,
  status: r.status,
  severity: r.severity,
  originTool: r.origin_tool,
  timesObserved: r.times_observed,
  timesCorrected: r.times_corrected,
  firstSeenAt: r.first_seen_at,
  lastSeenAt: r.last_seen_at,
  resolvedAt: r.resolved_at,
  provisional: r.provisional ?? false,
  errorType: r.error_type ?? null,
  catalogueId: r.catalogue_id ?? null,
  repairText: r.repair_text ?? null,
  contrastText: r.contrast_text ?? null,
  repairedAt: r.repaired_at ?? null,
  retestDueAt: r.retest_due_at ?? null,
  excludedQuestionKeys: r.excluded_question_keys ?? [],
});

const toObservation = (r: ObservationRow): MisconceptionObservation => ({
  id: r.id,
  misconceptionId: r.misconception_id,
  sourceTool: r.source_tool,
  sourceId: r.source_id,
  kind: r.kind,
  detail: r.detail,
  occurredAt: r.occurred_at,
});

const BASE_COLUMNS =
  "id, subject, concept, concept_key, summary, status, severity, origin_tool, times_observed, times_corrected, first_seen_at, last_seen_at, resolved_at";
const LOOP_COLUMNS =
  ", provisional, error_type, catalogue_id, repair_text, contrast_text, repaired_at, retest_due_at, excluded_question_keys";

/* The webapp deploys on merge; the loop migration is applied by hand, maybe
   later. Until it is, selecting or writing its columns fails with "column
   does not exist", and the ledger must keep working exactly as before. The
   first such error switches the loop off for this page load. */
let loopSupported: boolean | null = null;

/** For tests. */
export function resetLoopSupport(): void {
  loopSupported = null;
}

export function isLoopSupported(): boolean {
  return loopSupported !== false;
}

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist|could not find the .* column/i.test(error.message ?? "")
  );
}

const columns = () => BASE_COLUMNS + (loopSupported === false ? "" : LOOP_COLUMNS);

/** One observation of the repair loop, written idempotently. */
export interface LoopObservationInput {
  misconceptionId: string;
  kind: "evidence" | "correction" | "repair";
  sourceTool: MisconceptionTool;
  questionKey: string | null;
  idempotencyKey: string;
  occurredAt?: string;
  dueAt?: string | null;
  detail: string;
}

export type LoopWriteResult = "written" | "unsupported";

/** Severity only ever ratchets upward on an existing row. A Sparring omission
 *  (minor) arriving after a Debugger trace (critical) describes the same belief
 *  more weakly, and letting the newer, weaker reading win would quietly
 *  downgrade the most serious diagnosis the app has made. */
const SEVERITY_RANK: Record<MisconceptionSeverity, number> = {
  minor: 1,
  moderate: 2,
  critical: 3,
};

/** What a candidate adds to its row under the loop. A named diagnosis
 *  (anything not provisional) verifies a provisional row; a provisional one
 *  never un-verifies a named row. Repair text, once written, is kept unless
 *  the catalogue supplies its own. */
function loopFields(existing: MisconceptionRow | null, c: MisconceptionCandidate) {
  const provisional = existing
    ? (existing.provisional ?? false) && (c.provisional ?? false)
    : (c.provisional ?? false);
  const fromCatalogue = !!c.catalogueId;
  const keepRepair = !!existing?.repair_text && !fromCatalogue;
  return {
    provisional,
    error_type: c.errorType ?? existing?.error_type ?? null,
    catalogue_id: c.catalogueId ?? existing?.catalogue_id ?? null,
    repair_text: keepRepair ? existing!.repair_text : (c.repairText ?? existing?.repair_text ?? null),
    contrast_text: keepRepair
      ? (existing!.contrast_text ?? null)
      : (c.contrastText ?? existing?.contrast_text ?? null),
  };
}

type ObservationInsert = {
  misconception_id: string;
  source_tool: MisconceptionTool;
  source_id: string | null;
  kind: "evidence" | "correction" | "repair";
  detail: string;
  question_key: string | null;
  idempotency_key: string | null;
  due_at?: string | null;
  occurred_at?: string;
};

const LOOP_OBSERVATION_FIELDS = ["question_key", "idempotency_key", "due_at", "occurred_at"] as const;

/** Insert one observation. With an idempotency key it is an insert that
 *  ignores a duplicate on (user_id, idempotency_key), so a retry or an offline
 *  replay lands once. Before the loop migration, the loop fields are dropped
 *  and it is a plain insert, as it always was — unless `loopOnly`, where
 *  there is nothing meaningful left to write. */
async function writeObservation(
  userId: string,
  obs: ObservationInsert,
  { loopOnly = false }: { loopOnly?: boolean } = {},
): Promise<{ error: unknown; unsupported?: boolean }> {
  const plain = () => {
    const p: Record<string, unknown> = { ...obs, user_id: userId };
    for (const f of LOOP_OBSERVATION_FIELDS) delete p[f];
    return p;
  };
  if (loopSupported === false) {
    if (loopOnly || obs.kind === "repair") return { error: null, unsupported: true };
    const { error } = await supabase.from("misconception_observations").insert(plain());
    return { error };
  }
  const full = { ...obs, user_id: userId };
  const { error } = obs.idempotency_key
    ? await supabase
        .from("misconception_observations")
        .upsert(full, { onConflict: "user_id,idempotency_key", ignoreDuplicates: true })
    : await supabase.from("misconception_observations").insert(full);
  if (error && isMissingColumn(error as { code?: string; message?: string })) {
    loopSupported = false;
    return writeObservation(userId, obs, { loopOnly });
  }
  return { error };
}

export const misconceptionsApi = {
  /** The whole ledger, newest activity first. Small by nature — a student
   *  accumulates tens of rows, not thousands — so it is fetched whole and
   *  filtered in `lib/misconceptions.ts` rather than re-queried per view. */
  async fetchAll(): Promise<Misconception[]> {
    await requireUserId();
    let { data, error } = await supabase
      .from("misconceptions")
      .select(columns())
      .order("last_seen_at", { ascending: false });
    if (error && loopSupported !== false && isMissingColumn(error)) {
      loopSupported = false;
      ({ data, error } = await supabase
        .from("misconceptions")
        .select(columns())
        .order("last_seen_at", { ascending: false }));
    }
    if (error) throw error;
    return (data ?? []).map((r) => toMisconception(r as unknown as MisconceptionRow));
  },

  /** The evidence trail behind one row, newest first. This is what backs the
   *  claim "three times, across two tools" in the UI — it is shown, not
   *  summarised, so a student can check it. */
  async fetchObservations(
    misconceptionId: string,
  ): Promise<MisconceptionObservation[]> {
    await requireUserId();
    const { data, error } = await supabase
      .from("misconception_observations")
      .select(
        "id, misconception_id, source_tool, source_id, kind, detail, occurred_at",
      )
      .eq("misconception_id", misconceptionId)
      .order("occurred_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => toObservation(r as ObservationRow));
  },

  /**
   * Write a batch of diagnoses to the ledger.
   *
   * The merge happens on `(user_id, subject, concept_key)`: whichever tool
   * describes a belief, it lands on one row. Each candidate then appends an
   * observation, and the database trigger recomputes counts and status from
   * the trail — so status is never whatever the last writer asserted.
   *
   * Best-effort, and deliberately so. Every caller runs this as a side effect
   * of a study action the student actually asked for — finishing a quiz,
   * teaching the apprentice. A ledger write failing must never surface as that
   * action failing, so this resolves to the rows it managed to write and logs
   * the rest. That matches `loadStudentEvidence`, which degrades to
   * EMPTY_EVIDENCE rather than throwing into a chat reply.
   */
  async record(candidates: MisconceptionCandidate[]): Promise<Misconception[]> {
    const usable = prepareCandidates(candidates);
    if (usable.length === 0) return [];

    let userId: string;
    try {
      userId = await requireUserId();
    } catch (err) {
      console.warn("[misconceptions] Not signed in; skipping ledger write:", err);
      return [];
    }

    const written: Misconception[] = [];

    for (const candidate of usable) {
      try {
        const key = conceptKey(candidate.concept);

        /* Read before write: the upsert below must not clobber a stronger
           severity or an earlier first_seen_at, and neither is expressible in
           a single ON CONFLICT without a stored procedure. The race this
           leaves — two tools recording the same concept in the same instant —
           costs at most one severity ratchet, which the next observation
           repairs. */
        const { data: existingRows } = await supabase
          .from("misconceptions")
          .select(columns())
          .eq("subject", candidate.subject)
          .eq("concept_key", key)
          .limit(1);
        const existing = (existingRows?.[0] as unknown as MisconceptionRow | undefined) ?? null;

        const severity: MisconceptionSeverity =
          existing &&
          SEVERITY_RANK[existing.severity] >= SEVERITY_RANK[candidate.severity]
            ? existing.severity
            : candidate.severity;

        /* A correction must not create a row. "The student got this right" is
           only meaningful against a belief already on record — writing it
           fresh would populate the ledger with things the student knows,
           which is the opposite of what it is for. */
        if (!existing && candidate.kind === "correction") continue;

        /* A quiz's "Missed: …" is a stand-in, not a diagnosis, so the first
           real one to arrive takes its place. A real summary is never
           replaced. */
        const upgradesPlaceholder =
          !!existing &&
          isPlaceholderSummary(existing.summary) &&
          !!candidate.summary &&
          !isPlaceholderSummary(candidate.summary);

        const base = {
              ...(existing ? { id: existing.id } : {}),
              user_id: userId,
              subject: candidate.subject,
              concept: existing?.concept ?? candidate.concept,
              concept_key: key,
              /* Keep the first real diagnosis. Later tools tend to paraphrase
                 more vaguely, and the summary is what gets quoted back. */
              summary:
                existing?.summary?.trim() && !upgradesPlaceholder
                  ? existing.summary
                  : candidate.summary,
              severity,
              origin_tool: existing?.origin_tool ?? candidate.tool,
        };
        const upsertRow = (payload: object) =>
          supabase
            .from("misconceptions")
            .upsert(payload, { onConflict: "user_id,subject,concept_key" })
            .select(columns())
            .single();
        let { data: upserted, error: upsertError } = await upsertRow(
          loopSupported === false ? base : { ...base, ...loopFields(existing, candidate) },
        );
        if (upsertError && loopSupported !== false && isMissingColumn(upsertError)) {
          loopSupported = false;
          ({ data: upserted, error: upsertError } = await upsertRow(base));
        }

        if (upsertError) throw upsertError;
        const row = upserted as unknown as MisconceptionRow;

        if (candidate.skipIfSourceRecorded && candidate.sourceId) {
          const { data: prior } = await supabase
            .from("misconception_observations")
            .select("id")
            .eq("misconception_id", row.id)
            .eq("source_id", candidate.sourceId)
            .eq("kind", candidate.kind)
            .limit(1);
          if (prior && prior.length > 0) {
            written.push(toMisconception(row));
            continue;
          }
        }

        const result = await writeObservation(userId, {
          misconception_id: row.id,
          source_tool: candidate.tool,
          source_id: candidate.sourceId ?? null,
          kind: candidate.kind,
          detail: candidate.detail,
          question_key: candidate.questionKey ?? null,
          idempotency_key: candidate.idempotencyKey ?? null,
          ...(candidate.occurredAt ? { occurred_at: candidate.occurredAt } : {}),
        });
        if (result.error) throw result.error;

        written.push(toMisconception(row));
      } catch (err) {
        console.warn(
          `[misconceptions] Failed to record "${candidate.concept}":`,
          err,
        );
      }
    }

    return written;
  },

  /**
   * One step of the repair loop against an existing row: the repair being
   * shown, or a retest answered. Idempotent: the same key twice is one
   * write. Resolves "unsupported" (and writes nothing) until the loop
   * migration is applied, so the old ledger behaviour is untouched. Throws on
   * a real failure so the offline queue can retry it.
   */
  async recordObservation(input: LoopObservationInput): Promise<LoopWriteResult> {
    const userId = await requireUserId();
    if (loopSupported === false) return "unsupported";
    const result = await writeObservation(userId, {
      misconception_id: input.misconceptionId,
      source_tool: input.sourceTool,
      source_id: null,
      kind: input.kind,
      detail: input.detail,
      question_key: input.questionKey,
      idempotency_key: input.idempotencyKey,
      due_at: input.dueAt ?? null,
      ...(input.occurredAt ? { occurred_at: input.occurredAt } : {}),
    }, { loopOnly: true });
    if (result.unsupported) return "unsupported";
    if (result.error) throw result.error;
    return "written";
  },

  /** Student-initiated dismissal, for a row they judge wrong or no longer
   *  relevant. Deleting rather than resolving: a resolved row claims they
   *  learned something, and the ledger must not put words in their mouth.
   *  Observations cascade. */
  async dismiss(id: string): Promise<void> {
    await requireUserId();
    const { error } = await supabase.from("misconceptions").delete().eq("id", id);
    if (error) throw error;
  },
};
