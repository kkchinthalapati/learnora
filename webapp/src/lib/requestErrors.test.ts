import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isAuthError,
  isRetryableRead,
  isRetryableWrite,
  isTransportError,
} from "./requestErrors";

/** navigator.onLine is a getter; tests that need it false have to redefine it. */
function setOnline(value: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isTransportError", () => {
  it("recognises the shapes fetch rejects with across engines", () => {
    setOnline(true);
    expect(isTransportError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isTransportError(new TypeError("NetworkError when attempting"))).toBe(
      true,
    );
    expect(isTransportError(new TypeError("Load failed"))).toBe(true);
  });

  it("treats anything that produced a status as having reached the server", () => {
    setOnline(true);
    /* The message alone would match; the status is what settles it. A 503
       page whose body mentions a network error is still a response. */
    expect(isTransportError({ status: 503, message: "Failed to fetch" })).toBe(
      false,
    );
  });

  it("counts a request made while offline as never having landed", () => {
    setOnline(false);
    expect(isTransportError(new Error("something opaque"))).toBe(true);
  });

  it("is false for an ordinary application error", () => {
    setOnline(true);
    expect(isTransportError(new Error("row not found"))).toBe(false);
  });
});

describe("isRetryableRead", () => {
  it("retries gateway and rate-limit statuses", () => {
    setOnline(true);
    for (const status of [408, 425, 429, 502, 503, 504]) {
      expect(isRetryableRead({ status })).toBe(true);
    }
  });

  /* The old flat `retry: 1` retried these too, spending a round trip to be
     told the same thing twice. */
  it("does not retry a status a second attempt cannot change", () => {
    setOnline(true);
    for (const status of [400, 401, 403, 404, 409, 422, 500]) {
      expect(isRetryableRead({ status })).toBe(false);
    }
  });
});

describe("isRetryableWrite", () => {
  it("replays only a request that never reached the origin", () => {
    setOnline(true);
    expect(isRetryableWrite(new TypeError("Failed to fetch"))).toBe(true);
  });

  /* The whole reason writes get their own rule: a proxy timing out does not
     mean the row was not written, so replaying it can duplicate the write. */
  it("refuses the gateway statuses a read would retry", () => {
    setOnline(true);
    for (const status of [408, 429, 502, 503, 504, 500]) {
      expect(isRetryableWrite({ status })).toBe(false);
    }
  });
});

describe("isAuthError", () => {
  it("matches the ways an expired session is reported", () => {
    expect(isAuthError({ status: 401 })).toBe(true);
    expect(isAuthError({ code: "PGRST301", message: "JWT expired" })).toBe(true);
    expect(isAuthError(new Error("refresh_token_not_found"))).toBe(true);
    expect(isAuthError(new Error("Invalid Refresh Token"))).toBe(true);
  });

  it("leaves an ordinary failure alone", () => {
    setOnline(true);
    expect(isAuthError({ status: 500, message: "boom" })).toBe(false);
    expect(isAuthError(new TypeError("Failed to fetch"))).toBe(false);
  });
});
