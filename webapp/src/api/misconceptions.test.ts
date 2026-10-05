import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { misconceptionsApi, resetLoopSupport } from "./misconceptions";
import type { MisconceptionCandidate } from "../lib/misconceptions";

/* record()'s two rules for a second look at an already-counted mistake:
 * never add a second observation for the same source, and let a real
 * diagnosis replace the quiz's "Missed: …" stand-in summary. */

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

function row(summary: string) {
  return {
    id: "mc-1",
    subject: "Biology",
    concept: "Cell respiration",
    concept_key: "cell respiration",
    summary,
    status: "open",
    severity: "moderate",
    origin_tool: "quiz",
    times_observed: 1,
    times_corrected: 0,
    first_seen_at: "2026-09-01T00:00:00Z",
    last_seen_at: "2026-09-01T00:00:00Z",
    resolved_at: null,
  };
}

const DIAGNOSIS: MisconceptionCandidate = {
  subject: "Biology",
  concept: "Cell respiration",
  summary: "You may think ribosomes make energy.",
  severity: "moderate",
  tool: "quiz",
  sourceId: "attempt-key-1",
  kind: "evidence",
  detail: 'Chose "Ribosome".',
  skipIfSourceRecorded: true,
};

function serveLedger({
  existingSummary,
  priorObservations,
}: {
  existingSummary: string | null;
  priorObservations: number;
}) {
  const upserts: Array<Record<string, unknown>> = [];
  const inserts: Array<Record<string, unknown>> = [];
  const observationQueries: URLSearchParams[] = [];
  server.use(
    http.get(rest("misconceptions"), () =>
      HttpResponse.json(existingSummary === null ? [] : [row(existingSummary)]),
    ),
    http.post(rest("misconceptions"), async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      upserts.push(body);
      return HttpResponse.json(row(String(body.summary)));
    }),
    http.get(rest("misconception_observations"), ({ request }) => {
      observationQueries.push(new URL(request.url).searchParams);
      return HttpResponse.json(
        Array.from({ length: priorObservations }, (_, i) => ({ id: `o-${i}` })),
      );
    }),
    http.post(rest("misconception_observations"), async ({ request }) => {
      inserts.push((await request.json()) as Record<string, unknown>);
      return new HttpResponse(null, { status: 201 });
    }),
  );
  return { upserts, inserts, observationQueries };
}

describe("misconceptionsApi.record", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  it("adds no second observation when the attempt is already on the row", async () => {
    const ledger = serveLedger({
      existingSummary: "Missed: Which organelle makes ATP?",
      priorObservations: 1,
    });

    const written = await misconceptionsApi.record([DIAGNOSIS]);

    expect(written).toHaveLength(1);
    expect(ledger.inserts).toHaveLength(0);
    const q = ledger.observationQueries[0];
    expect(q.get("misconception_id")).toBe("eq.mc-1");
    expect(q.get("source_id")).toBe("eq.attempt-key-1");
    expect(q.get("kind")).toBe("eq.evidence");
  });

  it("does write the observation when this source has none yet", async () => {
    const ledger = serveLedger({ existingSummary: null, priorObservations: 0 });
    await misconceptionsApi.record([DIAGNOSIS]);
    expect(ledger.inserts).toHaveLength(1);
    expect(ledger.inserts[0]).toMatchObject({
      misconception_id: "mc-1",
      source_id: "attempt-key-1",
      kind: "evidence",
      source_tool: "quiz",
    });
  });

  it("replaces the quiz's placeholder summary with the real diagnosis", async () => {
    const ledger = serveLedger({
      existingSummary: "Missed: Which organelle makes ATP?",
      priorObservations: 1,
    });
    await misconceptionsApi.record([DIAGNOSIS]);
    expect(ledger.upserts[0].summary).toBe("You may think ribosomes make energy.");
  });

  it("never replaces a real diagnosis", async () => {
    const ledger = serveLedger({
      existingSummary: "Believes ATP is made on ribosomes (from the Debugger).",
      priorObservations: 1,
    });
    await misconceptionsApi.record([DIAGNOSIS]);
    expect(ledger.upserts[0].summary).toBe(
      "Believes ATP is made on ribosomes (from the Debugger).",
    );
  });

  it("leaves other tools' repeat observations alone (the check is opt-in)", async () => {
    const ledger = serveLedger({ existingSummary: "A real one.", priorObservations: 3 });
    await misconceptionsApi.record([{ ...DIAGNOSIS, skipIfSourceRecorded: undefined }]);
    expect(ledger.observationQueries).toHaveLength(0);
    expect(ledger.inserts).toHaveLength(1);
  });
});

/* The repair loop's writes: idempotent under retry, and harmless before
 * 20261005010000_mistake_loop.sql is applied in production. */
describe("misconceptionsApi loop writes", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
    resetLoopSupport();
  });

  const RETEST = {
    misconceptionId: "mc-1",
    kind: "correction" as const,
    sourceTool: "quiz" as const,
    questionKey: "qabc123",
    idempotencyKey: "retest:mc-1:qabc123",
    occurredAt: "2026-10-08T10:00:00Z",
    detail: "Answered the retest correctly.",
  };

  it("writes a retest as an insert that ignores a duplicate key", async () => {
    const calls: { url: URL; prefer: string | null; body: Record<string, unknown> }[] = [];
    server.use(
      http.post(rest("misconception_observations"), async ({ request }) => {
        calls.push({
          url: new URL(request.url),
          prefer: request.headers.get("prefer"),
          body: (await request.json()) as Record<string, unknown>,
        });
        return new HttpResponse(null, { status: 201 });
      }),
    );

    await expect(misconceptionsApi.recordObservation(RETEST)).resolves.toBe("written");
    await expect(misconceptionsApi.recordObservation(RETEST)).resolves.toBe("written");

    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.url.searchParams.get("on_conflict")).toBe("user_id,idempotency_key");
      expect(c.prefer).toContain("resolution=ignore-duplicates");
      expect(c.body).toMatchObject({
        user_id: "user-1",
        idempotency_key: RETEST.idempotencyKey,
        question_key: RETEST.questionKey,
        occurred_at: RETEST.occurredAt,
        kind: "correction",
      });
    }
  });

  it("throws on a real failure, so the offline queue keeps it", async () => {
    server.use(
      http.post(rest("misconception_observations"), () =>
        HttpResponse.json({ code: "500", message: "boom" }, { status: 500 }),
      ),
    );
    await expect(misconceptionsApi.recordObservation(RETEST)).rejects.toBeTruthy();
  });

  it("before the migration: loop writes are skipped and the ledger reads as before", async () => {
    const selects: string[] = [];
    server.use(
      http.post(rest("misconception_observations"), () =>
        HttpResponse.json(
          { code: "PGRST204", message: "Could not find the 'idempotency_key' column" },
          { status: 400 },
        ),
      ),
      http.get(rest("misconceptions"), ({ request }) => {
        const select = new URL(request.url).searchParams.get("select") ?? "";
        selects.push(select);
        return select.includes("repaired_at")
          ? HttpResponse.json({ code: "42703", message: "column misconceptions.repaired_at does not exist" }, { status: 400 })
          : HttpResponse.json([row("Thinks X")]);
      }),
    );

    await expect(misconceptionsApi.recordObservation(RETEST)).resolves.toBe("unsupported");
    const rows = await misconceptionsApi.fetchAll();
    expect(rows).toHaveLength(1);
    expect(rows[0].repairedAt).toBeNull();
    expect(selects.at(-1)).not.toContain("repaired_at");
  });
});
