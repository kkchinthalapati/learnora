import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { profileApi } from "../api/profile";
import { DEFAULT_LIFE_CONTEXT, loadLifeContext, saveLifeContext, toSyncableLifeContext } from "../lib/lifeContext";
import { hydrateLifeContextFromProfile, resetLifeContextCache } from "./useLifeContext";

beforeEach(() => { localStorage.clear(); resetLifeContextCache(); });
afterEach(() => vi.restoreAllMocks());
it("hydrates a newer server week without replacing or uploading the device calendar", async () => {
  saveLifeContext({ ...DEFAULT_LIFE_CONTEXT, updatedAt: "2026-01-01T00:00:00Z", importedIcs: "PRIVATE" }, false);
  vi.spyOn(profileApi, "fetchLifeContext").mockResolvedValue({ lifeContext: { ...DEFAULT_LIFE_CONTEXT, wakeTime: "06:00", updatedAt: "2026-02-01T00:00:00Z" }, updatedAt: "2026-02-01T00:00:00Z" });
  const push = vi.spyOn(profileApi, "updateLifeContext").mockResolvedValue();
  await hydrateLifeContextFromProfile("a");
  expect(loadLifeContext()).toMatchObject({ wakeTime: "06:00", importedIcs: "PRIVATE", updatedAt: "2026-02-01T00:00:00Z" });
  expect(push).not.toHaveBeenCalled();
});
it("pushes a newer local week through an allowlist", async () => {
  saveLifeContext({ ...DEFAULT_LIFE_CONTEXT, importedIcs: "PRIVATE", importedLabel: "School", importedAt: "Yesterday" });
  vi.spyOn(profileApi, "fetchLifeContext").mockResolvedValue({ lifeContext: null, updatedAt: null });
  const push = vi.spyOn(profileApi, "updateLifeContext").mockResolvedValue();
  await hydrateLifeContextFromProfile("a");
  expect(push).toHaveBeenCalledWith(toSyncableLifeContext(loadLifeContext()), "a");
  expect(JSON.stringify(push.mock.calls)).not.toContain("PRIVATE");
  expect(push.mock.calls[0][0]).not.toHaveProperty("importedLabel");
});
it("ignores a delayed response after switching accounts", async () => {
  let resolve!: (v: Awaited<ReturnType<typeof profileApi.fetchLifeContext>>) => void;
  vi.spyOn(profileApi, "fetchLifeContext").mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue({ lifeContext: null, updatedAt: null });
  const first = hydrateLifeContextFromProfile("a");
  await hydrateLifeContextFromProfile("b");
  resolve({ lifeContext: { ...DEFAULT_LIFE_CONTEXT, wakeTime: "04:00", updatedAt: "2026-02-01T00:00:00Z" }, updatedAt: null });
  await first;
  expect(loadLifeContext().wakeTime).toBe(DEFAULT_LIFE_CONTEXT.wakeTime);
});
