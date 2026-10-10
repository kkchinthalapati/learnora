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
 *
 * A unit, if typed, must be one the question accepts; leaving it off is
 * fine (the question names the unit it wants). An answer just outside the
 * tolerance but within 5% is still wrong, with a rounding hint, because
 * "check your rounding" teaches more than "wrong".
 *
 * Pure, so every rule is tested. */

export interface NumericKey {
  value: number;
  /** Absolute tolerance. Default 0. */
  tolerance?: number;
  /** Relative tolerance. Default 0.5%, so honest rounding passes. */
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

  /* a × 10^b in its many spellings, then a √ factor, then a fraction. */
  const num = String.raw`[-+]?\d+(?:\.\d+)?|[-+]?\.\d+`;
  const sci = new RegExp(String.raw`^(${num})\s*(?:[×x*]\s*10\s*\^\s*(-?\d+)|e\s*(-?\d+))?`, "i");
  const frac = new RegExp(String.raw`^(${num})\s*/\s*(${num})`);
  const root = new RegExp(String.raw`^(${num})?\s*(?:√|root\s*|sqrt\s*)\(?\s*(\d+(?:\.\d+)?)\s*\)?`, "i");

  let value: number;
  let rest: string;
  const r = root.exec(s);
  const f = frac.exec(s);
  if (r && (r[1] !== undefined || /^(√|root|sqrt)/i.test(s))) {
    value = (r[1] !== undefined ? Number(r[1]) : 1) * Math.sqrt(Number(r[2]));
    rest = s.slice(r[0].length);
  } else if (f) {
    const d = Number(f[2]);
    if (d === 0) return null;
    value = Number(f[1]) / d;
    rest = s.slice(f[0].length);
  } else {
    const m = sci.exec(s);
    if (!m) return null;
    const exp = m[2] ?? m[3];
    value = Number(m[1]) * (exp !== undefined ? 10 ** Number(exp) : 1);
    rest = s.slice(m[0].length);
  }
  if (!Number.isFinite(value)) return null;
  const unit = rest.trim();
  /* Anything left that isn't a plausible unit (letters, /, ², ³, °, Ω, %)
     means it wasn't a number we understood. */
  if (unit && !/^[a-zA-Zµμ°Ωω%/·^0-9⁰¹²³⁴⁵⁶⁷⁸⁹⁻\s]+$/.test(unit)) return null;
  return { value, unit };
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

  const abs = key.tolerance ?? 0;
  const rel = key.relTolerance ?? 0.005;
  const allowed = Math.max(abs, rel * Math.abs(key.value), 1e-9);
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
      return "That isn't a number this can read. Try digits like 2.25, 1/3 or 2.25 × 10^8.";
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
