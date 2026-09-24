import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { profileApi } from "../api/profile";
import {
  hydrateLifeContextFromProfile,
  resetLifeContextCache,
  useLifeContextHydrating,
} from "./useLifeContext";

/* The exam forecast reads available hours from the life context, so it has
   to wait for the account's saved week — otherwise the predicted grade is
   drawn from the defaults and then swaps once the real week lands. */
describe("useLifeContextHydrating", () => {
  beforeEach(() => {
    localStorage.clear();
    resetLifeContextCache();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    resetLifeContextCache();
  });

  it("is true while the saved week is loading, and false once it lands", async () => {
    let finish!: () => void;
    vi.spyOn(profileApi, "fetchLifeContext").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ lifeContext: null, updatedAt: null });
        }),
    );
    vi.spyOn(profileApi, "updateLifeContext").mockResolvedValue();

    const { result } = renderHook(() => useLifeContextHydrating());
    expect(result.current).toBe(false);

    let done!: Promise<void>;
    act(() => {
      done = hydrateLifeContextFromProfile("user-1");
    });
    await waitFor(() => expect(result.current).toBe(true));

    await act(async () => {
      finish();
      await done;
    });
    expect(result.current).toBe(false);
  });

  it("does not stay stuck when the fetch fails", async () => {
    vi.spyOn(profileApi, "fetchLifeContext").mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useLifeContextHydrating());

    await act(async () => {
      await hydrateLifeContextFromProfile("user-1");
    });
    expect(result.current).toBe(false);
  });
});
