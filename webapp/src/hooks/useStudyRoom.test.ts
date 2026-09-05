import React, { type ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useStudyRoom } from "./useStudyRoom";
import { supabase } from "../lib/supabase";
import { AuthContext, type AuthState } from "../context/auth";
import { TimerContext, type TimerApi } from "../context/timer";
import { ToastContext, type ToastApi } from "../context/toast";
import { initialTimerState } from "../lib/timer";
import { MAX_ROOM_PARTICIPANTS } from "../api/studyRoom";
import type {
  StudyParticipant,
  RoomReaction,
  TimerSyncPayload,
  GroupTimerSyncPayload,
} from "../api/studyRoom";
import type { User, Session } from "@supabase/supabase-js";

interface MockChannel {
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  untrack: ReturnType<typeof vi.fn>;
  teardown: ReturnType<typeof vi.fn>;
  track: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  presenceState: ReturnType<typeof vi.fn>;
  _presenceSyncCb?: () => void;
  _reactionCb?: (event: { payload?: unknown }) => void;
  _syncTimerCb?: (event: { payload?: unknown }) => void;
  _groupTimerUpdateCb?: (event: { payload?: unknown }) => void;
  _groupTimerEndCb?: (event: { payload?: unknown }) => void;
  _subscribeCb?: (status: string) => void;
}

