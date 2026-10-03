/* Oak National Academy's Open Curriculum API, as the question-bank import
 * uses it. `fetch` is injected so the walk is tested without the network.
 *
 * API: https://open-api.thenational.academy — every request needs a free API
 * key (Authorization: Bearer <key>), issued by Oak on request. Content is
 * under the Open Government Licence v3.0 except where stated; the API itself
 * withholds lessons whose content is not OGL-compatible. */

import {
  convertOakLessons,
  specForOakProgramme,
  type BankRowInsert,
  type ImportReport,
  type OakLessonQuiz,
  type OakProgramme,
} from "./build";

export const OAK_API_BASE = "https://open-api.thenational.academy/api/v1";
const PAGE = 100;

type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface OakImportOptions {
  apiKey: string;
  fetchImpl?: FetchLike;
  base?: string;
  /** Oak subject slugs to walk. KS4 science programmes sit under "science". */
  subjects?: string[];
  /** Called with progress lines, for the runner to print. */
  log?: (line: string) => void;
}

export interface OakImportResult extends ImportReport {
  programmes: { slug: string; spec: string | null; rows: number }[];
}

async function getJson(fetchImpl: FetchLike, url: string, apiKey: string): Promise<unknown> {
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } });
  if (!res.ok) throw new Error(`Oak API ${res.status} for ${url}`);
  return res.json();
}

export async function runOakImport(options: OakImportOptions): Promise<OakImportResult> {
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
  const base = options.base ?? OAK_API_BASE;
  const log = options.log ?? (() => {});
  const subjects = options.subjects ?? ["science", "maths"];

  const result: OakImportResult = { rows: [], skipped: {}, programmes: [] };
  const seen = new Set<string>();

  for (const subject of subjects) {
    const slugs = (await getJson(fetchImpl, `${base}/subjects/${encodeURIComponent(subject)}/programmes`, options.apiKey)) as string[];
    for (const slug of slugs) {
      const programme = (await getJson(fetchImpl, `${base}/programmes/${encodeURIComponent(slug)}`, options.apiKey)) as OakProgramme;
      const spec = specForOakProgramme(programme);
      if (!spec) {
        result.programmes.push({ slug, spec: null, rows: 0 });
        continue;
      }
      const lessons: OakLessonQuiz[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const page = (await getJson(
          fetchImpl,
          `${base}/programmes/${encodeURIComponent(slug)}/questions?limit=${PAGE}&offset=${offset}`,
          options.apiKey,
        )) as OakLessonQuiz[];
        lessons.push(...page);
        if (page.length < PAGE) break;
      }
      const report = await convertOakLessons(lessons, spec, seen);
      result.rows.push(...report.rows);
      for (const [reason, n] of Object.entries(report.skipped)) {
        const key = reason as keyof ImportReport["skipped"];
        result.skipped[key] = (result.skipped[key] ?? 0) + (n ?? 0);
      }
      result.programmes.push({ slug, spec: spec.id, rows: report.rows.length });
      log(`${slug}: ${lessons.length} lessons → ${report.rows.length} questions`);
    }
  }
  return result;
}

/** Insert rows through PostgREST with the service role, skipping any already
 *  present (same source and content hash). */
export async function upsertRows(
  rows: BankRowInsert[],
  supabaseUrl: string,
  serviceKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/question_bank?on_conflict=source,content_hash`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    written += batch.length;
  }
  return written;
}
