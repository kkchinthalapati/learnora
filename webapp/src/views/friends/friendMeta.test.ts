import { describe, expect, it } from "vitest";
import {
  displayName,
  findClosestPaceFriend,
  formatMinutes,
  initials,
  leaderboardMeta,
  streakLabel,
} from "./friendMeta";

describe("displayName", () => {
  it("uses the name when there is one", () => {
    expect(displayName("Ada King")).toBe("Ada King");
  });

  it.each([[null], [undefined], [""], ["   "]])(
    "falls back for %s",
    (value) => {
      expect(displayName(value)).toBe("Learnora student");
    },
  );
});

describe("initials", () => {
  it("takes the first and last word", () => {
    expect(initials("Ada Byron King")).toBe("AK");
  });

  it("takes just the one letter for a single word", () => {
    expect(initials("Ada")).toBe("A");
  });

  it("upper-cases a lowercase name", () => {
    expect(initials("ada king")).toBe("AK");
  });

  it("ignores the extra whitespace in a padded name", () => {
    expect(initials("  Ada   King  ")).toBe("AK");
  });

  it("derives from the fallback when there is no name", () => {
    expect(initials(null)).toBe("LS");
  });
});

describe("formatMinutes", () => {
  it.each([
    [0, "0m"],
    [45, "45m"],
    [60, "1h"],
    [135, "2h 15m"],
    [120, "2h"],
  ])("%i minutes reads as %s", (mins, expected) => {
    expect(formatMinutes(mins)).toBe(expected);
  });
});

describe("streakLabel", () => {
  it("singularises exactly one day", () => {
    expect(streakLabel(1)).toBe("1 day");
  });

  it.each([[0], [2], [11]])("pluralises %i", (days) => {
    expect(streakLabel(days)).toBe(`${days} days`);
  });
});

describe("leaderboardMeta", () => {
  it("reads as a sentence when there is nothing to report", () => {
    expect(leaderboardMeta(0, 0)).toBe("No focus time yet this week");
  });

  it("drops the streak clause at zero rather than showing '0 days'", () => {
    expect(leaderboardMeta(90, 0)).toBe("1h 30m this week");
  });

  it("joins both halves once there is a streak", () => {
    expect(leaderboardMeta(90, 3)).toBe("1h 30m this week · 3 days streak");
  });

  it("still reports a streak when this week is empty — a Monday morning", () => {
    expect(leaderboardMeta(0, 6)).toBe(
      "No focus time yet this week · 6 days streak",
    );
  });
});

describe("findClosestPaceFriend", () => {
  it("returns null when no entries or only self", () => {
    expect(findClosestPaceFriend([])).toBeNull();
    expect(
      findClosestPaceFriend([
        { user_id: "u1", weekly_minutes: 60, is_self: true },
      ]),
    ).toBeNull();
  });

  it("finds the friend closest in weekly focus time", () => {
    const entries = [
      { user_id: "u-far-ahead", weekly_minutes: 300, is_self: false },
      { user_id: "u-close", weekly_minutes: 75, is_self: false },
      { user_id: "u-self", weekly_minutes: 60, is_self: true },
      { user_id: "u-far-behind", weekly_minutes: 0, is_self: false },
    ];
    const closest = findClosestPaceFriend(entries);
    expect(closest?.user_id).toBe("u-close");
  });
});
