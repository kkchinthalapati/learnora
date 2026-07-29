import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { examsApi } from "./exams";

describe("examsApi", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("orders fetched exams by exam_date ascending", async () => {
    let capturedUrl: URL | undefined;
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/exams`, ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json([]);
      }),
    );
    await examsApi.fetch();
    expect(capturedUrl?.searchParams.get("order")).toBe("exam_date.asc");
  });

  it("inserts when no id is given", async () => {
    let called: "insert" | "update" | undefined;
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/exams`, () => {
        called = "insert";
        return new HttpResponse(null, { status: 201 });
      }),
      http.patch(`${SUPABASE_URL}/rest/v1/exams`, () => {
        called = "update";
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await examsApi.save({ exam_name: "Final", exam_date: "2026-12-01" });
    expect(called).toBe("insert");
  });

  it("updates by id when an id is given, stamping user_id onto the payload", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    let capturedUrl: URL | undefined;
    server.use(
      http.patch(`${SUPABASE_URL}/rest/v1/exams`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        capturedUrl = new URL(request.url);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await examsApi.save({ exam_name: "Final v2" }, 7);
    expect(capturedUrl?.searchParams.get("id")).toBe("eq.7");
    expect(capturedBody).toEqual({ exam_name: "Final v2", user_id: "user-1" });
  });

  it("throws on a failed save", async () => {
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/exams`, () =>
        HttpResponse.json({ message: "check constraint violated" }, { status: 400 }),
      ),
    );
    await expect(examsApi.save({ exam_name: "" })).rejects.toThrow(
      "check constraint violated",
    );
  });
});
