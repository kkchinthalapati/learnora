import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { buildOutlinePrompt, resetStudyProfileSupport, studyProfileApi } from "./studyProfile";
import { EMPTY_PROFILE, aiContext } from "../lib/studyProfile";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

beforeEach(() => {
  mockAuthSession("user-1");
  localStorage.clear();
  resetStudyProfileSupport();
});

describe("studyProfileApi", () => {
  it("saves every answer, and a reload resumes from it even with the server down", async () => {
    server.use(
      http.patch(rest("profiles"), () => HttpResponse.json({ message: "offline" }, { status: 503 })),
      http.get(rest("profiles"), () => HttpResponse.json({ message: "offline" }, { status: 503 })),
    );
    await studyProfileApi.save({ ...EMPTY_PROFILE, country: "NG", system: "other", board: "WAEC" });
    const resumed = await studyProfileApi.load();
    expect(resumed).toMatchObject({ country: "NG", system: "other", board: "WAEC" });
  });

  it("before the migration, the server gets only the legacy exam_type and region", async () => {
    const bodies: Record<string, unknown>[] = [];
    server.use(
      http.patch(rest("profiles"), async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        bodies.push(body);
        return "study_profile" in body
          ? HttpResponse.json({ code: "PGRST204", message: "Could not find the 'study_profile' column" }, { status: 400 })
          : new HttpResponse(null, { status: 204 });
      }),
    );
    await studyProfileApi.save({ ...EMPTY_PROFILE, country: "IN", system: "cbse", ageBand: "13-15" });
    expect(bodies.at(-1)).toEqual({ exam_type: "other", region: "IN" });
  });

  it("after it, the full profile is saved with the age band, never a birth date", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.patch(rest("profiles"), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await studyProfileApi.save({ ...EMPTY_PROFILE, country: "GB", system: "gcse", board: "AQA", ageBand: "16-17" });
    expect(body).toMatchObject({ exam_type: "gcse", region: "GB", country: "GB", board: "AQA", age_band: "16-17" });
    expect(JSON.stringify(body)).not.toMatch(/dob|birth/i);
  });
});

describe("draft outline prompt", () => {
  it("carries subject, level and board, and nothing about the student", () => {
    const p = { ...EMPTY_PROFILE, country: "NG", ageBand: "13-15" as const, level: "SS3", board: "WAEC", pastProblems: "I panic" };
    const prompt = buildOutlinePrompt(aiContext(p, "History"));
    expect(prompt).toContain("History");
    expect(prompt).toContain("SS3");
    expect(prompt).toContain("WAEC");
    expect(prompt).not.toMatch(/NG\b|Nigeria|13-15|panic/);
  });
});
