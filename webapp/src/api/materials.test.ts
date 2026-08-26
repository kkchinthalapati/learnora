import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { materialsApi } from "./materials";

describe("materialsApi", () => {
  beforeEach(() => mockAuthSession("user-1"));
  afterEach(() => vi.restoreAllMocks());

  it("removes the uploaded object when saving its row fails", async () => {
    let uploadedPath = "";
    let removedPaths: string[] | undefined;
    server.use(
      http.post(
        `${SUPABASE_URL}/storage/v1/object/materials/*`,
        ({ request }) => {
          uploadedPath = new URL(request.url).pathname.split("/materials/")[1];
          return HttpResponse.json({ Key: uploadedPath }, { status: 200 });
        },
      ),
      http.post(`${SUPABASE_URL}/rest/v1/materials`, () =>
        HttpResponse.json({ message: "row insert failed" }, { status: 400 }),
      ),
      http.delete(
        `${SUPABASE_URL}/storage/v1/object/materials`,
        async ({ request }) => {
          const body = (await request.json()) as { prefixes: string[] };
          removedPaths = body.prefixes;
          return HttpResponse.json([]);
        },
      ),
    );

    await expect(
      materialsApi.uploadFile(
        new File(["content"], "notes.pdf", { type: "application/pdf" }),
        null,
        "pdf",
      ),
    ).rejects.toThrow("row insert failed");

    expect(uploadedPath).toBeTruthy();
    expect(removedPaths).toEqual([uploadedPath]);
  });

  it("scopes detail reads to the current user", async () => {
    let capturedUrl: URL | undefined;
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/materials`, ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json([]);
      }),
    );

    await materialsApi.fetchById("material-1");

    expect(capturedUrl?.searchParams.get("id")).toBe("eq.material-1");
    expect(capturedUrl?.searchParams.get("user_id")).toBe("eq.user-1");
  });
});
