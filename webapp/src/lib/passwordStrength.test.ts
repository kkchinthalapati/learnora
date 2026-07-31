import { describe, expect, it } from "vitest";
import { scorePassword, validateNewPassword } from "./passwordStrength";

describe("scorePassword", () => {
  it("calls anything under 8 characters Too Weak, however varied", () => {
    /* Deliberate carry-over of the vanilla's length gate: "Aa1!" scores 3 on
       character classes but is still reported as weak. */
    expect(scorePassword("Aa1!").level).toBe("weak");
  });

  it("grades by the number of character classes once long enough", () => {
    expect(scorePassword("aaaaaaaa").level).toBe("weak");
    expect(scorePassword("aaaaAAAA").level).toBe("fair");
    expect(scorePassword("aaaaAAA1").level).toBe("good");
    expect(scorePassword("aaaaAAA1!").level).toBe("strong");
  });

  it("spells out what is missing while weak", () => {
    expect(scorePassword("short").label).toBe("Too Weak (Need 8+ chars & mix)");
  });

  it("labels each of the upper grades", () => {
    expect(scorePassword("aaaaAAAA").label).toBe("Fair");
    expect(scorePassword("aaaaAAA1").label).toBe("Good");
    expect(scorePassword("aaaaAAA1!").label).toBe("Strong");
  });
});

describe("validateNewPassword", () => {
  it("rejects a password under 8 characters", () => {
    expect(validateNewPassword("short1", "short1")?.message).toBe(
      "Password must be at least 8 characters long.",
    );
  });

  it("rejects a mismatched confirmation", () => {
    expect(validateNewPassword("longenough1", "different1")?.message).toBe(
      "Passwords do not match. Please re-enter them.",
    );
  });

  it("checks length before the match, so a short mismatch reports length first", () => {
    expect(validateNewPassword("short", "different")?.message).toBe(
      "Password must be at least 8 characters long.",
    );
  });

  it("passes a long enough, matching pair", () => {
    expect(validateNewPassword("longenough1", "longenough1")).toBeNull();
  });
});
