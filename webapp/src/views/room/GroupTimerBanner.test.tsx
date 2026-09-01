import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GroupTimerBanner } from "./GroupTimerBanner";

describe("GroupTimerBanner", () => {
  it("renders idle state with start buttons", async () => {
    const onStart = vi.fn();
    render(
      <GroupTimerBanner
        timerState={null}
        onStartGroupFocus={onStart}
        onPauseGroupTimer={() => {}}
        onNextPhase={() => {}}
        onSyncMyTimer={() => {}}
      />,
    );

    expect(screen.getByText("Group Focus Mode")).toBeInTheDocument();
    const btn = screen.getByRole("button", {
      name: /Start 25m Group Pomodoro/i,
    });
    expect(btn).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(btn);
    expect(onStart).toHaveBeenCalledWith(25);
  });

  it("renders active focus state with countdown and host controls", async () => {
    const onSync = vi.fn();
    const timerState = {
      hostUserId: "host-1",
      hostName: "Alice",
      mode: "focus" as const,
      durationMinutes: 25,
      endsAtEpochMs: Date.now() + 1500 * 1000,
      isRunning: true,
      cycleIndex: 1,
    };

    render(
      <GroupTimerBanner
        timerState={timerState}
        isHost={true}
        onStartGroupFocus={() => {}}
        onPauseGroupTimer={() => {}}
        onNextPhase={() => {}}
        onSyncMyTimer={onSync}
      />,
    );

    expect(screen.getByText("Group Focus Room")).toBeInTheDocument();
    expect(screen.getByText(/Hosted by Alice/)).toBeInTheDocument();
    expect(screen.getByText(/Focus · Block #1/)).toBeInTheDocument();

    const syncBtn = screen.getByRole("button", { name: /Sync My HUD/i });
    const user = userEvent.setup();
    await user.click(syncBtn);
    expect(onSync).toHaveBeenCalled();
  });
});
