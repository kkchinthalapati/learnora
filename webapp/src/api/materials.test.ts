import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { isOrderSupported, materialsApi, resetOrderSupport } from "./materials";

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

  describe("setOrder", () => {
    beforeEach(() => resetOrderSupport());

    it("writes each changed place, scoped to the current user", async () => {
      const writes: Array<{ id: string | null; user: string | null; body: unknown }> = [];
      server.use(
        http.patch(`${SUPABASE_URL}/rest/v1/materials`, async ({ request }) => {
          const url = new URL(request.url);
          writes.push({
            id: url.searchParams.get("id"),
            user: url.searchParams.get("user_id"),
            body: await request.json(),
          });
          return new HttpResponse(null, { status: 204 });
        }),
      );

      await materialsApi.setOrder([
        { id: "m-2", position: 0 },
        { id: "m-1", position: 1 },
      ]);

      expect(writes).toEqual([
        { id: "eq.m-2", user: "eq.user-1", body: { position: 0 } },
        { id: "eq.m-1", user: "eq.user-1", body: { position: 1 } },
      ]);
      expect(isOrderSupported()).toBe(true);
    });

    it("writes nothing when nothing moved", async () => {
      let called = false;
      server.use(
        http.patch(`${SUPABASE_URL}/rest/v1/materials`, () => {
          called = true;
          return new HttpResponse(null, { status: 204 });
        }),
      );
      await materialsApi.setOrder([]);
      expect(called).toBe(false);
    });

    it("remembers a database that has no position column yet", async () => {
      server.use(
        http.patch(`${SUPABASE_URL}/rest/v1/materials`, () =>
          HttpResponse.json(
            { code: "PGRST204", message: "Could not find the 'position' column of 'materials' in the schema cache" },
            { status: 400 },
          ),
        ),
      );
      await expect(materialsApi.setOrder([{ id: "m-1", position: 0 }])).rejects.toThrow(/can't be reordered yet/);
      expect(isOrderSupported()).toBe(false);
    });

    it("does not blame the schema for any other failure", async () => {
      server.use(
        http.patch(`${SUPABASE_URL}/rest/v1/materials`, () =>
          HttpResponse.json({ message: "permission denied" }, { status: 403 }),
        ),
      );
      await expect(materialsApi.setOrder([{ id: "m-1", position: 0 }])).rejects.toThrow("permission denied");
      expect(isOrderSupported()).toBe(true);
    });
  });
});
