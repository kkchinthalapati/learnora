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
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
