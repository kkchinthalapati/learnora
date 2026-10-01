import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Storage } from "./storage";
import {
  BLOCK_LEAD_MINS,
  shouldNotifyBlock,
  shouldNotifyDueCards,
} from "./notifications";

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

describe("shouldNotifyBlock", () => {
  const block = { id: "b1", startMin: 600 }; // 10:00

  beforeEach(() => {
    localStorage.clear();
  });

  it("is false when reminders are off", () => {
    expect(shouldNotifyBlock(block, false, 596, null)).toBe(false);
  });

  it("is true inside the lead window", () => {
    expect(shouldNotifyBlock(block, true, 600 - BLOCK_LEAD_MINS, null)).toBe(
      true,
    );
    expect(shouldNotifyBlock(block, true, 599, null)).toBe(true);
    expect(shouldNotifyBlock(block, true, 600, null)).toBe(true);
  });

  it("is false before the lead window opens", () => {
    expect(
      shouldNotifyBlock(block, true, 600 - BLOCK_LEAD_MINS - 1, null),
    ).toBe(false);
  });

  it("is false once the block has started", () => {
    /* A "your 2pm block is starting" that arrives at 3:40 is worse than
       silence — it is a notification about a plan already visibly missed. */
    expect(shouldNotifyBlock(block, true, 601, null)).toBe(false);
    expect(shouldNotifyBlock(block, true, 700, null)).toBe(false);
  });

  it("is false for a block already announced", () => {
    expect(shouldNotifyBlock(block, true, 599, "b1")).toBe(false);
  });

  it("is true for the next block even after announcing the last one", () => {
    expect(
      shouldNotifyBlock({ id: "b2", startMin: 600 }, true, 599, "b1"),
    ).toBe(true);
  });

  it("reads the last announced block from storage when not passed one", () => {
    Storage.set("learnora_block_notified", "b1");
    expect(shouldNotifyBlock(block, true, 599)).toBe(false);
  });
});
