import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import {
  toSyncableLifeContext,
  type LifeContext,
  type SyncableLifeContext,
} from "../lib/lifeContext";

export const AVATAR_BUCKET = "avatars";
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const ALLOWED_AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];

/* Set once the database says `profiles.settings` does not exist (a build
 * shipped ahead of its migration), so every later save doesn't repeat a
 * request that can only fail. */
let settingsColumnMissing = false;

function isMissingColumn(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .*settings.* does not exist/i.test(error.message ?? "")
  );
}

/* The columns the app reads from the student's own profile row on start-up.
 * Region/curriculum, synced settings and life context used to be three
 * separate requests for the same row, all fired within a few milliseconds of
 * sign-in. Calls that overlap now share one request. (Plan and billing stay
 * separate: they must be fresh after a checkout.) */
const BOOT_COLUMNS =
  "region, framework_id, grade_scale_id, life_context, life_context_updated_at";

type ProfileBootRow = {
  region?: string | null;
  framework_id?: string | null;
  grade_scale_id?: string | null;
  life_context?: (LifeContext & { updatedAt?: string | null }) | null;
  life_context_updated_at?: string | null;
  settings?: unknown;
} | null;

/** How long a finished read keeps answering overlapping callers. Short: this
 *  is request coalescing at start-up, not a cache. */
const SHARED_READ_MS = 1000;
let sharedRead: { userId: string; at: number; promise: Promise<ProfileBootRow> } | null = null;

async function readBootRow(userId: string): Promise<ProfileBootRow> {
  const withSettings = !settingsColumnMissing;
  const { data, error } = await supabase
    .from("profiles")
    .select(withSettings ? `${BOOT_COLUMNS}, settings` : BOOT_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    if (withSettings && isMissingColumn(error)) {
      settingsColumnMissing = true;
      return readBootRow(userId);
    }
    throw new Error(error.message);
  }
  return data as ProfileBootRow;
}

function bootRow(userId: string): Promise<ProfileBootRow> {
  const now = Date.now();
  if (sharedRead && sharedRead.userId === userId && now - sharedRead.at < SHARED_READ_MS) {
    return sharedRead.promise;
  }
  const promise = readBootRow(userId);
  sharedRead = { userId, at: now, promise };
  promise.catch(() => {
    if (sharedRead?.promise === promise) sharedRead = null;
  });
  return promise;
}

/** Test hook: forget any shared in-flight read. */
export function resetProfileReadCache(): void {
  sharedRead = null;
  settingsColumnMissing = false;
}

