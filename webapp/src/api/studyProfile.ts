/* Saving the study profile and draft outlines (lib/studyProfile.ts).
 *
 * Every answer is saved as it is given: to this device at once (so a reload
 * resumes where they were), and to profiles.study_profile in the background
 * (so another device does). Until migration 20261005020000 is applied the
 * server half writes only what the old schema accepts — the legacy
 * exam_type and region — and the device copy carries the rest. */

import { supabase } from "../lib/supabase";
import { Storage } from "../lib/storage";
import { requireUserId } from "./session";
import { callEdge } from "./ai";
import { extractJSON } from "../lib/aiJson";
import { fenceUntrusted } from "../lib/actionTags";
import { normaliseTopicKey } from "../lib/topicKey";
import {
  EMPTY_PROFILE,
  STUDY_PROFILE_VERSION,
  aiContext,
  equalWeights,
  getSystem,
  regionForCountry,
  type OutlineTopic,
  type StudyProfile,
} from "../lib/studyProfile";

const localKey = (userId: string) => `learnora_study_profile_v1:${userId}`;
const outlineKey = (userId: string) => `learnora_subject_outlines_v1:${userId}`;

let profileColumnsMissing = false;
let outlinesTableMissing = false;

/** For tests. */
export function resetStudyProfileSupport(): void {
  profileColumnsMissing = false;
  outlinesTableMissing = false;
}

function isMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    ["42703", "42P01", "PGRST204", "PGRST205"].includes(error.code ?? "") ||
    /does not exist|could not find/i.test(error.message ?? "")
  );
}

function normalise(raw: unknown): StudyProfile {
  const r = raw && typeof raw === "object" ? (raw as Partial<StudyProfile>) : {};
  return { ...EMPTY_PROFILE, ...r, version: STUDY_PROFILE_VERSION };
}

export interface StoredOutline {
  subject: string;
  topics: OutlineTopic[];
  source: "ai_draft" | "student";
  verified: false;
}

export const studyProfileApi = {
  /** The newer of this device's copy and the server's. */
  async load(): Promise<StudyProfile> {
    const userId = await requireUserId();
    const local = Storage.get<StudyProfile>(localKey(userId));
    let remote: StudyProfile | null = null;
    if (!profileColumnsMissing) {
      const { data, error } = await supabase
        .from("profiles")
        .select("study_profile")
        .eq("id", userId)
        .maybeSingle();
      if (isMissing(error)) profileColumnsMissing = true;
      else if (!error && data?.study_profile) remote = normalise(data.study_profile);
    }
    const pick =
      local && remote
        ? (local.updatedAt ?? "") >= (remote.updatedAt ?? "")
          ? local
          : remote
        : (local ?? remote);
    return normalise(pick);
  },

  /** Save on this device now; the server write is best-effort. */
  async save(p: StudyProfile): Promise<StudyProfile> {
    const userId = await requireUserId();
    const stamped = { ...p, version: STUDY_PROFILE_VERSION, updatedAt: new Date().toISOString() };
    Storage.set(localKey(userId), stamped);

    const system = getSystem(stamped.system);
    const legacy = {
      exam_type: stamped.system ? (system?.legacyExamType ?? "other") : null,
      region: stamped.country ? regionForCountry(stamped.country) : null,
    };
    const full = {
      ...legacy,
      country: stamped.country,
      board: stamped.board?.slice(0, 80) || null,
      age_band: stamped.ageBand,
      study_profile: stamped,
      study_profile_updated_at: stamped.updatedAt,
    };
    try {
      let { error } = await supabase
        .from("profiles")
        .update(profileColumnsMissing ? legacy : full)
        .eq("id", userId);
      if (error && !profileColumnsMissing && isMissing(error)) {
        profileColumnsMissing = true;
        ({ error } = await supabase.from("profiles").update(legacy).eq("id", userId));
      }
      if (error) console.warn("[studyProfile] server save failed; kept on this device:", error.message);
    } catch (err) {
      console.warn("[studyProfile] server save failed; kept on this device:", err);
    }
    return stamped;
  },

  async fetchOutlines(): Promise<Record<string, OutlineTopic[]>> {
    const userId = await requireUserId();
    const local = Storage.get<Record<string, StoredOutline>>(outlineKey(userId), {});
    const out: Record<string, OutlineTopic[]> = {};
    for (const [k, v] of Object.entries(local)) out[k] = v.topics;
    if (outlinesTableMissing) return out;
    const { data, error } = await supabase.from("subject_outlines").select("subject_key, topics");
    if (isMissing(error)) {
      outlinesTableMissing = true;
      return out;
    }
    for (const row of (data ?? []) as { subject_key: string; topics: OutlineTopic[] }[]) {
      out[row.subject_key] = row.topics;
    }
    return out;
  },

  async saveOutline(
    subject: string,
    topics: OutlineTopic[],
    source: StoredOutline["source"],
    meta: { level: string | null; board: string | null },
  ): Promise<void> {
    const userId = await requireUserId();
    const key = normaliseTopicKey(subject);
    const local = Storage.get<Record<string, StoredOutline>>(outlineKey(userId), {});
    local[key] = { subject, topics, source, verified: false };
    Storage.set(outlineKey(userId), local);
    if (outlinesTableMissing) return;
    const { error } = await supabase.from("subject_outlines").upsert(
      {
        user_id: userId,
        subject: subject.slice(0, 80),
        subject_key: key.slice(0, 80) || "subject",
        level: meta.level?.slice(0, 60) ?? null,
        board: meta.board?.slice(0, 80) ?? null,
        topics,
        source,
        verified: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,subject_key" },
    );
    if (isMissing(error)) outlinesTableMissing = true;
    else if (error) console.warn("[studyProfile] outline kept on this device:", error.message);
  },
};

export function buildOutlinePrompt(ctx: { subject: string; level: string | null; board: string | null }): string {
  return `List the main topics a student studies in ${fenceUntrusted(ctx.subject)}${
    ctx.level ? ` at ${fenceUntrusted(ctx.level)} level` : ""
  }${ctx.board ? ` (exam board or system: ${fenceUntrusted(ctx.board)})` : ""}.
Give 6 to 14 topics, in a sensible teaching order, each a short title (max 60 characters).
If you are unsure of this board's exact syllabus, give the topics most courses at this level share, and do not invent paper names, codes or weightings.
Reply with JSON only: {"topics":["…","…"]}`;
}

/**
 * An AI-drafted topic outline for a subject with no seeded syllabus. A
 * draft: equal weights, flagged unverified, editable. Throws when the AI is
 * unavailable, so the UI can offer a retry or let the student type their
 * own — there is no built-in stand-in list.
 */
export async function draftOutline(profile: StudyProfile, subject: string): Promise<OutlineTopic[]> {
  const result = await callEdge({
    history: [{ role: "user", content: buildOutlinePrompt(aiContext(profile, subject)) }],
    mode: "quiz",
    tool: "chat",
  });
  const parsed = extractJSON<{ topics?: unknown }>(result.text);
  const titles = Array.isArray(parsed?.topics)
    ? parsed.topics.filter((t): t is string => typeof t === "string").map((t) => t.slice(0, 60))
    : [];
  if (titles.length < 3) throw new Error("The draft outline came back empty. Try again, or type your own topics.");
  return equalWeights(titles);
}
