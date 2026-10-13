/* Typed-in numeric answers, marked by code, not by a model.
 *
 * CBSE papers are mostly constructed responses (research/current-state-audit
 * §3.1), and an LLM judging "is 2.25e8 the same as 2.25 × 10⁸ m/s" is exactly
 * the kind of call that went wrong publicly elsewhere (research/deep-dives.md
 * §3). This parses what a student types and compares it with the key inside
 * a tolerance, deterministically:
 *
 *   9            9.0          -3.5         1,540        ½ not accepted, 1/2 is
 *   2.25e8       2.25 × 10^8  2.25x10⁸     2.25*10^8
 *   9 J          1540 cm³     30√3 m       (√ forms: "30√3", "30 root 3")
 *   √3/2         2√3/3        1/√2         1 1/2        10^8
 *
 * A unit, if typed, must be one the question accepts; leaving it off is
 * fine (the question names the unit it wants). A whole-number key is exact
 * unless the question sets a tolerance. An answer just outside the
 * tolerance but within 5% is still wrong, with a rounding hint, because
 * "check your rounding" teaches more than "wrong".
 *
 * Pure, so every rule is tested. */

export interface NumericKey {
  value: number;
  /** Absolute tolerance. When this or relTolerance is set, the two are the
   * whole rule; with neither, a whole-number key is exact and any other key
   * allows 0.5% (see allowedError). */
  tolerance?: number;
  /** Relative tolerance (0.01 = 1%). */
  relTolerance?: number;
  /** The unit the answer is in, as shown ("J", "cm³", "m/s"). */
  unit?: string;
  /** Other spellings of the unit that also count ("cm3", "cubic cm"). */
  acceptUnits?: string[];
}

export type NumericVerdict =
  | { correct: true; reason: "ok"; value: number }
  | { correct: false; reason: "empty" | "unparseable" | "wrong-unit" | "rounding" | "wrong"; value: number | null };

const SUPERSCRIPTS: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-",
};

function normaliseUnit(unit: string): string {
  return unit
    .toLowerCase()
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => SUPERSCRIPTS[c] ?? c)
    .replace(/\^/g, "")
    .replace(/\s+/g, "")
    .replace(/[.]/g, "");
}

const NUM = String.raw`\d+(?:\.\d+)?|\.\d+`;
/* One factor: a number, a surd, or both ("2", "√3", "2√3", "30 root 3"). */
const TERM = new RegExp(String.raw`^(${NUM})?\s*(?:(?:√|root|sqrt)\s*\(?\s*(${NUM})\s*\)?)?`, "i");
const SCI = /^\s*(?:[×x*]\s*10\s*\^\s*([-+]?\d+)|e\s*([-+]?\d+))/i;
const MIXED = /^(\d+)\s+(\d+)\s*\/\s*(\d+)/;
const POWER_OF_TEN = /^10\s*\^\s*([-+]?\d+)/;
/* What may follow the number as a unit (letters, /, ², ³, °, Ω, %). It starts
   with a unit symbol, never a digit: "12 15" is two numbers, not 12 of a unit
   called "15", and "1 1/2" is a mixed number. */
const UNIT = /^[a-zA-Zµμ°Ωω%][a-zA-Zµμ°Ωω%/·^0-9⁰¹²³⁴⁵⁶⁷⁸⁹⁻\s]*$/;

function readTerm(s: string): { value: number; length: number; surd: boolean } | null {
  const m = TERM.exec(s);
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;
  const coefficient = m[1] !== undefined ? Number(m[1]) : 1;
  const value = m[2] !== undefined ? coefficient * Math.sqrt(Number(m[2])) : coefficient;
  return { value, length: m[0].length, surd: m[2] !== undefined };
}

