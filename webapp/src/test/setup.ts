import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// RTL auto-cleanup only registers when test globals are enabled; we keep
// globals off (explicit imports), so unmount rendered trees ourselves.
afterEach(cleanup);
