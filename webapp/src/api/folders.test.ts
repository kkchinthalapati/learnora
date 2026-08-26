import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { foldersApi } from "./folders";

describe("foldersApi", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches folders scoped to the current user", async () => {
    let capturedUrl: URL | undefined;
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/folders`, ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json([]);
      }),
    );
    await foldersApi.fetch();
    expect(capturedUrl?.searchParams.get("user_id")).toBe("eq.user-1");
  });

  /* Deleting a folder must collect its materials' storage paths *before* the
   * cascade removes the rows pointing at them, then clean up storage after
   * the DB delete succeeds — the ordering is the whole point of the test. */
  it("deletes the folder row then removes its materials' storage objects", async () => {
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/materials`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("folder_id")).toBe("eq.folder-1");
        return HttpResponse.json([
          { id: "m1", storage_path: "user-1/a.pdf" },
          { id: "m2", storage_path: null },
        ]);
      }),
      http.delete(`${SUPABASE_URL}/rest/v1/folders`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("id")).toBe("eq.folder-1");
        expect(url.searchParams.get("user_id")).toBe("eq.user-1");
        return new HttpResponse(null, { status: 204 });
      }),
    );

    let removedPaths: string[] | undefined;
    server.use(
      http.delete(
        `${SUPABASE_URL}/storage/v1/object/materials`,
        async ({ request }) => {
          const body = (await request.json()) as { prefixes: string[] };
          removedPaths = body.prefixes;
          return HttpResponse.json([]);
        },
      ),
    );

    await foldersApi.delete("folder-1");
    expect(removedPaths).toEqual(["user-1/a.pdf"]);
  });

  it("throws when the insert fails", async () => {
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/folders`, () =>
        HttpResponse.json({ message: "duplicate name" }, { status: 409 }),
      ),
    );
    await expect(foldersApi.add("Biology")).rejects.toThrow("duplicate name");
  });

  it("renames a folder", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.patch(`${SUPABASE_URL}/rest/v1/folders`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await foldersApi.rename("folder-1", "Chemistry");
    expect(capturedBody).toEqual({ name: "Chemistry" });
  });
});
