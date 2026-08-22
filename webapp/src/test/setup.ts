import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { cleanup } from "@testing-library/react";
import { server } from "./mocks/server";

// RTL auto-cleanup only registers when test globals are enabled; we keep
// globals off (explicit imports), so unmount rendered trees ourselves.
afterEach(cleanup);

// `onUnhandledRequest: "error"` so a request no handler covers fails the
// test loudly instead of the real (network-less) fetch hanging or throwing
// a confusing low-level error.
beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  if (typeof globalThis !== "undefined") {
    class MockWebSocket {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;
      readonly CONNECTING = 0;
      readonly OPEN = 1;
      readonly CLOSING = 2;
      readonly CLOSED = 3;
      readyState = 1;
      url = "";
      onopen: ((ev: any) => any) | null = null;
      onclose: ((ev: any) => any) | null = null;
      onerror: ((ev: any) => any) | null = null;
      onmessage: ((ev: any) => any) | null = null;
      send = () => {};
      close = () => {};
      addEventListener = () => {};
      removeEventListener = () => {};
      dispatchEvent = () => true;
    }
    try {
      Object.defineProperty(globalThis, "WebSocket", {
        value: MockWebSocket,
        writable: true,
        configurable: true,
      });
      if (typeof window !== "undefined") {
        Object.defineProperty(window, "WebSocket", {
          value: MockWebSocket,
          writable: true,
          configurable: true,
        });
      }
    } catch {
      // ignore
    }
  }
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
