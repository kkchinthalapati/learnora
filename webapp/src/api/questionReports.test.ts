import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { questionReportsApi } from "./questionReports";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

beforeEach(() => mockAuthSession("user-1"));

describe("question reports", () => {
  it("sends the ref, reason, note and wording — and no user details", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(rest("question_reports"), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 201 });
      }),
    );
    await expect(
      questionReportsApi.report({ ref: "bank:abc", reason: "wrong_answer", note: " key is B ", questionText: "Q?" }),
    ).resolves.toBe("sent");
    expect(body).toEqual({ question_ref: "bank:abc", reason: "wrong_answer", note: "key is B", question_text: "Q?" });
  });

  it("reports the database's rate limit and duplicate rules as outcomes", async () => {
    server.use(
      http.post(rest("question_reports"), () =>
        HttpResponse.json({ code: "P0001", message: "question report limit reached" }, { status: 400 }),
      ),
    );
    await expect(questionReportsApi.report({ ref: "gen:qabc", reason: "unclear" })).resolves.toBe("limit");
    server.use(
      http.post(rest("question_reports"), () =>
        HttpResponse.json({ code: "23505", message: "duplicate key" }, { status: 409 }),
      ),
    );
    await expect(questionReportsApi.report({ ref: "gen:qabc", reason: "unclear" })).resolves.toBe("already");
  });

  it("refuses a malformed ref without calling the server", async () => {
    await expect(questionReportsApi.report({ ref: "drop table", reason: "other" })).resolves.toBe("unavailable");
  });

  it("reads flags, and a failed read flags nothing", async () => {
    server.use(http.get(rest("question_flags"), () => HttpResponse.json([{ question_ref: "bank:1" }])));
    expect(await questionReportsApi.flagged(["bank:1", "bank:2"])).toEqual(new Set(["bank:1"]));
    server.use(http.get(rest("question_flags"), () => HttpResponse.json({ message: "down" }, { status: 500 })));
    expect(await questionReportsApi.flagged(["bank:1"])).toEqual(new Set());
  });
});
