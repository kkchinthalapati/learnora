/* Region is the one place the app is allowed to know where a student lives.
 *
 * Everything that used to be an "is this India?" branch — currency, payment
 * rails, which curriculum presets to show first, which examiner persona the
 * AI should imitate, which privacy regime governs the account — is a field
 * on a `RegionProfile`. Adding a market is adding a row, never a branch.
 *
 * Detection is a hint, not a lock: `Settings.timezone` and the onboarding
 * answer win over `navigator.language`, and every consumer accepts an
 * explicit region so tests and the settings screen can override it. */

export type RegionId = "IN" | "GB" | "US" | "EU" | "AU" | "CA" | "INTL";

export type PrivacyRegime = "GDPR" | "FERPA" | "DPDP" | "PIPEDA" | "APP" | "NONE";

/** The exam-board vocabulary the AI examiner personas borrow from. */
export interface CurriculumFramework {
  id: string;
  /** e.g. "CBSE Board", "GCSE", "AP" — used verbatim in persona copy. */
  boardLabel: string;
  /** e.g. "NCERT", "specification", "College Board" — the canonical text a
   *  strict marker checks keywords against. */
  syllabusLabel: string;
  /** What a full-credit answer is called: "Full marks", "Full credit". */
  fullCreditLabel: string;
}

export interface RegionProfile {
  id: RegionId;
  label: string;
  /** ISO 4217. Prices are looked up by this, never by region. */
  currency: string;
  /** BCP 47 for number/date formatting. `undefined` = follow the browser. */
  locale?: string;
  /** Shown under the paywall price. */
  paymentHint?: string;
  privacy: PrivacyRegime;
  /** Curriculum preset ids shown first in onboarding for this region. */
  presetIds: readonly string[];
  framework: CurriculumFramework;
  /** IANA prefixes that map a browser here when no locale hint is present. */
  timeZonePrefixes: readonly string[];
  /** BCP 47 region subtags (lowercase) that map here. */
  localeRegions: readonly string[];
}

const GENERIC_FRAMEWORK: CurriculumFramework = {
  id: "generic",
  boardLabel: "exam board",
  syllabusLabel: "syllabus",
  fullCreditLabel: "Full credit",
};

export const REGIONS: Readonly<Record<RegionId, RegionProfile>> = {
  IN: {
    id: "IN",
    label: "India",
    currency: "INR",
    locale: "en-IN",
    paymentHint: "Supports UPI (Google Pay, PhonePe, Paytm), Net Banking & Cards",
    privacy: "DPDP",
    presetIds: ["cbse-10", "icse-10"],
    framework: {
      id: "cbse",
      boardLabel: "CBSE Board",
      syllabusLabel: "NCERT",
      fullCreditLabel: "Full marks",
    },
    timeZonePrefixes: ["Asia/Kolkata", "Asia/Calcutta"],
    localeRegions: ["in"],
  },
  GB: {
    id: "GB",
    label: "United Kingdom",
    currency: "GBP",
    locale: "en-GB",
    privacy: "GDPR",
    presetIds: ["gcse-11", "a-level-13"],
    framework: {
      id: "gcse",
      boardLabel: "GCSE / A-Level",
      syllabusLabel: "exam-board specification",
      fullCreditLabel: "Full marks",
    },
    timeZonePrefixes: ["Europe/London"],
    localeRegions: ["gb", "uk"],
  },
  US: {
    id: "US",
    label: "United States",
    currency: "USD",
    locale: "en-US",
    privacy: "FERPA",
    presetIds: ["ap-12", "sat-11"],
    framework: {
      id: "ap",
      boardLabel: "AP / College Board",
      syllabusLabel: "course framework",
      fullCreditLabel: "Full credit",
    },
    timeZonePrefixes: ["America/"],
    localeRegions: ["us"],
  },
  CA: {
    id: "CA",
    label: "Canada",
    currency: "CAD",
    locale: "en-CA",
    privacy: "PIPEDA",
    presetIds: ["ap-12", "ib-dp"],
    framework: {
      id: "ib",
      boardLabel: "IB / provincial",
      syllabusLabel: "curriculum guide",
      fullCreditLabel: "Full credit",
    },
    timeZonePrefixes: ["America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg", "America/Halifax"],
    localeRegions: ["ca"],
  },
  AU: {
    id: "AU",
    label: "Australia",
    currency: "AUD",
    locale: "en-AU",
    privacy: "APP",
    presetIds: ["ib-dp", "atar-12"],
    framework: {
      id: "atar",
      boardLabel: "HSC / VCE",
      syllabusLabel: "syllabus",
      fullCreditLabel: "Full marks",
    },
    timeZonePrefixes: ["Australia/"],
    localeRegions: ["au", "nz"],
  },
  EU: {
    id: "EU",
    label: "Europe",
    currency: "EUR",
    privacy: "GDPR",
    presetIds: ["ib-dp"],
    framework: {
      id: "ib",
      boardLabel: "IB",
      syllabusLabel: "subject guide",
      fullCreditLabel: "Full marks",
    },
    timeZonePrefixes: ["Europe/"],
    localeRegions: ["de", "fr", "es", "it", "nl", "ie", "pt", "at", "be", "fi", "se", "dk", "pl"],
  },
  INTL: {
    id: "INTL",
    label: "International",
    currency: "USD",
    privacy: "GDPR",
    presetIds: ["ib-dp", "gcse-11"],
    framework: GENERIC_FRAMEWORK,
    timeZonePrefixes: [],
    localeRegions: [],
  },
};

