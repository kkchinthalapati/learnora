import { describe, expect, it, vi } from "vitest";
import { keepUrlInWorkerScope } from "./serviceWorker";

describe("keepUrlInWorkerScope", () => {
  const history = () => ({ state: { idx: 3, key: "k" }, replaceState: vi.fn() });

  it("moves the home URL /app into the worker's /app/ scope, keeping router state", () => {
    const h = history();
    expect(keepUrlInWorkerScope({ pathname: "/app", search: "?x=1", hash: "#h" }, h, "/app/")).toBe(true);
    expect(h.replaceState).toHaveBeenCalledWith({ idx: 3, key: "k" }, "", "/app/?x=1#h");
  });

  it("leaves every other URL alone", () => {
    for (const pathname of ["/app/", "/app/review/d-1", "/apple", "/"]) {
      const h = history();
      expect(keepUrlInWorkerScope({ pathname, search: "", hash: "" }, h, "/app/")).toBe(false);
      expect(h.replaceState).not.toHaveBeenCalled();
    }
    const h = history();
    expect(keepUrlInWorkerScope({ pathname: "", search: "", hash: "" }, h, "/")).toBe(false);
  });
});
