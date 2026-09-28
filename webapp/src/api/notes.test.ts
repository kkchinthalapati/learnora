import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { NoteConflictError, notesApi } from "./notes";

describe("notesApi.updateHtml", () => {
  beforeEach(() => mockAuthSession("user-1"));

  it("makes the save conditional on the version the editor loaded", async () => {
    let url: URL | undefined;
    server.use(
      http.patch(`${SUPABASE_URL}/rest/v1/notes`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({ id: "n1", updated_at: "v2" });
      }),
    );
    const saved = await notesApi.updateHtml("n1", "<p>x</p>", "v1");
    expect(url?.searchParams.get("updated_at")).toBe("eq.v1");
    expect(saved.updated_at).toBe("v2");
  });

  it("reports a conflict when the row has moved on", async () => {
    server.use(
      http.patch(`${SUPABASE_URL}/rest/v1/notes`, () =>
        HttpResponse.json(null),
      ),
    );
    await expect(
      notesApi.updateHtml("n1", "<p>x</p>", "v1"),
    ).rejects.toBeInstanceOf(NoteConflictError);
  });

  it("saves unconditionally for a row with no version yet", async () => {
    let url: URL | undefined;
    server.use(
      http.patch(`${SUPABASE_URL}/rest/v1/notes`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({ id: "n1" });
      }),
    );
    await notesApi.updateHtml("n1", "<p>x</p>");
    expect(url?.searchParams.has("updated_at")).toBe(false);
  });
});
