/* Grades are data, not copy. Every readiness / analytics number is a
 * normalised 0–1; the scale a student actually sees (AP 1–5, IB 1–7, GCSE
 * 9–1, US letters, a percentage) is a lookup on the region's framework.
 * Adding a system is adding a row. */

import { getFramework, readGradeScaleOverride, type RegionId } from "./region";

export type GradeScaleId =
  "percent" | "ap" | "ib" | "gcse" | "us_letter" | "atar";

export interface GradeBand {
  /** Inclusive lower bound on the normalised 0–1 score. */
  min: number;
  label: string;
}

export interface GradeScale {
  id: GradeScaleId;
  label: string;
  /** Word for the unit of credit in this system: "marks" or "points". */
  creditNoun: string;
  /** Ordered high → low. */
  bands: readonly GradeBand[];
}

export const GRADE_SCALES: Readonly<Record<GradeScaleId, GradeScale>> = {
  percent: {
    id: "percent",
    label: "Percentage",
    creditNoun: "marks",
    bands: [{ min: 0, label: "%" }],
  },
  ap: {
    id: "ap",
    label: "AP score (1–5)",
    creditNoun: "points",
    bands: [
      { min: 0.85, label: "5" },
      { min: 0.7, label: "4" },
      { min: 0.55, label: "3" },
      { min: 0.4, label: "2" },
      { min: 0, label: "1" },
    ],
  },
  ib: {
    id: "ib",
    label: "IB level (1–7)",
    creditNoun: "marks",
    bands: [
      { min: 0.86, label: "7" },
      { min: 0.74, label: "6" },
      { min: 0.62, label: "5" },
      { min: 0.5, label: "4" },
      { min: 0.38, label: "3" },
      { min: 0.26, label: "2" },
      { min: 0, label: "1" },
    ],
  },
  gcse: {
    id: "gcse",
    label: "GCSE grade (9–1)",
    creditNoun: "marks",
    bands: [
      { min: 0.9, label: "9" },
      { min: 0.8, label: "8" },
      { min: 0.7, label: "7" },
      { min: 0.6, label: "6" },
      { min: 0.5, label: "5" },
      { min: 0.4, label: "4" },
      { min: 0.3, label: "3" },
      { min: 0.2, label: "2" },
      { min: 0, label: "1" },
    ],
  },
  us_letter: {
    id: "us_letter",
    label: "Letter grade",
    creditNoun: "points",
    bands: [
      { min: 0.9, label: "A" },
      { min: 0.8, label: "B" },
      { min: 0.7, label: "C" },
      { min: 0.6, label: "D" },
      { min: 0, label: "F" },
    ],
  },
  atar: {
    id: "atar",
    label: "Band (1–6)",
    creditNoun: "marks",
    bands: [
      { min: 0.9, label: "Band 6" },
      { min: 0.8, label: "Band 5" },
      { min: 0.7, label: "Band 4" },
      { min: 0.6, label: "Band 3" },
      { min: 0.5, label: "Band 2" },
      { min: 0, label: "Band 1" },
    ],
  },
};

export const GRADE_SCALE_IDS = Object.keys(GRADE_SCALES) as GradeScaleId[];

export function isGradeScaleId(v: unknown): v is GradeScaleId {
  return typeof v === "string" && Object.hasOwn(GRADE_SCALES, v);
}

const SCALE_BY_FRAMEWORK: Record<string, GradeScaleId> = {
  cbse: "percent",
  gcse: "gcse",
  ap: "ap",
  ib: "ib",
  atar: "atar",
  generic: "percent",
};

/** The scale a region's default framework reports in. An explicit id
 *  (Settings override, or a tenant pin) wins. */
export function getGradeScale(
  id?: GradeScaleId | null,
  regionId?: RegionId | null,
): GradeScale {
  if (id && isGradeScaleId(id)) return GRADE_SCALES[id];
  const override = readGradeScaleOverride();
  if (isGradeScaleId(override)) return GRADE_SCALES[override];
  return GRADE_SCALES[
    SCALE_BY_FRAMEWORK[getFramework(regionId).id] ?? "percent"
  ];
}

/** Clamp any raw score into 0–1. Accepts 0–1 or 0–100. */
export function normaliseScore(raw: number, max = 1): number {
  if (!Number.isFinite(raw)) return 0;
  const v = max === 1 && raw > 1 ? raw / 100 : raw / max;
  return Math.min(1, Math.max(0, v));
}

/** Render a normalised score in the scale's own vocabulary. */
export function renderGrade(
  normalised: number,
  scale: GradeScale = getGradeScale(),
): string {
  const v = Math.min(1, Math.max(0, normalised));
  if (scale.id === "percent") return `${Math.round(v * 100)}%`;
  return (
    scale.bands.find((b) => v >= b.min)?.label ??
    scale.bands[scale.bands.length - 1].label
  );
}
