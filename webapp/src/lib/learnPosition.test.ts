import { beforeEach, describe, expect, it } from "vitest";
import { learnPositionLabel, learnStorageKey, readLearnPosition } from "./learnPosition";

const store = (id: string, value: unknown) =>
  localStorage.setItem(learnStorageKey(id), typeof value === "string" ? value : JSON.stringify(value));

describe("readLearnPosition", () => {
  beforeEach(() => localStorage.clear());

  it("says nothing for a lesson Learn has not been started on", () => {
    expect(readLearnPosition("m1")).toBeNull();
    /* The outline screen was opened, no part begun. */
    store("m1", { outline: ["a", "b"], current: -1, sections: {} });
    expect(readLearnPosition("m1")).toBeNull();
  });

  it("gives the part reached, counted from one", () => {
    store("m1", { outline: ["a", "b", "c", "d", "e"], current: 2, sections: {} });
    const position = readLearnPosition("m1");
    expect(position).toEqual({ state: "started", part: 3, total: 5 });
    expect(learnPositionLabel(position)).toBe("Part 3 of 5");
  });

  it("knows the end screen", () => {
    store("m1", { outline: ["a", "b"], current: 2, sections: {} });
    const position = readLearnPosition("m1");
    expect(position).toEqual({ state: "finished", total: 2 });
    expect(learnPositionLabel(position)).toBe("All 2 parts done");
  });

  it("never invents a position from unreadable data", () => {
    store("m1", "{not json");
    expect(readLearnPosition("m1")).toBeNull();
    store("m2", { outline: [], current: 0 });
    expect(readLearnPosition("m2")).toBeNull();
    store("m3", { outline: ["a"], current: "1" });
    expect(readLearnPosition("m3")).toBeNull();
    expect(learnPositionLabel(null)).toBe("");
  });
});
