import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL, supabase } from "./supabase";
import { fakeSession } from "../test/auth";
import { callEdge } from "../api/ai";
import {
  ensureAiConsent,
  hasAiConsent,
  registerAiConsentRequester,
  resetAiConsentState,
} from "./aiConsent";

const EDGE_URL = `${SUPABASE_URL}/functions/v1/learnora-ai`;

function sessionWith(meta: Record<string, unknown>) {
  const session = fakeSession({ user_metadata: meta });
  vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
    data: { session },
    error: null,
  } as Awaited<ReturnType<typeof supabase.auth.getSession>>);
}

describe("hasAiConsent", () => {
  it("treats only an explicit false as a refusal", () => {
    expect(hasAiConsent({ consent_given: true })).toBe(true);
    expect(hasAiConsent({ consent_given: false })).toBe(false);
    /* Accounts from before the flag existed keep the access they had. */
    expect(hasAiConsent({})).toBe(true);
    expect(hasAiConsent(undefined)).toBe(true);
  });
});

describe("ensureAiConsent", () => {
  let unregister: (() => void) | null = null;
  beforeEach(() => resetAiConsentState());
  afterEach(() => {
    unregister?.();
    unregister = null;
  });

  it("refuses without asking when nothing can ask", async () => {
    expect(await ensureAiConsent({ consent_given: false })).toBe(false);
  });

  it("asks once for concurrent calls", async () => {
    const ask = vi.fn().mockResolvedValue(true);
    unregister = registerAiConsentRequester(ask);
    const answers = await Promise.all([
      ensureAiConsent({ consent_given: false }),
      ensureAiConsent({ consent_given: false }),
    ]);
    expect(answers).toEqual([true, true]);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("does not ask again for the rest of the same action after Not now", async () => {
    const ask = vi.fn().mockResolvedValue(false);
    unregister = registerAiConsentRequester(ask);
    expect(await ensureAiConsent({ consent_given: false })).toBe(false);
    expect(await ensureAiConsent({ consent_given: false })).toBe(false);
    expect(ask).toHaveBeenCalledTimes(1);
  });
});

describe("callEdge consent gate", () => {
  let unregister: (() => void) | null = null;
  beforeEach(() => resetAiConsentState());
  afterEach(() => {
    unregister?.();
    unregister = null;
    vi.restoreAllMocks();
  });

  it("asks first, then carries the same request through when allowed", async () => {
    sessionWith({ consent_given: false });
    const ask = vi.fn().mockResolvedValue(true);
    unregister = registerAiConsentRequester(ask);
    let calls = 0;
    server.use(
      http.post(EDGE_URL, () => {
        calls++;
        return HttpResponse.json({ text: "answer" });
      }),
    );

    await expect(callEdge({ history: [] }, undefined, 0)).resolves.toEqual({ text: "answer" });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(calls).toBe(1);
  });

  it("sends nothing and explains why when the student says Not now", async () => {
    sessionWith({ consent_given: false });
    unregister = registerAiConsentRequester(async () => false);
    let calls = 0;
    server.use(
      http.post(EDGE_URL, () => {
        calls++;
        return HttpResponse.json({ text: "answer" });
      }),
    );

    await expect(callEdge({ history: [] }, undefined, 0)).rejects.toThrow(
      /needs your OK/,
    );
    expect(calls).toBe(0);
  });

  it("does not ask a student who has already agreed", async () => {
    sessionWith({ consent_given: true });
    const ask = vi.fn();
    unregister = registerAiConsentRequester(ask);
    server.use(http.post(EDGE_URL, () => HttpResponse.json({ text: "ok" })));

    await callEdge({ history: [] }, undefined, 0);
    expect(ask).not.toHaveBeenCalled();
  });
});
