import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import {
  conceptKey,
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

const ROW_COLUMNS =
  "id, subject, concept, concept_key, summary, status, severity, origin_tool, times_observed, times_corrected, first_seen_at, last_seen_at, resolved_at";

/** Severity only ever ratchets upward on an existing row. A Sparring omission
 *  (minor) arriving after a Debugger trace (critical) describes the same belief
 *  more weakly, and letting the newer, weaker reading win would quietly
 *  downgrade the most serious diagnosis the app has made. */
const SEVERITY_RANK: Record<MisconceptionSeverity, number> = {
  minor: 1,
  moderate: 2,
  critical: 3,
};

export const misconceptionsApi = {
  /** The whole ledger, newest activity first. Small by nature — a student
   *  accumulates tens of rows, not thousands — so it is fetched whole and
   *  filtered in `lib/misconceptions.ts` rather than re-queried per view. */
  async fetchAll(): Promise<Misconception[]> {
    await requireUserId();
    const { data, error } = await supabase
      .from("misconceptions")
      .select(ROW_COLUMNS)
      .order("last_seen_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => toMisconception(r as MisconceptionRow));
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
          .select(ROW_COLUMNS)
          .eq("subject", candidate.subject)
          .eq("concept_key", key)
          .limit(1);
        const existing = (existingRows?.[0] as MisconceptionRow | undefined) ?? null;

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

        const { data: upserted, error: upsertError } = await supabase
          .from("misconceptions")
          .upsert(
            {
              ...(existing ? { id: existing.id } : {}),
              user_id: userId,
              subject: candidate.subject,
              concept: existing?.concept ?? candidate.concept,
              concept_key: key,
              /* Keep the first real diagnosis. Later tools tend to paraphrase
                 more vaguely, and the summary is what gets quoted back. */
              summary: existing?.summary?.trim()
                ? existing.summary
                : candidate.summary,
              severity,
              origin_tool: existing?.origin_tool ?? candidate.tool,
            },
            { onConflict: "user_id,subject,concept_key" },
          )
          .select(ROW_COLUMNS)
          .single();

        if (upsertError) throw upsertError;
        const row = upserted as MisconceptionRow;

        const { error: obsError } = await supabase
          .from("misconception_observations")
          .insert({
            user_id: userId,
            misconception_id: row.id,
            source_tool: candidate.tool,
            source_id: candidate.sourceId ?? null,
            kind: candidate.kind,
            detail: candidate.detail,
          });
        if (obsError) throw obsError;

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