/** The number (and any trailing unit) in what a student typed, or null. */
export function parseNumeric(input: string): { value: number; unit: string } | null {
  let s = input.trim();
  if (!s) return null;
  s = s
    .replace(/[−–]/g, "-")
    .replace(/(\d),(?=\d{3}\b)/g, "$1") // thousands separators
    /* Superscripts are exponents only on a power of ten; in "cm³" they are
       part of the unit and stay as typed. */
    .replace(/10([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)/g, (_, p: string) => `10^${[...p].map((c) => SUPERSCRIPTS[c]).join("")}`);

  let sign = 1;
  if (/^[-+]/.test(s)) {
    if (s[0] === "-") sign = -1;
    s = s.slice(1).trimStart();
  }

  /* A mixed number, a bare power of ten, or a factor (× 10^b when it has no
     surd) over an optional factor: "1 1/2", "10^8", "2.25e8", "√3/2",
     "2√3/3", "1/√2". */
  let value: number;
  let rest: string;
  const mixed = MIXED.exec(s);
  const power = POWER_OF_TEN.exec(s);
  if (mixed) {
    const d = Number(mixed[3]);
    if (d === 0) return null;
    value = Number(mixed[1]) + Number(mixed[2]) / d;
    rest = s.slice(mixed[0].length);
  } else if (power) {
    value = 10 ** Number(power[1]);
    rest = s.slice(power[0].length);
  } else {
    const top = readTerm(s);
    if (!top) return null;
    value = top.value;
    rest = s.slice(top.length);
    const sci = top.surd ? null : SCI.exec(rest);
    if (sci) {
      value *= 10 ** Number(sci[1] ?? sci[2]);
      rest = rest.slice(sci[0].length);
    }
    const slash = /^\s*\/\s*/.exec(rest);
    const bottom = slash ? readTerm(rest.slice(slash[0].length)) : null;
    if (slash && bottom) {
      if (bottom.value === 0) return null;
      value /= bottom.value;
      rest = rest.slice(slash[0].length + bottom.length);
    }
  }
  value *= sign;
  if (!Number.isFinite(value)) return null;
  const unit = rest.trim();
  /* Anything left that isn't a plausible unit means it wasn't a number we
     understood. */
  if (unit && !UNIT.test(unit)) return null;
  return { value, unit };
}

/* How far from the key still counts. A tolerance the question sets is the
   whole rule ("to one decimal place" means ±0.05, not that or 0.5%, whichever
   is wider). Without one, a whole-number key is exact: it is a count or an
   exact result, and 624 is not the sum of the first 25 odd numbers. Any other
   key allows 0.5%, so honest rounding of a decimal passes. */
function allowedError(key: NumericKey): number {
  if (key.tolerance !== undefined || key.relTolerance !== undefined) {
    return Math.max(key.tolerance ?? 0, (key.relTolerance ?? 0) * Math.abs(key.value), 1e-9);
  }
  if (Number.isInteger(key.value)) return 1e-9;
  return Math.max(0.005 * Math.abs(key.value), 1e-9);
}

export function gradeNumeric(input: string, key: NumericKey): NumericVerdict {
  if (!input.trim()) return { correct: false, reason: "empty", value: null };
  const parsed = parseNumeric(input);
  if (!parsed) return { correct: false, reason: "unparseable", value: null };
  const { value, unit } = parsed;

  if (unit && key.unit) {
    const allowed = [key.unit, ...(key.acceptUnits ?? [])].map(normaliseUnit);
    if (!allowed.includes(normaliseUnit(unit))) return { correct: false, reason: "wrong-unit", value };
  }

  const allowed = allowedError(key);
  const diff = Math.abs(value - key.value);
  if (diff <= allowed) return { correct: true, reason: "ok", value };
  if (diff <= Math.max(allowed, 0.05 * Math.abs(key.value))) return { correct: false, reason: "rounding", value };
  return { correct: false, reason: "wrong", value };
}

/** What to tell the student after a wrong numeric answer. */
export function numericFeedback(verdict: NumericVerdict, key: NumericKey): string {
  switch (verdict.reason) {
    case "ok":
      return "Correct.";
    case "empty":
      return "Type a number first.";
    case "unparseable":
      return "That isn't a number this can read. Try digits like 2.25, 1/3, √3/2 or 2.25 × 10^8.";
    case "wrong-unit":
      return `Check the unit: the answer is in ${key.unit}.`;
    case "rounding":
      return "Close — check your rounding or an intermediate step.";
    default:
      return "Not quite.";
  }
}

/** The key as a student should see it: "9 J". */
export function formatNumericKey(key: NumericKey): string {
  const n = Number.isInteger(key.value) ? String(key.value) : String(Number(key.value.toPrecision(6)));
  return key.unit ? `${n} ${key.unit}` : n;
}
