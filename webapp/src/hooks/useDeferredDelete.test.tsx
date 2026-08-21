import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ToastProvider } from "../context/ToastProvider";
import { useDeferredDelete, DEFERRED_DELETE_WINDOW_MS } from "./useDeferredDelete";

describe("useDeferredDelete", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.useFakeTimers();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  }

  it("hides the item immediately and commits delete after the undo window", async () => {
    const deleteFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(
      () =>
        useDeferredDelete<number, { id: number; name: string }>({
          deleteFn,
          invalidateKey: ["items"],
          label: "Item",
        }),
      { wrapper },
    );

    const items = [
      { id: 1, name: "First" },
      { id: 2, name: "Second" },
    ];

    expect(result.current.visible(items, (i) => i.id)).toHaveLength(2);

    act(() => {
      result.current.remove(1);
    });

    // Item hidden immediately in UI
    expect(result.current.visible(items, (i) => i.id)).toEqual([
      { id: 2, name: "Second" },
    ]);
    expect(deleteFn).not.toHaveBeenCalled();

    // Fast-forward past undo window
    await act(async () => {
      vi.advanceTimersByTime(DEFERRED_DELETE_WINDOW_MS + 50);
    });

    expect(deleteFn).toHaveBeenCalledWith(1);
  });

  it("flushes and commits pending deletes on unmount before the undo window closes", async () => {
    const deleteFn = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(
      () =>
        useDeferredDelete<number, { id: number; name: string }>({
          deleteFn,
          invalidateKey: ["items"],
          label: "Item",
        }),
      { wrapper },
    );

    act(() => {
      result.current.remove(42);
    });

    expect(deleteFn).not.toHaveBeenCalled();

    // User navigates away 1 second into the 4s undo window:
    act(() => {
      vi.advanceTimersByTime(1000);
      unmount();
    });

    // Unmount flushes the mutation so it is never dropped
    expect(deleteFn).toHaveBeenCalledWith(42);
  });

  it("handles delete failure gracefully when unmounted without updating unmounted state", async () => {
    const deleteFn = vi.fn().mockRejectedValue(new Error("Network error"));
    const { result, unmount } = renderHook(
      () =>
        useDeferredDelete<number, { id: number; name: string }>({
          deleteFn,
          invalidateKey: ["items"],
          label: "Item",
        }),
      { wrapper },
    );

    act(() => {
      result.current.remove(99);
    });

    act(() => {
      unmount();
    });

    expect(deleteFn).toHaveBeenCalledWith(99);
  });
});
