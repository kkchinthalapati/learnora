import { afterEach, describe, expect, it, vi } from "vitest";
import {
  initMonitoring,
  installGlobalErrorHandlers,
  isMonitoringEnabled,
  reportError,
  scrubEvent,
  scrubUrl,
} from "./monitoring";
import type { ErrorEvent as SentryErrorEvent } from "@sentry/react";

describe("scrubUrl", () => {
  it("leaves an ordinary URL alone", () => {
    expect(scrubUrl("https://learnora.app/app/quiz/17?tab=review")).toContain(
      "/app/quiz/17",
    );
    expect(scrubUrl("/app/library")).toBe("/app/library");
  });

  /* The case that actually matters: Supabase returns auth tokens in the URL
   *fragment*, which is where a naive query-string scrub misses them. */
  it("redacts an access token from the fragment", () => {
    const scrubbed = scrubUrl(
      "https://learnora.app/app/#access_token=eyJhbGci.secret&refresh_token=r-secret&type=recovery",
    );
    expect(scrubbed).not.toContain("eyJhbGci.secret");
    expect(scrubbed).not.toContain("r-secret");
    expect(scrubbed).toContain("redacted");
    // The non-secret part is still there — it is what makes a report useful.
    expect(scrubbed).toContain("type=recovery");
  });

  it("redacts a recovery token from the query string", () => {
    const scrubbed = scrubUrl("/reset-password?token_hash=abc123&next=/app");
    expect(scrubbed).not.toContain("abc123");
    expect(scrubbed).toContain("next=%2Fapp");
  });

  it("returns the input rather than throwing on something unparseable", () => {
    expect(scrubUrl("::::")).toBe("::::");
  });
});

describe("scrubEvent", () => {
  it("scrubs the request URL and navigation breadcrumbs", () => {
    const event = {
      request: { url: "https://learnora.app/app/#access_token=leaked" },
      breadcrumbs: [
        {
          data: {
            from: "/login?token=leaked-from",
            to: "/app/#refresh_token=leaked-to",
          },
        },
      ],
    } as unknown as SentryErrorEvent;

    const scrubbed = scrubEvent(event);
    expect(JSON.stringify(scrubbed)).not.toContain("leaked");
  });

  it("passes through an event with nothing sensitive on it", () => {
    const event = { message: "boom" } as unknown as SentryErrorEvent;
    expect(scrubEvent(event)).toEqual({ message: "boom" });
  });
});

describe("initMonitoring", () => {
  it("does nothing without a DSN, which is the dev and test case", async () => {
    await expect(initMonitoring(undefined)).resolves.toBe(false);
    await expect(initMonitoring("")).resolves.toBe(false);
    expect(isMonitoringEnabled()).toBe(false);
  });

  /* A reporting pipeline that can crash the app it reports on is worse than
     no pipeline, so `reportError` has to be safe to call when init never
     ran — which is exactly when a developer is most likely to hit it. */
  it("reportError is a no-op while monitoring is off", () => {
    expect(() => reportError(new Error("boom"))).not.toThrow();
  });
});

describe("installGlobalErrorHandlers", () => {
  const listeners: Record<string, EventListener[]> = {};
  const target = {
    addEventListener: vi.fn((type: string, fn: EventListener) => {
      (listeners[type] ??= []).push(fn);
    }),
    removeEventListener: vi.fn((type: string, fn: EventListener) => {
      listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
    }),
  } as unknown as Window;

  afterEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(listeners)) delete listeners[key];
  });

  /* React error boundaries see render-phase errors only. This app is full of
     `void someAsyncThing()`, so an unhandled rejection is a whole class of
     bug that would stay invisible even with Sentry configured. */
  it("listens for unhandled rejections as well as uncaught errors", () => {
    installGlobalErrorHandlers(target);
    expect(Object.keys(listeners).sort()).toEqual([
      "error",
      "unhandledrejection",
    ]);
  });

  it("detaches both listeners on teardown", () => {
    const teardown = installGlobalErrorHandlers(target);
    teardown();
    expect(listeners.error).toHaveLength(0);
    expect(listeners.unhandledrejection).toHaveLength(0);
  });

  it("swallows a rejection rather than letting the handler throw", () => {
    installGlobalErrorHandlers(target);
    const fire = listeners.unhandledrejection[0];
    expect(() =>
      fire({ reason: new Error("nope") } as unknown as Event),
    ).not.toThrow();
  });
});
