import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { materialsApi } from "../api/materials";
import type { Material } from "../api/types";
import { useMaterial, useMaterials } from "./useMaterials";

vi.mock("../api/materials", () => ({
  materialsApi: { fetch: vi.fn(), fetchById: vi.fn() },
}));
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("cross-device material progress", () => {
  it.each(["detail", "list"])(
    "refreshes pending %s status and stops polling after completion",
    async (kind) => {
      vi.useFakeTimers();
      const pending = { id: "mat", processing_status: "pending" } as Material;
      const done = { ...pending, processing_status: "done" } as Material;
      vi.mocked(materialsApi.fetchById)
        .mockResolvedValueOnce(pending)
        .mockResolvedValue(done);
      vi.mocked(materialsApi.fetch)
        .mockResolvedValueOnce([pending])
        .mockResolvedValue([done]);
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );
      const view = renderHook(
        () => (kind === "detail" ? useMaterial("mat") : useMaterials()),
        { wrapper },
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      const fetch =
        kind === "detail" ? materialsApi.fetchById : materialsApi.fetch;
      expect(fetch).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(fetch).toHaveBeenCalledTimes(2);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(fetch).toHaveBeenCalledTimes(2);
      view.unmount();
      client.clear();
    },
  );
});
