import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { taskFixtures } from "../test/mocks/handlers";
import { useAddTask, useTasks } from "./useTasks";

/* Canonical example for the per-entity hook pattern every other entity
 * repeats: a `useQuery` read plus a `useMutation` that invalidates it. */
function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useTasks", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads tasks", async () => {
    const { result } = renderHook(() => useTasks(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(taskFixtures);
  });

  it("surfaces a fetch failure via isError, not a silent empty array", async () => {
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/tasks`, () =>
        HttpResponse.json({ message: "down" }, { status: 500 }),
      ),
    );

    const { result } = renderHook(() => useTasks(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("down");
  });
});

describe("useAddTask", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("invalidates the tasks query on success so the list refetches", async () => {
    let getCalls = 0;
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/tasks`, () => {
        getCalls += 1;
        return HttpResponse.json(taskFixtures);
      }),
      http.post(
        `${SUPABASE_URL}/rest/v1/tasks`,
        () => new HttpResponse(null, { status: 201 }),
      ),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const localWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const tasks = renderHook(() => useTasks(), { wrapper: localWrapper });
    await waitFor(() => expect(tasks.result.current.isSuccess).toBe(true));
    expect(getCalls).toBe(1);

    const addTask = renderHook(() => useAddTask(), { wrapper: localWrapper });
    addTask.result.current.mutate({ text: "New task" });

    await waitFor(() => expect(addTask.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(getCalls).toBe(2));
  });
});
