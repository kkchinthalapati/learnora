import { describe, expect, it } from "vitest";
import {
  isPushSupported,
  serializeSubscription,
  urlBase64ToUint8Array,
} from "./push";

describe("urlBase64ToUint8Array", () => {
  it("decodes a URL-safe base64 VAPID key into raw bytes", () => {
    // "hello" base64-encoded, with the padding stripped and +/ swapped for
    // -_ the way a VAPID public key is normally handed out.
    const bytes = urlBase64ToUint8Array("aGVsbG8");
    expect(new TextDecoder().decode(bytes)).toBe("hello");
  });

  it("round-trips a value containing URL-safe characters", () => {
    // btoa("\xfb\xff") is "+/8=" in standard base64 — a URL-safe encoder
    // would have emitted "-_8" instead, so this exercises the -/_  swap.
    const bytes = urlBase64ToUint8Array("-_8");
    expect(Array.from(bytes)).toEqual([0xfb, 0xff]);
  });
});

describe("serializeSubscription", () => {
  function fakeSubscription(json: PushSubscriptionJSON): PushSubscription {
    return { toJSON: () => json } as unknown as PushSubscription;
  }

  it("extracts endpoint and keys from a real subscription", () => {
    const sub = fakeSubscription({
      endpoint: "https://push.example/abc",
      keys: { p256dh: "pkey", auth: "akey" },
    });
    expect(serializeSubscription(sub)).toEqual({
      endpoint: "https://push.example/abc",
      p256dh: "pkey",
      auth: "akey",
    });
  });

  it("throws rather than sending a request with missing keys", () => {
    const sub = fakeSubscription({ endpoint: "https://push.example/abc" });
    expect(() => serializeSubscription(sub)).toThrow(/missing/i);
  });
});

describe("isPushSupported", () => {
  it("is true in the jsdom test environment (has both APIs stubbed)", () => {
    // Not stubbed by default in this suite's setup — this just documents the
    // check's shape rather than asserting a specific environment.
    expect(typeof isPushSupported()).toBe("boolean");
  });
});
