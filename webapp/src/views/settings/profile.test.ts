import { describe, expect, it } from "vitest";
import { initialsFor } from "./profile";

describe("initialsFor", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsFor("Ada Lovelace")).toBe("AL");
    expect(initialsFor("Ada Byron King Lovelace")).toBe("AB");
  });

  it("handles a single-word name", () => {
    expect(initialsFor("Ada")).toBe("A");
  });

  it("falls back to ? for an empty name", () => {
    expect(initialsFor("")).toBe("?");
    expect(initialsFor("   ")).toBe("?");
  });

  it("ignores repeated spaces rather than emitting undefined", () => {
    /* `"Ada  Lovelace".split(" ")` yields an empty segment; the vanilla's
       `.map(w => w[0])` turned that into undefined mid-string. */
    expect(initialsFor("Ada  Lovelace")).toBe("AL");
  });
});
