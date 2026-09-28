import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout, SUPABASE_URL } from "./supabase";
import { isRetryableRead, isRetryableWrite } from "./requestErrors";

describe("fetchWithTimeout", () => {
  afterEach(() => vi.unstubAllGlobals());

  function captureSignal() {
    const spy = vi.fn().mockResolvedValue(new Response("[]"));
    vi.stubGlobal("fetch", spy);
    return () => (spy.mock.calls[0][1] as RequestInit | undefined)?.signal;
  }

  it("bounds database and auth requests", async () => {
    const signal = captureSignal();
    await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/tasks?select=*`);
    expect(signal()).toBeInstanceOf(AbortSignal);
  });

  it("leaves AI calls and uploads unbounded", async () => {
    const signal = captureSignal();
    await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/learnora-ai`, {
      method: "POST",
    });
    expect(signal()).toBeUndefined();
  });

  it("still honours the caller's own abort", async () => {
    const signal = captureSignal();
    const controller = new AbortController();
    await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/tasks`, {
      signal: controller.signal,
    });
    controller.abort();
    expect(signal()?.aborted).toBe(true);
  });
});

describe("a timed-out request", () => {
  const timedOut = new Error("TimeoutError: signal timed out");

  it("is retried when it was a read", () => {
    expect(isRetryableRead(timedOut)).toBe(true);
  });

  /* The server may have committed a write whose response never arrived. */
  it("is not replayed when it was a write", () => {
    expect(isRetryableWrite(timedOut)).toBe(false);
  });
});
