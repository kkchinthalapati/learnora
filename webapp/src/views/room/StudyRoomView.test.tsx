import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { StudyRoomView } from "./StudyRoomView";
import { fakeSession, renderWithAuth } from "../../test/auth";
import * as useStudyRoomModule from "./useStudyRoom";
import { ambianceEngine } from "./audioAmbiance";
import type { StudyParticipant } from "../../api/studyRoom";

describe("StudyRoomView", () => {
  const mockSendCheer = vi.fn();
  const mockBroadcastCheer = vi.fn();
  const mockSyncWithParticipant = vi.fn();
  const mockCopyInviteLink = vi.fn().mockResolvedValue(true);
  const mockSendMessage = vi.fn().mockResolvedValue(undefined);
  const mockSendReaction = vi.fn().mockResolvedValue(undefined);
  const mockStartGroupFocus = vi.fn();
  const mockPauseGroupTimer = vi.fn();
  const mockNextGroupPhase = vi.fn();
  const mockSyncMyTimerToGroup = vi.fn();

  const selfParticipant: StudyParticipant = {
    id: "user-1",
    userId: "user-1",
    name: "Ada Lovelace",
    avatarUrl: null,
    status: "focus",
    timerType: "pomodoro",
    isRunning: true,
    timeLeft: 1500,
    elapsed: 0,
    targetEndTime: Date.now() + 1500 * 1000,
    startedAt: null,
    totalTime: 1500,
    task: "Differential Engines Homework",
    subject: "Mathematics",
    subjectColor: "#4A90E2",
    streak: 5,
  };

  const friendParticipant: StudyParticipant = {
    id: "user-2",
    userId: "user-2",
    name: "Charles Babbage",
    avatarUrl: null,
    status: "focus",
    timerType: "pomodoro",
    isRunning: true,
    timeLeft: 1200,
    elapsed: 300,
    targetEndTime: Date.now() + 1200 * 1000,
    startedAt: null,
    totalTime: 1500,
    task: "Analytical Engine Hardware",
    subject: "Computer Architecture",
    subjectColor: "#E24A4A",
    streak: 3,
  };

  function renderView(
    initialRoute = "/room",
    studyRoomOverrides?: Partial<ReturnType<typeof useStudyRoomModule.useStudyRoom>>,
  ) {
    vi.spyOn(useStudyRoomModule, "useStudyRoom").mockReturnValue({
      roomId: "circle",
      isRoomFull: false,
      selfParticipant,
      friendsParticipants: [friendParticipant],
      participants: [selfParticipant, friendParticipant],
      focusParticipants: [selfParticipant, friendParticipant],
      activeCount: 2,
      activeFocusCount: 2,
      messages: [],
      sendMessage: mockSendMessage,
      reactions: [],
      sendReaction: mockSendReaction,
      cheerFeed: [],
      sendCheer: mockSendCheer,
      broadcastCheer: mockBroadcastCheer,
      broadcastTimerSync: vi.fn().mockResolvedValue(undefined),
      syncWithParticipant: mockSyncWithParticipant,
      copyInviteLink: mockCopyInviteLink,
      isCopied: false,
      isConnected: true,
      groupTimerState: null,
      isGroupTimerHost: false,
      startGroupFocus: mockStartGroupFocus,
      pauseGroupTimer: mockPauseGroupTimer,
      nextGroupPhase: mockNextGroupPhase,
      syncMyTimerToGroup: mockSyncMyTimerToGroup,
      ...studyRoomOverrides,
    });

    return {
      user: userEvent.setup(),
      ...renderWithAuth(
        <MemoryRouter initialEntries={[initialRoute]}>
          <Routes>
            <Route path="/room" element={<StudyRoomView />} />
            <Route path="/room/:roomId" element={<StudyRoomView />} />
          </Routes>
        </MemoryRouter>,
        { session: fakeSession({ id: "user-1", user_metadata: { full_name: "Ada Lovelace" } }) },
        { withTimer: true },
      ),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders room header, active count stats, and subtext", () => {
    renderView("/room");

    expect(screen.getByRole("heading", { level: 1, name: "Virtual Study Circle" })).toBeInTheDocument();
    expect(screen.getByText("2 students focusing together")).toBeInTheDocument();
    expect(screen.getByText(/Quiet co-working room · Live timer sync & cheers/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sound ambiance focus generator" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy study room invite link" })).toBeInTheDocument();
  });

  it("calls copyInviteLink when the invite button is clicked", async () => {
    const { user } = renderView("/room");

    const copyBtn = screen.getByRole("button", { name: "Copy study room invite link" });
    await user.click(copyBtn);

    expect(mockCopyInviteLink).toHaveBeenCalledTimes(1);
  });

  it("renders global room cheer bar with cheer emoji buttons and sends cheer", async () => {
    const { user } = renderView("/room");

    const cheerSection = screen.getByRole("region", { name: "Send a cheer to everyone in the room" });
    expect(cheerSection).toBeInTheDocument();

    const fireCheerBtn = within(cheerSection).getByRole("button", { name: "Send 🔥 to the entire study circle" });
    await user.click(fireCheerBtn);

    expect(mockBroadcastCheer).toHaveBeenCalledWith("🔥");

    const clapCheerBtn = within(cheerSection).getByRole("button", { name: "Send 👏 to the entire study circle" });
    await user.click(clapCheerBtn);

    expect(mockBroadcastCheer).toHaveBeenCalledWith("👏");
  });

  it("renders participant desks with avatar initials, names, streak, and status pills", () => {
    renderView("/room");

    const desksSection = screen.getByRole("region", { name: "Student Study Desks" });
    expect(desksSection).toBeInTheDocument();

    // Self desk
    const selfDesk = within(desksSection).getByLabelText("Ada Lovelace's study desk");
    expect(within(selfDesk).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(within(selfDesk).getByText("(You)")).toBeInTheDocument();
    expect(within(selfDesk).getByText("🔥 5 days")).toBeInTheDocument();
    expect(within(selfDesk).getByText(/Focusing/i)).toBeInTheDocument();
    expect(within(selfDesk).getByText("Differential Engines Homework")).toBeInTheDocument();
    expect(within(selfDesk).getByText("Mathematics")).toBeInTheDocument();

    // Friend desk
    const friendDesk = within(desksSection).getByLabelText("Charles Babbage's study desk");
    expect(within(friendDesk).getByText("Charles Babbage")).toBeInTheDocument();
    expect(within(friendDesk).getByText("🔥 3 days")).toBeInTheDocument();
    expect(within(friendDesk).getByText("Analytical Engine Hardware")).toBeInTheDocument();
    expect(within(friendDesk).getByText("Computer Architecture")).toBeInTheDocument();
  });

  it("sends cheer to a specific participant desk", async () => {
    const { user } = renderView("/room");

    const friendDesk = screen.getByLabelText("Charles Babbage's study desk");
    const coffeeBtn = within(friendDesk).getByRole("button", {
      name: "Send Coffee / Take a breather to Charles Babbage",
    });

    await user.click(coffeeBtn);

    expect(mockSendCheer).toHaveBeenCalledWith(friendParticipant, "☕");
  });

  it("triggers syncWithParticipant when clicking Sync button on friend desk", async () => {
    const { user } = renderView("/room");

    const friendDesk = screen.getByLabelText("Charles Babbage's study desk");
    const syncBtn = within(friendDesk).getByRole("button", {
      name: "Sync timer with Charles Babbage",
    });

    await user.click(syncBtn);

    expect(mockSyncWithParticipant).toHaveBeenCalledWith(friendParticipant);
  });

  it("renders empty invite state prompt when alone in the study room", async () => {
    const { user } = renderView("/room", {
      friendsParticipants: [],
      participants: [selfParticipant],
      focusParticipants: [selfParticipant],
      activeCount: 1,
    });

    expect(screen.getByText("1 student focusing together")).toBeInTheDocument();

    const emptySection = screen.getByRole("region", { name: "Empty study room prompt" });
    expect(within(emptySection).getByText("You're the first one here!")).toBeInTheDocument();
    expect(
      within(emptySection).getByText(/Studying is more motivating together/i),
    ).toBeInTheDocument();

    const inviteBtn = within(emptySection).getByRole("button", { name: /Invite Friends to Study/i });
    await user.click(inviteBtn);

    expect(mockCopyInviteLink).toHaveBeenCalled();
  });

  it("opens and interacts with sound ambiance settings dialog", async () => {
    const playSpy = vi.spyOn(ambianceEngine, "play").mockImplementation(() => {});
    const stopSpy = vi.spyOn(ambianceEngine, "stop").mockImplementation(() => {});

    const { user } = renderView("/room");

    const ambianceBtn = screen.getByRole("button", { name: "Sound ambiance focus generator" });
    await user.click(ambianceBtn);

    const dialog = screen.getByRole("dialog", { name: "Sound ambiance settings" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("Focus Soundscapes")).toBeInTheDocument();

    const rainPresetBtn = within(dialog).getByRole("button", { name: /Gentle Rain/i });
    await user.click(rainPresetBtn);

    expect(playSpy).toHaveBeenCalledWith("rain", 0.5);

    // Clicking again stops playback
    await user.click(rainPresetBtn);
    expect(stopSpy).toHaveBeenCalled();
  });

  it("handles overlay behavior (Escape to close, focus return, aria-modal) for ambiance dialog", async () => {
    const { user } = renderView("/room");

    const ambianceBtn = screen.getByRole("button", {
      name: "Sound ambiance focus generator",
    });
    await user.click(ambianceBtn);

    const dialog = screen.getByRole("dialog", {
      name: "Sound ambiance settings",
    });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");

    // Pressing Escape closes the popover and returns focus to the trigger button
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("dialog", { name: "Sound ambiance settings" }),
    ).not.toBeInTheDocument();
    expect(ambianceBtn).toHaveFocus();
  });

  it("does not expose cheer emoji rows as role='toolbar'", () => {
    renderView("/room");

    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  describe("Group timer banner", () => {
    it("offers to start a group Pomodoro when nobody is hosting one", async () => {
      const { user } = renderView("/room", { groupTimerState: null });

      const btn = screen.getByRole("button", {
        name: /Start 25m Group Pomodoro/i,
      });
      await user.click(btn);
      expect(mockStartGroupFocus).toHaveBeenCalledWith(25);
    });

    it("shows host controls only when you are the host", () => {
      const timerState = {
        hostUserId: "user-1",
        hostName: "Ada Lovelace",
        mode: "focus" as const,
        durationMinutes: 25,
        endsAtEpochMs: Date.now() + 1_500_000,
        pausedRemainingMs: null,
        isRunning: true,
        cycleIndex: 0,
      };

      renderView("/room", {
        groupTimerState: timerState,
        isGroupTimerHost: true,
      });

      expect(
        screen.getByRole("region", { name: "Synchronized Group Focus Session" }),
      ).toBeInTheDocument();
      expect(screen.getByText(/Hosted by Ada Lovelace/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Pause/i })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Start Break/i }),
      ).toBeInTheDocument();
    });

    it("hides pause and next-phase controls from a non-host peer", () => {
      const timerState = {
        hostUserId: "user-2",
        hostName: "Charles Babbage",
        mode: "focus" as const,
        durationMinutes: 25,
        endsAtEpochMs: Date.now() + 1_500_000,
        pausedRemainingMs: null,
        isRunning: true,
        cycleIndex: 0,
      };

      renderView("/room", {
        groupTimerState: timerState,
        isGroupTimerHost: false,
      });

      expect(screen.getByText(/Hosted by Charles Babbage/)).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Pause/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Sync My HUD/i }),
      ).toBeInTheDocument();
    });
  });
});
