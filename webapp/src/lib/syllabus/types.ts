/* The exam-board ledger's shapes.
 *
 * A student does not sit "Biology". They sit AQA GCSE Biology 8461 at Higher
 * tier, or IB Biology at HL, and what is examined, in what proportion and at
 * what depth differs between them. Everything here exists so the rest of the
 * app can say which of those it is working towards. */

export type Qualification = "GCSE" | "IB" | "CBSE";

/** The tiers a specification is sat at. GCSE: Foundation/Higher. IB: SL/HL.
 *  CBSE Class 10 Mathematics: Standard (041) / Basic (241); a CBSE subject
 *  with one paper for everyone has the single tier Standard, never shown. */
export type SyllabusTier = "Foundation" | "Higher" | "SL" | "HL" | "Standard" | "Basic";

/** Where a topic's weight comes from. `official` is a published weighting
 *  (the DfE's GCSE Maths content weightings); `estimated` shares a paper's
 *  marks evenly across the topics that paper examines. The UI says which. */
export type WeightSource = "official" | "estimated";

export interface SyllabusPaper {
  name: string;
  minutes: number;
  /** Total marks, where the board publishes one fixed figure. */
  marks?: number;
  /** Share of the qualification, 0-100. */
  weightPercent: number;
  /** Units (by `unit` code) this paper examines. Empty means all. */
  units: string[];
  /** Only sat at this tier (e.g. IB Paper 3 differs by level). */
  tier?: SyllabusTier;
}

export interface SyllabusTopic {
  /** The spec's own section reference: "4.4.1", "C1.3", "A17-A22". Unique
   *  within a specification. */
  ref: string;
  title: string;
  /** The unit this topic sits under, by code ("4.4", "C1", "Algebra"). */
  unit: string;
  /** Examined only at this tier ("Higher" = Higher-tier only, "HL" = HL only). */
  tierOnly?: SyllabusTier;
  /** Words and phrases that identify this topic in a free-text label (a quiz
   *  topic, a deck title, a session objective). Lower case. */
  keywords: string[];
  /** Topics (by ref) that should come first. */
  prerequisites?: string[];
}

export interface SyllabusUnit {
  code: string;
  title: string;
  /** Share of total marks at each tier, 0-100. Absent when not published;
   *  the unit then takes its papers' share. */
  weightByTier?: Partial<Record<SyllabusTier, number>>;
}

export interface SyllabusSpec {
  /** Stable id stored on an exam row: "aqa-gcse-biology-8461". */
  id: string;
  board: string;
  qualification: Qualification;
  subject: string;
  /** The school year it is sat in, where the board names one ("Class 10"). */
  level?: string;
  /** The board's code for the specification ("8461"), or "" for IB. */
  code: string;
  country: "UK" | "International" | "India";
  /** Which version of the specification this describes. */
  version: string;
  tiers: SyllabusTier[];
  papers: SyllabusPaper[];
  /** Coursework or internal assessment, outside the written papers. */
  internalAssessment?: { name: string; weightPercent: number };
  weightSource: WeightSource;
  units: SyllabusUnit[];
  topics: SyllabusTopic[];
  /** The board's public page for the specification. */
  specUrl: string;
  /** Specs that share content share practice questions: the three GCSE
   *  Maths specs all read 'gcse-maths'. Defaults to `id`. */
  questionBankKey?: string;
  /** Where the board publishes past papers. Learnora links there and never
   *  copies them: every board reserves its papers (docs/QUESTION_SOURCES.md). */
  pastPapersUrl: string;
}

/** A topic with its share of the exam worked out for one tier. */
export interface WeightedTopic extends SyllabusTopic {
  /** Approximate share of this tier's written-paper marks, 0-100. */
  weightPercent: number;
}
