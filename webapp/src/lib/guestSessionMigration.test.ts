import { beforeEach, describe, expect, it, vi } from "vitest";
import { migrateGuestSessions } from "./guestSessionMigration";

const select = vi.fn();
const insert = vi.fn();

vi.mock("./supabase", () => ({
  supabase: {
    from: vi.fn(() => ({ select, insert })),
  },
}));

describe("guest session migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    select.mockReturnValue({
      eq: () => ({
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });
    insert.mockResolvedValue({ error: null });
  });

  it("deduplicates ids, inserts missing guest rows in one batch, and marks them imported", async () => {
    localStorage.setItem(
      "sessions",
      JSON.stringify([
        {
          id: 10,
          timestamp: "now",
          minutes: 25,
          task: "Algebra",
          notes: "Quadratic equations",
          folderId: "math",
          timerType: "pomodoro",
          startedAt: "2026-09-14T09:00:00.000Z",
          guestSessionId: "08fdf173-695c-4a10-9d14-9f585962cd98",
          guest: true,
        },
      ]),
    );

    await expect(migrateGuestSessions("user-1")).resolves.toBe(1);
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "08fdf173-695c-4a10-9d14-9f585962cd98",
        user_id: "user-1",
        minutes: 25,
        folder_id: "math",
        notes: "Quadratic equations",
      }),
    ]);
    expect(JSON.parse(localStorage.getItem("sessions")!)[0].guest).toBe(false);
  });

  it("leaves local records pending when insertion fails", async () => {
    localStorage.setItem(
      "sessions",
      JSON.stringify([
        {
          id: 10,
          timestamp: "now",
          minutes: 25,
          task: "Science",
          startedAt: "2026-09-14T09:00:00.000Z",
          guestSessionId: "cb1bac90-e89d-49c4-9432-2c6e6b179c42",
          guest: true,
        },
      ]),
    );
    insert.mockResolvedValue({ error: { message: "offline" } });

    await expect(migrateGuestSessions("user-1")).rejects.toThrow("offline");
    expect(JSON.parse(localStorage.getItem("sessions")!)[0].guest).toBe(true);
  });

  it("does not import authenticated or legacy local history", async () => {
    localStorage.setItem(
      "sessions",
      JSON.stringify([{ id: 10, timestamp: "now", minutes: 25, task: "Math" }]),
    );
    await expect(migrateGuestSessions("user-1")).resolves.toBe(0);
    expect(select).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
