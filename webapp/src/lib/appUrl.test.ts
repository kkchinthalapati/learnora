import { afterEach, describe, expect, it, vi } from "vitest";
import { appPath, appUrl } from "./appUrl";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("appPath", () => {
  it("applies the deployed path prefix", () => {
    vi.stubEnv("BASE_URL", "/app/");
    expect(appPath("/signup")).toBe("/app/signup");
  });

  /* The regression this module exists for: three call sites wrote
     `window.location.href = "/signup"`, which requests `/signup` at the domain
     root and is caught by vercel.json's catch-all rewrite into a 404. */
  it("does not double the slash between prefix and path", () => {
    vi.stubEnv("BASE_URL", "/app/");
    expect(appPath("/signup")).not.toContain("//");
  });

  it("accepts a path written without a leading slash", () => {
    vi.stubEnv("BASE_URL", "/app/");
    expect(appPath("signup")).toBe("/app/signup");
  });

  it("is a plain root-relative path when the app is served at the root", () => {
    vi.stubEnv("BASE_URL", "/");
    expect(appPath("/signup")).toBe("/signup");
  });
});

describe("appUrl", () => {
  it("qualifies the prefixed path with the current origin", () => {
    vi.stubEnv("BASE_URL", "/app/");
    expect(appUrl("/friends/add/abc")).toBe(
      `${window.location.origin}/app/friends/add/abc`,
    );
  });
});
