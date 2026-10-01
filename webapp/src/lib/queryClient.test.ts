import { describe, expect, it } from "vitest";
import { queryClient } from "./queryClient";

/* The retry predicates are the whole policy, so assert them directly rather
   than through a live query — driving react-query's real backoff would put
   several seconds of wall clock into the suite to test arithmetic. */
function queryRetry(failureCount: number, error: unknown): boolean {
  const retry = queryClient.getDefaultOptions().queries?.retry;
  if (typeof retry !== "function") throw new Error("no query retry predicate");
  return retry(failureCount, error as Error) as boolean;
}

function mutationRetry(failureCount: number, error: unknown): boolean {
  const retry = queryClient.getDefaultOptions().mutations?.retry;
  if (typeof retry !== "function")
    throw new Error("no mutation retry predicate");
  return retry(failureCount, error as Error) as boolean;
}

const dropped = new TypeError("Failed to fetch");

describe("query retry policy", () => {
  it("retries a dropped request, up to a bounded number of attempts", () => {
    expect(queryRetry(0, dropped)).toBe(true);
    expect(queryRetry(1, dropped)).toBe(true);
    expect(queryRetry(2, dropped)).toBe(false);
  });

  it("does not retry a failure a second attempt cannot fix", () => {
    expect(queryRetry(0, { status: 404 })).toBe(false);
    expect(queryRetry(0, { status: 400 })).toBe(false);
  });
});

describe("mutation retry policy", () => {
  /* Writes had no policy at all: a single dropped packet lost the write with
     nothing but a toast. */
  it("replays a write exactly once when the request never landed", () => {
    expect(mutationRetry(0, dropped)).toBe(true);
    expect(mutationRetry(1, dropped)).toBe(false);
  });

  /* The important half. A 502 means a proxy gave up waiting — the origin may
     already have committed the row, so replaying it duplicates the write. */
  it("never replays a write the server may have processed", () => {
    for (const status of [500, 502, 503, 504, 409]) {
      expect(mutationRetry(0, { status })).toBe(false);
    }
  });
});

describe("backoff", () => {
  it("grows between attempts and stays bounded", () => {
    const delay = queryClient.getDefaultOptions().queries?.retryDelay;
    if (typeof delay !== "function") throw new Error("no retryDelay");

    const first = delay(0, dropped) as number;
    const second = delay(1, dropped) as number;
    const far = delay(10, dropped) as number;

    expect(first).toBeGreaterThanOrEqual(1000);
    expect(second).toBeGreaterThanOrEqual(2000);
    /* Capped, so a long outage does not push a retry an hour into the future. */
    expect(far).toBeLessThanOrEqual(8250);
  });
});
