/* Past papers the student has sat: what they say about readiness.
 *
 * A whole paper under exam conditions, marked against the board's own mark
 * scheme, is the most direct evidence of an exam grade the app can have —
 * better than any quiz. The summary keeps it honest: one paper is one data
 * point, and the trend needs at least three. */

export interface PastPaperAttempt {
  id: string;
  exam_id: number;
  paper: string;
  series: string | null;
  marks: number;
  max_marks: number;
  sat_on: string;
  notes: string | null;
  created_at: string;
}

export interface PastPaperSummary {
  count: number;
  /** Mean percentage across attempts, 0-100, or null with none. */
  average: number | null;
  /** The most recent attempt's percentage. */
  latest: number | null;
  /** Points per paper, from a least-squares line through the attempts in
   *  date order; null below MIN_TREND_PAPERS. */
  trendPerPaper: number | null;
}

export const MIN_TREND_PAPERS = 3;

export function percent(a: Pick<PastPaperAttempt, "marks" | "max_marks">): number {
  return Math.round((Number(a.marks) / Number(a.max_marks)) * 100);
}

export function summarisePastPapers(attempts: PastPaperAttempt[]): PastPaperSummary {
  const ordered = [...attempts].sort(
    (a, b) => a.sat_on.localeCompare(b.sat_on) || a.created_at.localeCompare(b.created_at),
  );
  if (ordered.length === 0) return { count: 0, average: null, latest: null, trendPerPaper: null };
  const ys = ordered.map(percent);
  const average = Math.round(ys.reduce((s, y) => s + y, 0) / ys.length);
  let trendPerPaper: number | null = null;
  if (ys.length >= MIN_TREND_PAPERS) {
    const n = ys.length;
    const meanX = (n - 1) / 2;
    const meanY = ys.reduce((s, y) => s + y, 0) / n;
    let num = 0;
    let den = 0;
    ys.forEach((y, x) => {
      num += (x - meanX) * (y - meanY);
      den += (x - meanX) ** 2;
    });
    trendPerPaper = Math.round((num / den) * 10) / 10;
  }
  return { count: ys.length, average, latest: ys[ys.length - 1], trendPerPaper };
}
