import { beforeEach, describe, expect, it } from "vitest";
import { collection } from "./storage";

interface Row {
  id: string;
  label: string;
}

const store = collection<Row>("test_rows", (r) => r.id);

beforeEach(() => localStorage.clear());

describe("collection", () => {
  it("starts empty and round-trips a record", () => {
    expect(store.list()).toEqual([]);
    store.save({ id: "a", label: "A" });
    expect(store.find("a")).toEqual({ id: "a", label: "A" });
  });

  it("puts a new record first and leaves an updated one in place", () => {
    store.save({ id: "a", label: "A" });
    store.save({ id: "b", label: "B" });
    expect(store.list().map((r) => r.id)).toEqual(["b", "a"]);

    /* Saving mid-session must not reshuffle a list the student is reading. */
    store.save({ id: "a", label: "A2" });
    expect(store.list().map((r) => r.id)).toEqual(["b", "a"]);
    expect(store.find("a")?.label).toBe("A2");
  });

  it("removes and clears", () => {
    store.save({ id: "a", label: "A" });
    store.save({ id: "b", label: "B" });
    store.remove("a");
    expect(store.list().map((r) => r.id)).toEqual(["b"]);
    store.clear();
    expect(store.list()).toEqual([]);
  });

  it("caps to the newest `limit` records", () => {
    const capped = collection<Row>("test_capped", (r) => r.id, { limit: 2 });
    capped.save({ id: "a", label: "A" });
    capped.save({ id: "b", label: "B" });
    capped.save({ id: "c", label: "C" });
    expect(capped.list().map((r) => r.id)).toEqual(["c", "b"]);
  });

  /* Never throw: a malformed value degrades to empty rather than taking a
     render down, the contract the rest of this module already keeps. */
  it("survives a corrupted value", () => {
    localStorage.setItem("test_rows", "not json");
    expect(store.list()).toEqual([]);
  });

  it("survives a value that is valid JSON but not an array", () => {
    localStorage.setItem("test_rows", '{"nope":true}');
    expect(store.list()).toEqual([]);
  });
});
