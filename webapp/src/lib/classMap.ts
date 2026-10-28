/* The class misconception map — what a teacher may see, and how it reads.
 *
 * The privacy rules are enforced in the database, not here: the teacher's
 * only access is public.class_misconception_map() (migration
 * 20261028000000), which returns nothing until MIN_SHARING students share,
 * drops any belief fewer than MIN_CELL of them hold, and counts catalogue
 * beliefs only, so no student's own words leave their account. These
 * constants mirror that function so the screen can explain itself; a test
 * reads the migration to keep them equal.
 *
 * The whole feature is behind the `classMap` flag, off in production until
 * a privacy review (WAITINGONLEDGER.md). */

import { getKnownMisconception, type KnownMisconception } from "./misconceptionCatalogue";

/** Students who must be sharing before the map shows anything. */
export const MIN_SHARING = 5;
/** A belief held by fewer sharing students than this is not shown. */
export const MIN_CELL = 2;

export interface MapRow {
  catalogue_id: string;
  students: number;
}

export interface MapEntry {
  entry: KnownMisconception;
  students: number;
}

export interface MemberCounts {
  joined: number;
  sharing: number;
}

export type ClassMap =
  | { kind: "too-few"; sharing: number; needed: number }
  | { kind: "empty"; sharing: number }
  | { kind: "ready"; sharing: number; entries: MapEntry[] };

/** What the teacher's screen shows, from the two database calls. Rows for a
 *  belief the app no longer has in its catalogue are dropped rather than
 *  shown as an id. */
export function classMapState(counts: MemberCounts, rows: readonly MapRow[]): ClassMap {
  if (counts.sharing < MIN_SHARING) {
    return { kind: "too-few", sharing: counts.sharing, needed: MIN_SHARING - counts.sharing };
  }
  const entries = rows
    .filter((r) => r.students >= MIN_CELL)
    .map((r) => ({ entry: getKnownMisconception(r.catalogue_id), students: r.students }))
    .filter((e): e is MapEntry => e.entry !== null)
    .sort((a, b) => b.students - a.students || a.entry.concept.localeCompare(b.entry.concept));
  return entries.length === 0 ? { kind: "empty", sharing: counts.sharing } : { kind: "ready", sharing: counts.sharing, entries };
}

/** "4 of the 7 students sharing". */
export function shareOf(students: number, sharing: number): string {
  return `${students} of the ${sharing} ${sharing === 1 ? "student" : "students"} sharing`;
}

/** Join codes are eight characters, letters and digits; students type them
 *  with spaces and in lower case. */
export function normaliseJoinCode(raw: string): string {
  return raw.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8);
}

export function isJoinCode(code: string): boolean {
  return /^[A-Z0-9]{8}$/.test(code);
}
