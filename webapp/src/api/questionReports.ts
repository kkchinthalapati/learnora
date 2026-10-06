/* "Report a problem" on a question or its explanation, and the flags that
 * pull a question out of circulation (migration 20261006000000).
 *
 * A report carries the question's ref, a reason from a short list, an
 * optional note and the wording the student saw — nothing about them but
 * the user id the database stamps. The database enforces one report per
 * question per student and 20 a day; its trigger flags a bank question once
 * three students report it, and a student's own generated question on their
 * report. Flags are read to skip those questions everywhere they'd be served. */

import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";

export const REPORT_REASONS = [
  { id: "wrong_answer", label: "The marked answer is wrong" },
  { id: "more_than_one_answer", label: "More than one answer is right" },
  { id: "unclear", label: "The question is unclear" },
  { id: "explanation_wrong", label: "The explanation is wrong" },
  { id: "off_topic", label: "Not about what I'm studying" },
  { id: "inappropriate", label: "Inappropriate" },
  { id: "other", label: "Something else" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["id"];

export type ReportResult = "sent" | "already" | "limit" | "unavailable";

const REF_RE = /^(bank|quiz|gen):[A-Za-z0-9:_-]{1,160}$/;

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  return !!error && (["42P01", "PGRST205"].includes(error.code ?? "") || /does not exist|could not find/i.test(error.message ?? ""));
}

export const questionReportsApi = {
  async report(input: {
    ref: string;
    reason: ReportReason;
    note?: string;
    questionText?: string;
  }): Promise<ReportResult> {
    await requireUserId();
    if (!REF_RE.test(input.ref)) return "unavailable";
    const { error } = await supabase.from("question_reports").insert({
      question_ref: input.ref,
      reason: input.reason,
      note: input.note?.trim().slice(0, 280) || null,
      question_text: input.questionText?.slice(0, 1500) ?? null,
    });
    if (!error) return "sent";
    if (error.code === "23505") return "already";
    if (error.code === "P0001" || /report limit/i.test(error.message)) return "limit";
    if (isMissingTable(error)) return "unavailable";
    throw new Error(error.message);
  },

  /** Which of these refs have been pulled. Empty when flags can't be read:
   *  a failed lookup must not empty a quiz. */
  async flagged(refs: string[]): Promise<Set<string>> {
    const valid = [...new Set(refs.filter((r) => REF_RE.test(r)))];
    if (valid.length === 0) return new Set();
    try {
      const { data, error } = await supabase
        .from("question_flags")
        .select("question_ref")
        .in("question_ref", valid.slice(0, 200));
      if (error) return new Set();
      return new Set((data ?? []).map((r) => (r as { question_ref: string }).question_ref));
    } catch {
      return new Set();
    }
  },
};
