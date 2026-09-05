import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";

export const AVATAR_BUCKET = "avatars";
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const ALLOWED_AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];

export const profileApi = {
  async updateTimezone(timezone: string): Promise<void> {
    const userId = await requireUserId();
    const { error } = await supabase
      .from("profiles")
      .update({ timezone })
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
