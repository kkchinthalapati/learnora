import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { misconceptionsApi } from "./misconceptions";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

/* Audit F-01's known limit: a lesson's misses were recorded under "General"
   while it had no subject and stayed there after it was filed. */
describe("misconceptionsApi.refileLesson", () => {
  beforeEach(() => mockAuthSession("user-1"));
  afterEach(() => vi.restoreAllMocks());

  it("moves only the mistakes this lesson alone produced, skipping taken concepts", async () => {
    const observations = [
      { misconception_id: "m-only", idempotency_key: "learn:mat-1:s1:check:abc", source_id: null },
      { misconception_id: "m-shared", idempotency_key: "learn:mat-1:s2:check:def", source_id: null },
      { misconception_id: "m-shared", idempotency_key: "quiz:q-9", source_id: null },
      { misconception_id: "m-taken", idempotency_key: null, source_id: "marked:learn-exam:mat-1:s1:xyz" },
    ];
    const patches: Array<{ filters: Record<string, string>; body: unknown }> = [];
    server.use(
      http.get(rest("misconception_observations"), () => HttpResponse.json(observations)),
      http.get(rest("misconceptions"), ({ request }) => {
        const subject = new URL(request.url).searchParams.get("subject");
        if (subject === "eq.General") {
          return HttpResponse.json([
            { id: "m-only", concept_key: "light as food" },
            { id: "m-shared", concept_key: "osmosis" },
            { id: "m-taken", concept_key: "diffusion" },
          ]);
        }
        return HttpResponse.json([{ concept_key: "diffusion" }]);
      }),
      http.patch(rest("misconceptions"), async ({ request }) => {
        patches.push({
          filters: Object.fromEntries(new URL(request.url).searchParams.entries()),
          body: await request.json(),
        });
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const moved = await misconceptionsApi.refileLesson("mat-1", "General", "Biology");

    expect(moved).toBe(1);
    expect(patches).toEqual([
      { filters: { user_id: "eq.user-1", id: "in.(m-only)" }, body: { subject: "Biology" } },
    ]);
  });

  it("does nothing when the subject did not change", async () => {
    expect(await misconceptionsApi.refileLesson("mat-1", "General", "General")).toBe(0);
  });
});
