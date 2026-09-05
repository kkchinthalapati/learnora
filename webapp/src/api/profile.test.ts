import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { profileApi } from "./profile";

describe("profileApi", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("uploadAvatar guards", () => {
    it("refuses a file the bucket's mime allowlist would reject", async () => {
      const file = new File(["x"], "notes.pdf", { type: "application/pdf" });
      await expect(profileApi.uploadAvatar(file)).rejects.toThrow(
        "Avatars must be a PNG, JPEG or WebP image.",
      );
    });

    it("refuses a file over the bucket's 2 MB limit", async () => {
      const file = new File(["x"], "huge.png", { type: "image/png" });
      Object.defineProperty(file, "size", { value: 3 * 1024 * 1024 });
      await expect(profileApi.uploadAvatar(file)).rejects.toThrow(
        "That image is larger than 2 MB. Try a smaller one.",
      );
    });

    it("always writes to a fixed <user_id>/avatar.<ext> path, so a re-upload overwrites", async () => {
      let uploadPath: string | undefined;
      server.use(
        http.post(
          `${SUPABASE_URL}/storage/v1/object/avatars/:path*`,
          ({ request }) => {
            uploadPath = new URL(request.url).pathname;
            return HttpResponse.json({ Key: "avatars/user-1/avatar.png" });
          },
        ),
      );

      const url = await profileApi.uploadAvatar(
        new File(["x"], "me.png", { type: "image/png" }),
      );

      expect(uploadPath).toContain("/avatars/user-1/avatar.png");
      expect(url).toContain("/avatars/user-1/avatar.png");
    });
  });

  describe("updateBio", () => {
    it("trims whitespace and stores an empty bio as null, not an empty string", async () => {
      let capturedBody: Record<string, unknown> | undefined;
      server.use(
        http.patch(`${SUPABASE_URL}/rest/v1/profiles`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return new HttpResponse(null, { status: 204 });
        }),
      );

      await profileApi.updateBio("   ");

      expect(capturedBody).toEqual({ bio: null });
    });

    it("scopes the write to the current user", async () => {
      let capturedUrl: URL | undefined;
      server.use(
        http.patch(`${SUPABASE_URL}/rest/v1/profiles`, ({ request }) => {
          capturedUrl = new URL(request.url);
          return new HttpResponse(null, { status: 204 });
        }),
      );

      await profileApi.updateBio("Studying for finals.");

      expect(capturedUrl?.searchParams.get("id")).toBe("eq.user-1");
    });
  });

  describe("updateStudyProfile", () => {
    it("blanks an omitted field to null rather than leaving it untouched", async () => {
      let capturedBody: Record<string, unknown> | undefined;
      server.use(
        http.patch(`${SUPABASE_URL}/rest/v1/profiles`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return new HttpResponse(null, { status: 204 });
        }),
      );

      await profileApi.updateStudyProfile({ subject: "AP Chemistry" });

      expect(capturedBody).toEqual({
        subject: "AP Chemistry",
        exam_type: null,
        target_grade: null,
        study_pace: null,
      });
    });
  });
});
