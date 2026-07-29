import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { dataAdminApi } from "./dataAdmin";

describe("dataAdminApi.wipe", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
    localStorage.setItem("sessions", "[]");
    localStorage.setItem("fav_times", "[]");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clears session-history localStorage keys once every table delete succeeds", async () => {
    await dataAdminApi.wipe();
    expect(localStorage.getItem("sessions")).toBeNull();
    expect(localStorage.getItem("fav_times")).toBeNull();
  });

  /* supabase-js resolves deletes with `{ error }` rather than rejecting, so
   * a bare Promise.all would report success even when one table's delete
   * was refused (e.g. by RLS) — this is the one behavior worth locking down
   * with a test, since a regression here would silently corrupt the "wipe"
   * guarantee. */
  it("throws and leaves localStorage untouched if any table delete fails", async () => {
    server.use(
      http.delete(`${SUPABASE_URL}/rest/v1/exams`, () =>
        HttpResponse.json({ message: "denied" }, { status: 403 }),
      ),
    );

    await expect(dataAdminApi.wipe()).rejects.toThrow(
      "Some data could not be deleted",
    );
    expect(localStorage.getItem("sessions")).toBe("[]");
  });
});