export const profileApi = {
  async fetchLifeContext(expectedUserId?: string): Promise<{ lifeContext: SyncableLifeContext | null; updatedAt: string | null }> {
    const userId = await requireUserId();
    if (expectedUserId && expectedUserId !== userId) throw new Error("Account changed");
    const data = await bootRow(userId);
    return { lifeContext: data?.life_context ? { ...toSyncableLifeContext(data.life_context), updatedAt: data.life_context_updated_at ?? data.life_context.updatedAt } : null, updatedAt: data?.life_context_updated_at ?? null };
  },
  async updateLifeContext(ctx: SyncableLifeContext, expectedUserId?: string): Promise<void> {
    sharedRead = null;
    const userId = await requireUserId();
    if (expectedUserId && expectedUserId !== userId) throw new Error("Account changed");
    const safe = toSyncableLifeContext(ctx);
    const at = safe.updatedAt ?? new Date().toISOString();
    const { error } = await supabase.from("profiles").update({ life_context: { ...safe, updatedAt: at }, life_context_updated_at: at }).eq("id", userId)
      .or(`life_context_updated_at.is.null,life_context_updated_at.lt.${at}`);
    if (error) throw new Error(error.message);
  },
  async fetchRegion(userId: string): Promise<{
    region?: string | null;
    framework_id?: string | null;
    grade_scale_id?: string | null;
  } | null> {
    const data = await bootRow(userId);
    if (!data) return null;
    return {
      region: data.region,
      framework_id: data.framework_id,
      grade_scale_id: data.grade_scale_id,
    };
  },

  /** The student's app settings as last saved from any device, or null when
   *  none are stored yet. Column from migration 20260928010000; until that
   *  is applied this resolves null and stops asking. */
  async fetchSettings(userId: string): Promise<Record<string, unknown> | null> {
    if (settingsColumnMissing) return null;
    const settings = (await bootRow(userId))?.settings;
    return settings && typeof settings === "object" && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : null;
  },

  async saveSettings(settings: Record<string, unknown>): Promise<void> {
    sharedRead = null;
    if (settingsColumnMissing) return;
    const userId = await requireUserId();
    const { error } = await supabase
      .from("profiles")
      .update({ settings })
      .eq("id", userId);
    if (error) {
      if (isMissingColumn(error)) {
        settingsColumnMissing = true;
        return;
      }
      throw new Error(error.message);
    }
  },

  async updateTimezone(timezone: string): Promise<void> {
    const userId = await requireUserId();
    const { error } = await supabase
      .from("profiles")
      .update({ timezone })
      .eq("id", userId);
    if (error) throw new Error(error.message);
  },

  /** Region / framework / grade-scale pins (null = detect). Columns from
   *  migration 20260916020000; a tenant can later set them for everyone. */
  async updateRegion(fields: {
    region?: string | null;
    framework_id?: string | null;
    grade_scale_id?: string | null;
  }): Promise<void> {
    sharedRead = null;
    const userId = await requireUserId();
    const { error } = await supabase
      .from("profiles")
      .update(fields)
      .eq("id", userId);
    if (error) throw new Error(error.message);
  },

  async fetchProfile(): Promise<{
    bio: string | null;
    subject: string | null;
    examType: string | null;
    targetGrade: string | null;
    studyPace: string | null;
  }> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("profiles")
      .select("bio, subject, exam_type, target_grade, study_pace")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      bio: data?.bio ?? null,
      subject: data?.subject ?? null,
      examType: data?.exam_type ?? null,
      targetGrade: data?.target_grade ?? null,
      studyPace: data?.study_pace ?? null,
    };
  },

  async updateBio(bio: string): Promise<void> {
    const userId = await requireUserId();
    const { error } = await supabase
      .from("profiles")
      .update({ bio: bio.trim() || null })
      .eq("id", userId);
    if (error) throw new Error(error.message);
  },

  async updateStudyProfile(fields: {
    subject?: string | null;
    examType?: string | null;
    targetGrade?: string | null;
    studyPace?: string | null;
  }): Promise<void> {
    const userId = await requireUserId();
    const { error } = await supabase
      .from("profiles")
      .update({
        subject: fields.subject?.trim() || null,
        exam_type: fields.examType || null,
        target_grade: fields.targetGrade?.trim() || null,
        study_pace: fields.studyPace || null,
      })
      .eq("id", userId);
    if (error) throw new Error(error.message);
  },

  /* Always writes to `<user_id>/avatar.<ext>` — a fixed name so re-uploading
   * overwrites in place rather than piling up orphaned objects nothing
   * references. The bucket is public (see the migration for why), so the
   * URL back is a plain public URL, not a signed one that would need
   * refreshing everywhere it's rendered. */
  async uploadAvatar(file: File): Promise<string> {
    const userId = await requireUserId();
    if (file.size > MAX_AVATAR_BYTES) {
      throw new Error("That image is larger than 2 MB. Try a smaller one.");
    }
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      throw new Error("Avatars must be a PNG, JPEG or WebP image.");
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${userId}/avatar.${ext}`;

    const { error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: true });
    if (error) throw new Error(error.message);

    const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    /* A cache-busting query param: the path never changes on re-upload, so
     * without this every surface that already loaded the old image (this
     * tab included, since <img> caches by URL) would keep showing it until
     * a hard refresh. */
    return `${data.publicUrl}?v=${Date.now()}`;
  },

  async removeAvatar(): Promise<void> {
    const userId = await requireUserId();
    const { data: list } = await supabase.storage
      .from(AVATAR_BUCKET)
      .list(userId);
    const paths = (list ?? []).map((f) => `${userId}/${f.name}`);
    if (paths.length > 0) {
      await supabase.storage.from(AVATAR_BUCKET).remove(paths);
    }
  },
};
