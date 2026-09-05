import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "./supabase";
import { mockAuthSession } from "../test/mockSession";
import {
  EXPORTED_TABLES,
  buildDataExport,
  exportFilename,
} from "./dataExport";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

beforeEach(() => {
  mockAuthSession("user-1");
});

describe("buildDataExport", () => {
  it("reads every owned table, filtered to the caller", async () => {
    const seen = new Map<string, string | null>();
    server.use(
      ...EXPORTED_TABLES.map((table) =>
        http.get(rest(table), ({ request }) => {
          const url = new URL(request.url);
          seen.set(
            table,
            url.searchParams.get("user_id") ?? url.searchParams.get("id"),
          );
          return HttpResponse.json([{ id: `${table}-row` }]);
        }),
      ),
    );

    const data = await buildDataExport("user-1");

    expect(Object.keys(data.tables).sort()).toEqual([...EXPORTED_TABLES].sort());
    /* Every read is scoped to the caller. RLS enforces this server-side too —
       the filter is what keeps the export honest about whose data it is. */
    for (const table of EXPORTED_TABLES) {
      expect(seen.get(table)).toBe("eq.user-1");
    }
    expect(data.userId).toBe("user-1");
    expect(data.format).toBe("learnora-export-v1");
  });

  it("keys the profiles read on id, not user_id", async () => {
    let profilesQuery: URL | null = null;
    server.use(
      ...EXPORTED_TABLES.map((table) =>
        http.get(rest(table), ({ request }) => {
          if (table === "profiles") profilesQuery = new URL(request.url);
          return HttpResponse.json([]);
        }),
      ),
    );

    await buildDataExport("user-1");

    expect(profilesQuery!.searchParams.get("id")).toBe("eq.user-1");
    expect(profilesQuery!.searchParams.get("user_id")).toBeNull();
  });

  /* A student exercising a data right should get everything readable plus an
     honest note about what was not — never a failure that yields nothing. */
  it("records a failed table instead of losing the whole export", async () => {
    server.use(
      ...EXPORTED_TABLES.map((table) =>
        http.get(rest(table), () =>
          table === "notes"
            ? HttpResponse.json({ message: "boom" }, { status: 500 })
            : HttpResponse.json([]),
        ),
      ),
    );

    const data = await buildDataExport("user-1");

    expect(data.unavailable.notes).toBeTruthy();
    expect(data.tables.notes).toBeUndefined();
    expect(data.tables.flashcards).toEqual([]);
    expect(Object.keys(data.unavailable)).toEqual(["notes"]);
  });
});

describe("exportFilename", () => {
  it("carries the date so repeated exports do not silently overwrite", () => {
    expect(exportFilename(new Date("2026-09-05T12:00:00Z"))).toBe(
      "learnora-data-2026-09-05.json",
    );
  });
});