describe("useStudyRoom", () => {
  let mockChannel: MockChannel;
  let mockChannelsMap: Map<string, MockChannel>;
  let queryClient: QueryClient;
  const mockShowToast = vi.fn();

  const fakeUser: User = {
    id: "user-123",
    app_metadata: {},
    user_metadata: {
      full_name: "Ada Lovelace",
      avatar_url: "https://example.com/avatar.jpg",
    },
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00Z",
    email: "ada@example.com",
    role: "authenticated",
  };

  const fakeAuthState: AuthState = {
    session: {
      access_token: "tok",
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: "ref",
      user: fakeUser,
    } as Session,
    user: fakeUser,
    loading: false,
    signOut: vi.fn(),
  };

  const fakeToastApi: ToastApi = {
    showToast: mockShowToast,
    dismissToast: vi.fn(),
    notifyFetchError: vi.fn(),
  };

  const createTimerApi = (overrides?: Partial<TimerApi>): TimerApi => ({
    state: initialTimerState(),
    draftConfig: initialTimerState().config,
    setDraftConfig: vi.fn(),
    panelType: "pomodoro",
    start: vi.fn(),
    pause: vi.fn(),
    toggle: vi.fn(),
    reset: vi.fn(),
    extend: vi.fn(),
    takeBreak: vi.fn(),
    selectType: vi.fn(),
    applyAndReset: vi.fn(),
    startPreset: vi.fn(),
    prepareFocus: vi.fn(),
    activeTask: "None",
    setActiveTask: vi.fn(),
    activeFolderId: "",
    setActiveFolderId: vi.fn(),
    favs: [],
    saveFav: vi.fn(),
    deleteFav: vi.fn(),
    applyFav: vi.fn(),
    quote: "Stay focused",
    newQuote: vi.fn(),
    ...overrides,
  });

  function createWrapper(
    authState = fakeAuthState,
    timerApi = createTimerApi(),
    toastApi = fakeToastApi,
  ) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(
          ToastContext.Provider,
          { value: toastApi },
          React.createElement(
            AuthContext.Provider,
            { value: authState },
            React.createElement(
              TimerContext.Provider,
              { value: timerApi },
              children,
            ),
          ),
        ),
      );
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockChannelsMap = new Map();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    mockChannel = {
      on: vi.fn().mockImplementation(function (
        this: MockChannel,
        type: string,
        filter: { event: string },
        cb: (...args: unknown[]) => void,
      ) {
        if (type === "presence" && filter.event === "sync") {
          this._presenceSyncCb = cb as () => void;
        } else if (type === "broadcast" && filter.event === "reaction") {
          this._reactionCb = cb as (event: { payload?: unknown }) => void;
        } else if (type === "broadcast" && filter.event === "sync_timer") {
          this._syncTimerCb = cb as (event: { payload?: unknown }) => void;
        } else if (
          type === "broadcast" &&
          filter.event === "group_timer_update"
        ) {
          this._groupTimerUpdateCb = cb as (event: {
            payload?: unknown;
          }) => void;
        } else if (type === "broadcast" && filter.event === "group_timer_end") {
          this._groupTimerEndCb = cb as (event: { payload?: unknown }) => void;
        }
        return this;
      }),
      subscribe: vi.fn().mockImplementation(function (
        this: MockChannel,
        cb?: (status: string) => void,
      ) {
        this._subscribeCb = cb;
        if (cb) cb("SUBSCRIBED");
        return this;
      }),
      unsubscribe: vi.fn().mockResolvedValue("ok"),
      untrack: vi.fn().mockResolvedValue("ok"),
      teardown: vi.fn().mockResolvedValue("ok"),
      track: vi.fn().mockResolvedValue("ok"),
      send: vi.fn().mockResolvedValue("ok"),
      presenceState: vi.fn().mockReturnValue({}),
    };

    vi.spyOn(supabase, "channel").mockImplementation((topic: string) => {
      if (!mockChannelsMap.has(topic)) {
        mockChannelsMap.set(topic, { ...mockChannel });
      }
      return mockChannelsMap.get(topic) as unknown as ReturnType<
        typeof supabase.channel
      >;
    });
    vi.spyOn(supabase, "removeChannel").mockResolvedValue("ok" as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("subscribes to the caller's own private channel by default and tracks initial presence on mount", () => {
    const { result } = renderHook(() => useStudyRoom(), {
      wrapper: createWrapper(),
    });

    expect(supabase.channel).toHaveBeenCalledWith(
      "study-room:user-123",
      expect.objectContaining({
        config: {
          presence: {
            key: "user-123",
          },
          broadcast: {
            self: true,
          },
        },
      }),
    );

    const channel = mockChannelsMap.get("study-room:user-123");
    expect(channel).toBeDefined();
    expect(channel?.subscribe).toHaveBeenCalled();
    expect(result.current.roomId).toBe("user-123");
    expect(result.current.isConnected).toBe(true);
    expect(result.current.selfParticipant).toBeDefined();
    expect(result.current.selfParticipant?.name).toBe("Ada Lovelace");
    expect(result.current.selfParticipant?.status).toBe("idle");
    expect(channel?.track).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        fullName: "Ada Lovelace",
        avatarUrl: "https://example.com/avatar.jpg",
        timerStatus: "idle",
        currentTask: "",
      }),
    );
  });

  it("subscribes to a custom room id when provided", () => {
    const { result } = renderHook(() => useStudyRoom("calculus-club"), {
      wrapper: createWrapper(),
    });

    expect(supabase.channel).toHaveBeenCalledWith(
      "study-room:calculus-club",
      expect.anything(),
    );
    expect(result.current.roomId).toBe("calculus-club");
  });

  it("tracks presence updates when timer changes", () => {
    const timerApi = createTimerApi({
      state: {
        ...initialTimerState(),
        isRunning: true,
        mode: "Focus",
        type: "pomodoro",
      },
      activeTask: "Problem Set 4",
    });

    const { rerender } = renderHook(() => useStudyRoom("global"), {
      wrapper: createWrapper(fakeAuthState, timerApi),
    });

    const channel = mockChannelsMap.get("study-room:global");
    expect(channel?.track).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        timerStatus: "focus",
        currentTask: "Problem Set 4",
      }),
    );

    // Switch to break
    timerApi.state = {
      ...initialTimerState(),
      isRunning: true,
      mode: "ShortBreak",
      type: "pomodoro",
    };

    rerender();

    expect(channel?.track).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        timerStatus: "short_break",
      }),
    );
  });

  it("synchronizes participants from presence sync and calculates activeFocusCount", () => {
    const timerApi = createTimerApi({
      state: {
        ...initialTimerState(),
        isRunning: true,
        mode: "Focus",
      },
    });

    const { result } = renderHook(() => useStudyRoom("global"), {
      wrapper: createWrapper(fakeAuthState, timerApi),
    });

    const channel = mockChannelsMap.get("study-room:global");
    expect(channel).toBeDefined();

    const participant1: StudyParticipant = {
      userId: "user-123",
      fullName: "Ada Lovelace",
      avatarUrl: "https://example.com/avatar.jpg",
      timerStatus: "focus",
      currentTask: "Problem Set 4",
      activeSubject: "Math",
      targetEndTime: Date.now() + 1500000,
      elapsedSeconds: 0,
      startedAt: null,
      joinedAt: Date.now() - 10000,
    };

    const participant2: StudyParticipant = {
      userId: "user-456",
      fullName: "Charles Babbage",
      avatarUrl: null,
      timerStatus: "focus",
      currentTask: "Design Draft",
      activeSubject: "Hardware",
      targetEndTime: Date.now() + 1200000,
      elapsedSeconds: 300,
      startedAt: null,
      joinedAt: Date.now() - 20000,
    };

    const participant3: StudyParticipant = {
      userId: "user-789",
      fullName: "Alan Turing",
      avatarUrl: null,
      timerStatus: "paused",
      currentTask: "Crypto Analysis",
      activeSubject: null,
      targetEndTime: null,
      elapsedSeconds: 600,
      startedAt: null,
      joinedAt: Date.now() - 30000,
    };

    channel!.presenceState.mockReturnValue({
      "user-123": [participant1],
      "user-456": [participant2],
      "user-789": [participant3],
    });

    act(() => {
      channel!._presenceSyncCb?.();
    });

    expect(result.current.participants).toHaveLength(3);
    expect(result.current.activeFocusCount).toBe(2);
    expect(result.current.activeCount).toBe(2);
    expect(result.current.participants[0].userId).toBe("user-123");
  });

  /* A room's invite link is a plain URL. One posted in a class group chat
     admits everyone who clicks it, and presence is O(n²) chatter — so an
     uncapped room degrades for the people who were studying in it first. */
  describe("room capacity", () => {
    function peer(index: number, joinedAt: number): StudyParticipant {
      return {
        userId: `peer-${index}`,
        fullName: `Peer ${index}`,
        avatarUrl: null,
        timerStatus: "focus",
        currentTask: "",
        activeSubject: null,
        targetEndTime: null,
        elapsedSeconds: 0,
        startedAt: null,
        joinedAt,
      };
    }

    /** A presence state of `peerCount` peers who all arrived before us. */
    function crowdedRoom(peerCount: number, selfJoinedAt: number) {
      const state: Record<string, StudyParticipant[]> = {
        "user-123": [
          { ...peer(0, selfJoinedAt), userId: "user-123", fullName: "Ada" },
        ],
      };
      for (let i = 1; i <= peerCount; i++) {
        // Every peer arrived earlier than us.
        state[`peer-${i}`] = [peer(i, selfJoinedAt - 1000 * (peerCount - i + 1))];
      }
      return state;
    }

    it("admits everyone while the room is under capacity", () => {
      const { result } = renderHook(() => useStudyRoom("global"), {
        wrapper: createWrapper(fakeAuthState),
      });
      const channel = mockChannelsMap.get("study-room:global");

      channel!.presenceState.mockReturnValue(
        crowdedRoom(MAX_ROOM_PARTICIPANTS - 1, Date.now()),
      );
      act(() => channel!._presenceSyncCb?.());

      expect(result.current.isRoomFull).toBe(false);
      expect(result.current.participants).toHaveLength(MAX_ROOM_PARTICIPANTS);
    });

    it("reports the room full to the person who arrived past the cap", () => {
      const { result } = renderHook(() => useStudyRoom("global"), {
        wrapper: createWrapper(fakeAuthState),
      });
      const channel = mockChannelsMap.get("study-room:global");

      channel!.presenceState.mockReturnValue(
        crowdedRoom(MAX_ROOM_PARTICIPANTS, Date.now()),
      );
      act(() => channel!._presenceSyncCb?.());

      expect(result.current.isRoomFull).toBe(true);
    });

    it("withdraws presence when full, so a latecomer does not occupy a seat", () => {
      renderHook(() => useStudyRoom("global"), {
        wrapper: createWrapper(fakeAuthState),
      });
      const channel = mockChannelsMap.get("study-room:global");

      channel!.presenceState.mockReturnValue(
        crowdedRoom(MAX_ROOM_PARTICIPANTS, Date.now()),
      );
      act(() => channel!._presenceSyncCb?.());

      expect(channel!.untrack).toHaveBeenCalled();
    });

    /* Arrival order, not sync order: whoever was here first keeps their seat
       however many times presence re-syncs. */
    it("keeps the earliest arrivals and never renders more than the cap", () => {
      const { result } = renderHook(() => useStudyRoom("global"), {
        wrapper: createWrapper(fakeAuthState),
      });
      const channel = mockChannelsMap.get("study-room:global");

      /* We arrived first; twenty peers piled in afterwards. */
      const now = Date.now();
      const state: Record<string, StudyParticipant[]> = {
        "user-123": [{ ...peer(0, now - 999999), userId: "user-123" }],
      };
      for (let i = 1; i <= 20; i++) state[`peer-${i}`] = [peer(i, now + i)];

      channel!.presenceState.mockReturnValue(state);
      act(() => channel!._presenceSyncCb?.());

      expect(result.current.isRoomFull).toBe(false);
      expect(result.current.participants).toHaveLength(MAX_ROOM_PARTICIPANTS);
      expect(result.current.participants[0].userId).toBe("user-123");
    });

    it("re-admits you once a seat frees up", () => {
      const { result } = renderHook(() => useStudyRoom("global"), {
        wrapper: createWrapper(fakeAuthState),
      });
      const channel = mockChannelsMap.get("study-room:global");
      const now = Date.now();

      channel!.presenceState.mockReturnValue(crowdedRoom(MAX_ROOM_PARTICIPANTS, now));
      act(() => channel!._presenceSyncCb?.());
      expect(result.current.isRoomFull).toBe(true);

      channel!.presenceState.mockReturnValue(
        crowdedRoom(MAX_ROOM_PARTICIPANTS - 1, now),
      );
      act(() => channel!._presenceSyncCb?.());
      expect(result.current.isRoomFull).toBe(false);
    });
  });

  it("sends reaction and handles incoming reactions", async () => {
    const { result } = renderHook(() => useStudyRoom("global"), {
      wrapper: createWrapper(),
    });

    const channel = mockChannelsMap.get("study-room:global");

    await act(async () => {
      await result.current.sendReaction("🔥", "Great job!", "user-456");
    });

    expect(channel?.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "broadcast",
        event: "reaction",
        payload: expect.objectContaining({
          senderId: "user-123",
          senderName: "Ada Lovelace",
          recipientId: "user-456",
          emoji: "🔥",
          message: "Great job!",
        }),
      }),
    );

    // Simulate incoming reaction
    const incomingReaction: RoomReaction = {
      id: "reaction-999",
      senderId: "user-456",
      senderName: "Charles Babbage",
      recipientId: "user-123",
      emoji: "👏",
      message: "Keep it up!",
      timestamp: Date.now(),
    };

    act(() => {
      channel!._reactionCb?.({ payload: incomingReaction });
    });

    expect(result.current.reactions).toHaveLength(2);
    expect(result.current.reactions[1].id).toBe("reaction-999");
    expect(result.current.reactions[1].emoji).toBe("👏");
  });

  it("broadcasts timer sync and handles incoming group sync", async () => {
    const timerApi = createTimerApi({
      state: {
        ...initialTimerState(),
        mode: "Focus",
        totalTime: 1500,
        targetEndTime: Date.now() + 1500000,
      },
    });

    const onTimerSync = vi.fn();
    const { result } = renderHook(
      () => useStudyRoom("global", { onTimerSync, enableToasts: true }),
      { wrapper: createWrapper(fakeAuthState, timerApi) },
    );

    const channel = mockChannelsMap.get("study-room:global");

    await act(async () => {
      await result.current.broadcastTimerSync();
    });

    expect(channel?.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "broadcast",
        event: "sync_timer",
        payload: expect.objectContaining({
          senderId: "user-123",
          senderName: "Ada Lovelace",
          targetMinutes: 25,
          mode: "Focus",
        }),
      }),
    );

    // Receive incoming sync payload from peer
    const incomingSync: TimerSyncPayload = {
      senderId: "user-456",
      senderName: "Charles Babbage",
      targetMinutes: 25,
      mode: "Focus",
      targetEndTime: Date.now() + 1500000,
    };

    act(() => {
      channel!._syncTimerCb?.({ payload: incomingSync });
    });

    expect(onTimerSync).toHaveBeenCalledWith(incomingSync);
    expect(mockShowToast).toHaveBeenLastCalledWith(
      "Charles Babbage started a 25m Focus session!",
      expect.objectContaining({ actionLabel: "Sync" }),
    );
  });

  describe("group timer", () => {
    it("starting one makes you the host and broadcasts + tracks it in presence", () => {
      const { result } = renderHook(() => useStudyRoom("global"), {
        wrapper: createWrapper(),
      });
      const channel = mockChannelsMap.get("study-room:global");

      act(() => {
        result.current.startGroupFocus(25);
      });

      expect(result.current.isGroupTimerHost).toBe(true);
      expect(result.current.groupTimerState).toMatchObject({
        hostUserId: "user-123",
        hostName: "Ada Lovelace",
        mode: "focus",
        durationMinutes: 25,
        isRunning: true,
        cycleIndex: 0,
      });
      expect(channel?.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "broadcast",
          event: "group_timer_update",
          payload: expect.objectContaining({ hostUserId: "user-123" }),
        }),
      );
      expect(channel?.track).toHaveBeenLastCalledWith(
        expect.objectContaining({
          groupTimer: expect.objectContaining({ hostUserId: "user-123" }),
        }),
      );
    });

    it("freezes the remaining time on pause and resumes from it", () => {
      vi.useFakeTimers();
      const start = Date.now();
      vi.setSystemTime(start);

      const { result } = renderHook(() => useStudyRoom("global"), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.startGroupFocus(10);
      });

      vi.setSystemTime(start + 60_000); // 1 minute elapsed
      act(() => {
        result.current.pauseGroupTimer();
      });

      expect(result.current.groupTimerState?.isRunning).toBe(false);
      expect(result.current.groupTimerState?.pausedRemainingMs).toBe(
        9 * 60_000,
      );
      expect(result.current.groupTimerState?.endsAtEpochMs).toBeNull();

      vi.setSystemTime(start + 90_000); // paused for 30s more
      act(() => {
        result.current.pauseGroupTimer(); // resume
      });

      expect(result.current.groupTimerState?.isRunning).toBe(true);
      expect(result.current.groupTimerState?.endsAtEpochMs).toBe(
        start + 90_000 + 9 * 60_000,
      );

      vi.useRealTimers();
    });

    it("advances focus to break and back, remembering the original focus length", () => {
      const { result } = renderHook(() => useStudyRoom("global"), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.startGroupFocus(50);
      });
      expect(result.current.groupTimerState?.cycleIndex).toBe(0);

      act(() => {
        result.current.nextGroupPhase();
      });
      expect(result.current.groupTimerState?.mode).toBe("short_break");
      expect(result.current.groupTimerState?.durationMinutes).toBe(5);
      expect(result.current.groupTimerState?.cycleIndex).toBe(0);

      act(() => {
        result.current.nextGroupPhase();
      });
      expect(result.current.groupTimerState?.mode).toBe("focus");
      expect(result.current.groupTimerState?.durationMinutes).toBe(50);
      expect(result.current.groupTimerState?.cycleIndex).toBe(1);
    });

    it("learns a peer's group timer from presence sync, for a late joiner", () => {
      const { result } = renderHook(() => useStudyRoom("global"), {
        wrapper: createWrapper(),
      });
      const channel = mockChannelsMap.get("study-room:global");

      const peerGroupTimer: GroupTimerSyncPayload = {
        hostUserId: "user-456",
        hostName: "Charles Babbage",
        mode: "focus",
        durationMinutes: 25,
        endsAtEpochMs: Date.now() + 1_500_000,
        pausedRemainingMs: null,
        isRunning: true,
        cycleIndex: 0,
      };

      channel!.presenceState.mockReturnValue({
        "user-456": [
          {
            userId: "user-456",
            fullName: "Charles Babbage",
            groupTimer: peerGroupTimer,
          },
        ],
      });

      act(() => {
        channel!._presenceSyncCb?.();
      });

      expect(result.current.isGroupTimerHost).toBe(false);
      expect(result.current.groupTimerState).toMatchObject({
        hostUserId: "user-456",
        durationMinutes: 25,
      });
    });

    it("takes a peer's broadcast update but ignores its own looped-back broadcast", () => {
      const { result } = renderHook(() => useStudyRoom("global"), {
        wrapper: createWrapper(),
      });
      const channel = mockChannelsMap.get("study-room:global");

      act(() => {
        result.current.startGroupFocus(25);
      });
      expect(result.current.groupTimerState?.hostUserId).toBe("user-123");

      // A stray echo of our own broadcast must not overwrite our own state.
      act(() => {
        channel!._groupTimerUpdateCb?.({
          payload: { ...result.current.groupTimerState, hostUserId: "user-123" },
        });
      });
      expect(result.current.isGroupTimerHost).toBe(true);

      // A real peer update is picked up as the room's shared timer.
      const peerUpdate: GroupTimerSyncPayload = {
        hostUserId: "user-456",
        hostName: "Charles Babbage",
        mode: "focus",
        durationMinutes: 50,
        endsAtEpochMs: Date.now() + 3_000_000,
        pausedRemainingMs: null,
        isRunning: true,
        cycleIndex: 0,
      };
      act(() => {
        channel!._groupTimerUpdateCb?.({ payload: peerUpdate });
      });
      // We're still hosting our own — ours wins in our own view.
      expect(result.current.groupTimerState?.hostUserId).toBe("user-123");
    });

    it("clears a peer's group timer once they broadcast that it ended", () => {
      const { result } = renderHook(() => useStudyRoom("global"), {
        wrapper: createWrapper(),
      });
      const channel = mockChannelsMap.get("study-room:global");

      const peerUpdate: GroupTimerSyncPayload = {
        hostUserId: "user-456",
        hostName: "Charles Babbage",
        mode: "focus",
        durationMinutes: 25,
        endsAtEpochMs: Date.now() + 1_500_000,
        pausedRemainingMs: null,
        isRunning: true,
        cycleIndex: 0,
      };
      act(() => {
        channel!._groupTimerUpdateCb?.({ payload: peerUpdate });
      });
      expect(result.current.groupTimerState?.hostUserId).toBe("user-456");

      act(() => {
        channel!._groupTimerEndCb?.({ payload: { hostUserId: "user-456" } });
      });
      expect(result.current.groupTimerState).toBeNull();
    });

    it("broadcasts group_timer_end on unmount if you were hosting", () => {
      const { result, unmount } = renderHook(() => useStudyRoom("global"), {
        wrapper: createWrapper(),
      });
      const channel = mockChannelsMap.get("study-room:global");

      act(() => {
        result.current.startGroupFocus(25);
      });

      unmount();

      expect(channel?.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "broadcast",
          event: "group_timer_end",
          payload: { hostUserId: "user-123" },
        }),
      );
    });

    it("syncs a personal timer to the group's remaining minutes", () => {
      const timerApi = createTimerApi();
      const { result } = renderHook(() => useStudyRoom("global"), {
        wrapper: createWrapper(fakeAuthState, timerApi),
      });

      act(() => {
        result.current.syncMyTimerToGroup(18);
      });

      expect(timerApi.startPreset).toHaveBeenCalledWith(
        { focus: 18 },
        "pomodoro",
      );
    });
  });

  it("untracks and removes channel on unmount", () => {
    const { unmount } = renderHook(() => useStudyRoom("global"), {
      wrapper: createWrapper(),
    });

    const channel = mockChannelsMap.get("study-room:global");
    expect(channel).toBeDefined();

    unmount();

    expect(channel?.untrack).toHaveBeenCalled();
    expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
  });
});