export const REGION_IDS = Object.keys(REGIONS) as RegionId[];

export function isRegionId(v: unknown): v is RegionId {
  return typeof v === "string" && v in REGIONS;
}

/* Longest prefix wins, so "America/Toronto" beats "America/". */
function regionForTimeZone(tz: string): RegionId | null {
  let best: { id: RegionId; len: number } | null = null;
  for (const r of Object.values(REGIONS)) {
    for (const p of r.timeZonePrefixes) {
      if (tz.startsWith(p) && (!best || p.length > best.len)) {
        best = { id: r.id, len: p.length };
      }
    }
  }
  return best?.id ?? null;
}

function regionForLocales(langs: readonly string[]): RegionId | null {
  for (const l of langs) {
    const sub = l.toLowerCase().split("-")[1];
    if (!sub) continue;
    const hit = Object.values(REGIONS).find((r) => r.localeRegions.includes(sub));
    if (hit) return hit.id;
  }
  return null;
}

/** Best guess from the runtime. Pass an explicit timezone (Settings) to
 *  prefer it over the browser's. Never throws; falls back to INTL. */
export function detectRegion(timezone?: string): RegionId {
  const langs =
    typeof navigator !== "undefined"
      ? navigator.languages?.length
        ? navigator.languages
        : [navigator.language || ""]
      : [];
  const byLocale = regionForLocales(langs);
  if (byLocale) return byLocale;

  let tz = timezone || "";
  if (!tz && typeof Intl !== "undefined") {
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch {}
  }
  return regionForTimeZone(tz) ?? "INTL";
}

/* Settings live in localStorage under lib/settings.ts's key. Read directly
   here (not via settings.ts) so this module stays import-free of the app
   layer and can be used by api/* modules at load time. Absent, malformed or
   "auto" all mean "detect". */
const SETTINGS_STORAGE_KEY = "learnora_settings";

function readSettingsOverride(): { region?: unknown; framework?: unknown; gradeScale?: unknown } {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Explicit region > Settings override > detection. */
export function getRegion(id?: RegionId | null): RegionProfile {
  if (id && isRegionId(id)) return REGIONS[id];
  const override = readSettingsOverride().region;
  if (isRegionId(override)) return REGIONS[override];
  return REGIONS[detectRegion()];
}

export const FRAMEWORKS: Readonly<Record<string, CurriculumFramework>> = Object.fromEntries(
  [GENERIC_FRAMEWORK, ...Object.values(REGIONS).map((r) => r.framework)].map((f) => [f.id, f]),
);

export function isFrameworkId(v: unknown): v is string {
  return typeof v === "string" && v in FRAMEWORKS;
}

/** The examiner vocabulary in force: Settings override, else the region's. */
export function getFramework(regionId?: RegionId | null): CurriculumFramework {
  const override = readSettingsOverride().framework;
  if (isFrameworkId(override)) return FRAMEWORKS[override];
  return getRegion(regionId).framework;
}

/** Raw Settings grade-scale override, validated by lib/gradeScale.ts. */
export function readGradeScaleOverride(): unknown {
  return readSettingsOverride().gradeScale;
}

/** Money is always minor units in; a localized string out. */
export function formatMoney(
  minorUnits: number,
  currency: string,
  locale?: string,
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: minorUnits % 100 === 0 ? 0 : 2,
  }).format(minorUnits / 100);
}

/** Rights copy the account screens must surface, keyed by regime. */
export const PRIVACY_RIGHTS: Readonly<Record<PrivacyRegime, { label: string; exportLabel: string; deleteLabel: string }>> = {
  GDPR: { label: "GDPR", exportLabel: "Download my data (Art. 20)", deleteLabel: "Erase my account (Art. 17)" },
  FERPA: { label: "FERPA", exportLabel: "Request my education records", deleteLabel: "Delete my account" },
  DPDP: { label: "DPDP Act", exportLabel: "Download my data", deleteLabel: "Erase my account" },
  PIPEDA: { label: "PIPEDA", exportLabel: "Access my personal information", deleteLabel: "Delete my account" },
  APP: { label: "Privacy Act", exportLabel: "Access my personal information", deleteLabel: "Delete my account" },
  NONE: { label: "Privacy", exportLabel: "Download my data", deleteLabel: "Delete my account" },
};
