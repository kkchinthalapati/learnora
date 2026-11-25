import { describe, expect, it } from "vitest";
import { moveLesson, orderLessons, positionChanges } from "./lessonOrder";

const l = (id: string, created: string, position?: number | null) => ({ id, created_at: created, position });
const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id);

describe("orderLessons", () => {
  it("reads a subject nobody has reordered oldest first", () => {
    expect(ids(orderLessons([l("c", "2026-03-01"), l("a", "2026-01-01"), l("b", "2026-02-01")]))).toEqual(["a", "b", "c"]);
  });

  it("puts placed lessons first, in their order, then the rest by when they were added", () => {
    const out = orderLessons([
      l("new", "2026-05-01"),
      l("second", "2026-01-01", 1),
      l("old", "2026-02-01", null),
      l("first", "2026-04-01", 0),
    ]);
    expect(ids(out)).toEqual(["first", "second", "old", "new"]);
  });

  it("is stable when two lessons share a place or a time", () => {
    expect(ids(orderLessons([l("b", "2026-01-01", 0), l("a", "2026-01-01", 0)]))).toEqual(["a", "b"]);
  });

  it("does not change the list it was given", () => {
    const input = [l("b", "2026-02-01"), l("a", "2026-01-01")];
    orderLessons(input);
    expect(ids(input)).toEqual(["b", "a"]);
  });
});

describe("moveLesson", () => {
  const ordered = [l("a", "1"), l("b", "2"), l("c", "3")];

  it("moves a lesson one place", () => {
    expect(ids(moveLesson(ordered, "b", -1))).toEqual(["b", "a", "c"]);
    expect(ids(moveLesson(ordered, "b", 1))).toEqual(["a", "c", "b"]);
  });

  it("leaves the order alone at either end or for an unknown lesson", () => {
    expect(ids(moveLesson(ordered, "a", -1))).toEqual(["a", "b", "c"]);
    expect(ids(moveLesson(ordered, "c", 1))).toEqual(["a", "b", "c"]);
    expect(ids(moveLesson(ordered, "zzz", 1))).toEqual(["a", "b", "c"]);
  });
});

describe("positionChanges", () => {
  it("places every lesson the first time one is moved", () => {
    const moved = moveLesson([l("a", "1"), l("b", "2"), l("c", "3")], "c", -1);
    expect(positionChanges(moved)).toEqual([
      { id: "a", position: 0 },
      { id: "c", position: 1 },
      { id: "b", position: 2 },
    ]);
  });

  it("writes only the rows whose place changed after that", () => {
    const moved = moveLesson([l("a", "1", 0), l("b", "2", 1), l("c", "3", 2)], "c", -1);
    expect(positionChanges(moved)).toEqual([
      { id: "c", position: 1 },
      { id: "b", position: 2 },
    ]);
  });

  it("is empty when nothing moved", () => {
    expect(positionChanges([l("a", "1", 0), l("b", "2", 1)])).toEqual([]);
  });
});
