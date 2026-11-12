/* Reading and saving how a student learns: their "How you learn" answers
 * (lib/learnerProfile.ts), of which the learner style is one part.
 *
 * Stored on the study profile, which is saved to this device at once and to
 * the server in the background (api/studyProfile.ts). Prompt builders call
 * `loadLearnerProfileRule` before each generation; the result is kept per
 * account so a lesson's several calls don't each re-read the profile. Never
 * throws: a lesson written without it is still a lesson. */

import { requireUserId } from "./session";
import { studyProfileApi } from "./studyProfile";
import type { LearnerStyle } from "../lib/learnerStyle";
import {
  EMPTY_LEARNER,
  learnerFromStudyProfile,
  learnerProfileRule,
  type LearnerProfile,
} from "../lib/learnerProfile";

/* Short-lived, so a change made elsewhere (onboarding, Settings) is picked
   up within a minute without this file knowing about it. Saves here update
   it at once. */
const CACHE_MS = 60_000;
let cache: {
  userId: string;
  at: number;
  profile: Promise<LearnerProfile>;
} | null = null;

/** Everything they've told us about how they learn. */
export async function loadLearnerProfile(): Promise<LearnerProfile> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return EMPTY_LEARNER;
  }
  if (cache?.userId !== userId || Date.now() - cache.at > CACHE_MS) {
    const profile = studyProfileApi
      .load()
      .then(learnerFromStudyProfile)
      .catch((err: unknown) => {
        console.warn("[learnerStyle] could not read the study profile:", err);
        cache = null;
        return EMPTY_LEARNER;
      });
    cache = { userId, at: Date.now(), profile };
  }
  return cache.profile;
}

export async function loadLearnerStyle(): Promise<LearnerStyle | null> {
  return (await loadLearnerProfile()).style;
}

/** The prompt block for this student, or "". */
export async function loadLearnerProfileRule(): Promise<string> {
  return learnerProfileRule(await loadLearnerProfile().catch(() => EMPTY_LEARNER));
}

/** Saves the changed parts. Resolves once this device has them. */
export async function saveLearnerProfile(patch: Partial<LearnerProfile>): Promise<LearnerProfile> {
  const userId = await requireUserId();
  const stored = await studyProfileApi.load();
  const current = learnerFromStudyProfile(stored);
  const next = learnerFromStudyProfile({
    learningStyle: "style" in patch ? patch.style : current.style,
    learningPrefs: patch.prefs ?? current.prefs,
    learningNotes: patch.notes ?? current.notes,
    interests: patch.interests ?? current.interests,
  });
  await studyProfileApi.save({
    ...stored,
    learningStyle: next.style,
    learningPrefs: next.prefs,
    learningNotes: next.notes || null,
    interests: next.interests || null,
  });
  cache = { userId, at: Date.now(), profile: Promise.resolve(next) };
  return next;
}

/** Saves the choice (null clears it). Resolves once this device has it. */
export async function saveLearnerStyle(style: LearnerStyle | null): Promise<void> {
  await saveLearnerProfile({ style });
}

/** For tests. */
export function resetLearnerStyleCache(): void {
  cache = null;
}
