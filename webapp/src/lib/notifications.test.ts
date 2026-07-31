import { afterEach, describe, expect, it } from "vitest";
import { Storage } from "./storage";
import { shouldNotifyDueCards } from "./notifications";

const NOW = new Date("2026-07-31T12:00:00.000Z");

describe("shouldNotifyDueCards", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("is false when the setting is off, even with cards due", () => {
    expect(shouldNotifyDueCards(3, false, NOW)).toBe(false);
  });

  it("is false when there are no cards due", () => {
    expect(shouldNotifyDueCards(0, true, NOW)).toBe(false);
  });

  it("is true the first time today, with the setting on and cards due", () => {
    expect(shouldNotifyDueCards(3, true, NOW)).toBe(true);
  });

  it("is false again once already notified today", () => {
    Storage.set("srs_notified_date", NOW.toDateString());
    expect(shouldNotifyDueCards(3, true, NOW)).toBe(false);
  });

  it("is true again on a new day", () => {
    Storage.set("srs_notified_date", NOW.toDateString());
    const tomorrow = new Date("2026-08-01T12:00:00.000Z");
    expect(shouldNotifyDueCards(3, true, tomorrow)).toBe(true);
  });
});
