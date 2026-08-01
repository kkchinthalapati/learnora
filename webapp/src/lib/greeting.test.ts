import { describe, expect, it } from "vitest";
import { getGreeting } from "./greeting";

describe("getGreeting", () => {
  it("says good morning before noon", () => {
    expect(getGreeting("Ada", new Date("2026-01-01T09:00:00"))).toBe(
      "Good morning, Ada! 👋",
    );
  });

  it("says good afternoon from noon up to (not including) 6pm", () => {
    expect(getGreeting("Ada", new Date("2026-01-01T12:00:00"))).toBe(
      "Good afternoon, Ada! 👋",
    );
    expect(getGreeting("Ada", new Date("2026-01-01T17:59:00"))).toBe(
      "Good afternoon, Ada! 👋",
    );
  });

  it("says good evening from 6pm onward", () => {
    expect(getGreeting("Ada", new Date("2026-01-01T18:00:00"))).toBe(
      "Good evening, Ada! 👋",
    );
    expect(getGreeting("Ada", new Date("2026-01-01T23:30:00"))).toBe(
      "Good evening, Ada! 👋",
    );
  });
});
