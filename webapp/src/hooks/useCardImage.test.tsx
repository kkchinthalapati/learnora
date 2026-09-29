import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { AuthContext } from "../context/auth";
import { fakeSession } from "../test/auth";
import { setOfflineKVForTests, syncOfflineImages, type OfflineKV } from "../lib/offlineCards";
import { flashcardsApi } from "../api/flashcards";
import { useCardImageUrl } from "./useCardImage";

function memoryKV(): OfflineKV {
  const data = new Map<string, unknown>();
  const k = (store: string, key: string) => `${store}/${key}`;
  return {
    get: async <T,>(store: string, key: string) => data.get(k(store, key)) as T | undefined,
    put: async (store, key, value) => void data.set(k(store, key), value),
    delete: async (store, key) => void data.delete(k(store, key)),
    keys: async (store) =>
      [...data.keys()].filter((x) => x.startsWith(`${store}/`)).map((x) => x.slice(store.length + 1)),
    clear: async () => data.clear(),
  };
}

const session = fakeSession();
const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthContext.Provider value={{ session, user: session.user, loading: false, signOut: async () => {} }}>
    {children}
  </AuthContext.Provider>
);

describe("useCardImageUrl offline", () => {
  beforeEach(() => {
    setOfflineKVForTests(memoryKV());
    Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });
    URL.createObjectURL = vi.fn(() => "blob:offline-image");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
    vi.restoreAllMocks();
  });

  it("shows the device's saved copy with no connection, without asking for a signed URL", async () => {
    const signed = vi.spyOn(flashcardsApi, "getImageUrl");
    await syncOfflineImages("user-1", ["user-1/cell.png"], async () => new Blob(["png"]));

    const { result, unmount } = renderHook(() => useCardImageUrl("user-1/cell.png"), { wrapper });
    await waitFor(() => expect(result.current).toBe("blob:offline-image"));
    expect(signed).not.toHaveBeenCalled();

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:offline-image");
  });

  it("renders nothing (not a broken image) when the image wasn't saved", async () => {
    const { result } = renderHook(() => useCardImageUrl("user-1/missing.png"), { wrapper });
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current).toBeNull();
  });
});
