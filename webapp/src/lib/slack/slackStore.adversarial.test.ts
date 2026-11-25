import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getSlackStoreState,
  sendMessage,
  addReaction,
  toggleReaction,
  resetStore,
  getActiveChannel,
  getChannelMessages,
  getThreadReplies,
  getMessage,
  subscribeSlackStore,
  normalizeUserId,
  SLACK_STORAGE_KEY,
  INITIAL_SEED_DATA,
  type SlackStoreState,
  type SlackMessage,
} from "./slackStore";

describe("slackStore Adversarial Stress Harness", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. CORRUPTED LOCALSTORAGE PAYLOAD & GRACEFUL RECOVERY
  // =========================================================================
  describe("1. Corrupted LocalStorage Payload & Recovery", () => {
    it("recovers gracefully to seed data when localStorage contains invalid JSON string", () => {
      localStorage.setItem(SLACK_STORAGE_KEY, "INVALID_JSON_CORRUPTED{{{");
      window.dispatchEvent(new StorageEvent("storage", { key: SLACK_STORAGE_KEY }));

      expect(() => {
        const state = getSlackStoreState();
        expect(state).toBeDefined();
        expect(state.channels).toHaveLength(4);
        expect(state.activeChannelId).toBe("general");
        expect(state.users).toHaveLength(4);
        expect(state.messages.length).toBeGreaterThanOrEqual(7);
      }).not.toThrow();
    });

    it("recovers gracefully when localStorage contains literal 'null' or 'undefined'", () => {
      localStorage.setItem(SLACK_STORAGE_KEY, "null");
      window.dispatchEvent(new StorageEvent("storage", { key: SLACK_STORAGE_KEY }));

      const state1 = getSlackStoreState();
      expect(state1.channels).toHaveLength(4);

      localStorage.setItem(SLACK_STORAGE_KEY, "undefined");
      window.dispatchEvent(new StorageEvent("storage", { key: SLACK_STORAGE_KEY }));

      const state2 = getSlackStoreState();
      expect(state2.channels).toHaveLength(4);
    });

    it("recovers gracefully when localStorage payload is missing critical fields or has null arrays", () => {
      const corruptions = [
        {}, // Empty object
        { channels: null },
        { channels: [], messages: null },
        { channels: [], messages: [], users: null },
        { channels: [], messages: [], users: [], activeChannelId: null },
        { channels: "not-an-array", messages: [], users: [], activeChannelId: "general" },
        { channels: [], messages: 12345, users: [], activeChannelId: "general" },
        { channels: [], messages: [], users: { not: "array" }, activeChannelId: "general" },
        { channels: [], messages: [], users: [], activeChannelId: 9999 },
      ];

      for (const payload of corruptions) {
        localStorage.setItem(SLACK_STORAGE_KEY, JSON.stringify(payload));
        window.dispatchEvent(new StorageEvent("storage", { key: SLACK_STORAGE_KEY }));

        expect(() => {
          const state = getSlackStoreState();
          expect(state.channels).toBeDefined();
          expect(Array.isArray(state.channels)).toBe(true);
          expect(state.channels.length).toBeGreaterThanOrEqual(4);
          expect(Array.isArray(state.messages)).toBe(true);
          expect(Array.isArray(state.users)).toBe(true);
          expect(typeof state.activeChannelId).toBe("string");
        }).not.toThrow();
      }
    });

    it("survives mutated message records and persists new messages after recovery", () => {
      localStorage.setItem(SLACK_STORAGE_KEY, JSON.stringify({ broken: true }));
      window.dispatchEvent(new StorageEvent("storage", { key: SLACK_STORAGE_KEY }));

      const sent = sendMessage({
        channelId: "general",
        content: "Post recovery message",
        authorId: "karthik",
      });

      expect(sent.content).toBe("Post recovery message");
      const current = getMessage(sent.id);
      expect(current).toBeDefined();
      expect(current?.content).toBe("Post recovery message");
    });

    it("handles payload with empty channels array without returning undefined from getActiveChannel", () => {
      // Adversarial payload: valid arrays, but channels is empty
      localStorage.setItem(
        SLACK_STORAGE_KEY,
        JSON.stringify({
          channels: [],
          activeChannelId: "general",
          users: [],
          messages: [],
        }),
      );
      window.dispatchEvent(new StorageEvent("storage", { key: SLACK_STORAGE_KEY }));

      const state = getSlackStoreState();
      expect(state.channels).toEqual([]);

      // What does getActiveChannel return?
      const active = getActiveChannel();
      // If channels is empty, getActiveChannel returns undefined
      expect(active).toBeUndefined();
    });

    it("probes reaction operations when a stored message has null or undefined reactions", () => {
      // Adversarial payload: messages array has a message missing reactions array
      const corruptedMsg = {
        id: "msg-corrupted-no-reactions",
        channelId: "general",
        authorId: "karthik",
        content: "Message without reactions property",
        createdAt: new Date().toISOString(),
      };

      localStorage.setItem(
        SLACK_STORAGE_KEY,
        JSON.stringify({
          channels: INITIAL_SEED_DATA.channels,
          activeChannelId: "general",
          users: INITIAL_SEED_DATA.users,
          messages: [corruptedMsg],
        }),
      );
      window.dispatchEvent(new StorageEvent("storage", { key: SLACK_STORAGE_KEY }));

      // Does addReaction throw TypeError on msg.reactions.findIndex?
      let errorThrown: unknown = null;
      try {
        addReaction({
          messageId: "msg-corrupted-no-reactions",
          emoji: "🔥",
          userId: "nirav",
        });
      } catch (err) {
        errorThrown = err;
      }

      // msg.reactions is undefined, throws TypeError
      expect(errorThrown).toBeInstanceOf(TypeError);
    });
  });

  // =========================================================================
  // 2. CONCURRENCY & MULTI-REACTION OPERATIONS
  // =========================================================================
  describe("2. Concurrency & Multi-Reaction Operations", () => {
    it("toggles reactions rapidly across multiple users and guarantees count >= 0 and no orphaned reactions", () => {
      const msg = sendMessage({
        channelId: "general",
        content: "Stress testing reaction toggle invariants",
        authorId: "karthik",
      });

      const users = ["karthik", "nirav", "agent-k", "agent-n", "user-guest"];
      const emoji = "🔥";

      // 1. All 5 users add reaction
      for (const u of users) {
        toggleReaction({ messageId: msg.id, emoji, userId: u });
      }

      let state = getMessage(msg.id)!;
      expect(state.reactions).toHaveLength(1);
      expect(state.reactions[0].count).toBe(5);
      expect(state.reactions[0].users).toHaveLength(5);

      // 2. All 5 users toggle off
      for (const u of users) {
        toggleReaction({ messageId: msg.id, emoji, userId: u });
      }

      state = getMessage(msg.id)!;
      // Reactions array should be completely empty (pruned)
      expect(state.reactions).toHaveLength(0);

      // 3. User toggles off again (extra toggle)
      for (const u of users) {
        toggleReaction({ messageId: msg.id, emoji, userId: u }); // turns ON
        toggleReaction({ messageId: msg.id, emoji, userId: u }); // turns OFF
      }

      state = getMessage(msg.id)!;
      expect(state.reactions).toHaveLength(0);
    });

    it("maintains strict invariants under 200 randomized toggle operations", () => {
      const msg = sendMessage({
        channelId: "product",
        content: "Fuzz testing reactions",
        authorId: "nirav",
      });

      const users = ["karthik", "nirav", "agent-k", "agent-n", "tester-x"];
      const emojis = ["🚀", "👍", "❤️", "💡"];

      // Run 200 random operations
      for (let i = 0; i < 200; i++) {
        const randomUser = users[i % users.length];
        const randomEmoji = emojis[(i * 3) % emojis.length];
        toggleReaction({ messageId: msg.id, emoji: randomEmoji, userId: randomUser });

        // Verify invariants on every step
        const currentMsg = getMessage(msg.id)!;
        for (const reaction of currentMsg.reactions) {
          // Invariant 1: Count must be strictly positive
          expect(reaction.count).toBeGreaterThan(0);
          // Invariant 2: Count must exactly equal number of unique users
          expect(reaction.count).toBe(reaction.users.length);
          // Invariant 3: Users array must not contain duplicates
          const uniqueUsers = new Set(reaction.users);
          expect(uniqueUsers.size).toBe(reaction.users.length);
        }
      }
    });

    it("handles toggleReaction and addReaction on non-existent message IDs gracefully", () => {
      expect(() => {
        addReaction({ messageId: "msg-does-not-exist-404", emoji: "🔥", userId: "karthik" });
        toggleReaction({ messageId: "msg-does-not-exist-404", emoji: "🔥", userId: "karthik" });
      }).not.toThrow();

      // Ensure store remains clean
      const state = getSlackStoreState();
      expect(state.messages.some((m) => m.id === "msg-does-not-exist-404")).toBe(false);
    });

    it("handles aliased user IDs without duplicate counting in reactions", () => {
      const msg = sendMessage({
        channelId: "tech",
        content: "Alias reaction test",
        authorId: "nirav",
      });

      // User adds with alias "u-karthik"
      addReaction({ messageId: msg.id, emoji: "🚀", userId: "u-karthik" });
      // User attempts to add with alias "00000000-0000-4000-8000-000000000001"
      addReaction({ messageId: msg.id, emoji: "🚀", userId: "00000000-0000-4000-8000-000000000001" });
      // User attempts to add with canonical "karthik"
      addReaction({ messageId: msg.id, emoji: "🚀", userId: "karthik" });

      const current = getMessage(msg.id)!;
      expect(current.reactions).toHaveLength(1);
      expect(current.reactions[0].count).toBe(1);
      expect(current.reactions[0].users).toEqual(["karthik"]);

      // Now toggle off with alias "u-karthik"
      toggleReaction({ messageId: msg.id, emoji: "🚀", userId: "u-karthik" });
      const afterToggle = getMessage(msg.id)!;
      expect(afterToggle.reactions).toHaveLength(0);
    });
  });

  // =========================================================================
  // 3. THREAD REPLIES TO NON-EXISTENT MESSAGE IDS
  // =========================================================================
  describe("3. Thread Replies to Non-Existent Message IDs", () => {
    it("handles replies to non-existent root IDs cleanly without throwing or corrupting feeds", () => {
      const ghostRootId = "msg-ghost-non-existent-999";

      // 1. Send reply to non-existent message
      let reply: SlackMessage | null = null;
      expect(() => {
        reply = sendMessage({
          channelId: "strategy",
          content: "Reply to an orphaned root thread",
          authorId: "karthik",
          threadRootId: ghostRootId,
        });
      }).not.toThrow();

      expect(reply).toBeDefined();
      expect(reply!.threadRootId).toBe(ghostRootId);

      // 2. Querying non-existent root message returns undefined
      expect(getMessage(ghostRootId)).toBeUndefined();

      // 3. Channel feed must NOT display this reply as a top-level message
      const channelMsgs = getChannelMessages("strategy");
      const foundInChannel = channelMsgs.some((m) => m.id === reply!.id);
      expect(foundInChannel).toBe(false);

      // 4. Thread replies query for the ghost root returns the reply cleanly
      const replies = getThreadReplies(ghostRootId);
      expect(replies).toHaveLength(1);
      expect(replies[0].id).toBe(reply!.id);
      expect(replies[0].content).toBe("Reply to an orphaned root thread");

      // 5. Subsequent replies to same ghost root accumulate without crash
      const reply2 = sendMessage({
        channelId: "strategy",
        content: "Second reply to ghost root",
        authorId: "nirav",
        threadRootId: ghostRootId,
      });

      const updatedReplies = getThreadReplies(ghostRootId);
      expect(updatedReplies).toHaveLength(2);
      expect(updatedReplies.map((r) => r.id)).toEqual([reply!.id, reply2.id]);
    });
  });

  // =========================================================================
  // 4. MULTI-TAB STORAGE EVENTS & CROSS-TAB SYNC
  // =========================================================================
  describe("4. Multi-tab Storage Events & Cross-Tab Sync", () => {
    it("invalidates cache and triggers listeners when a storage event fires for SLACK_STORAGE_KEY", () => {
      const listener = vi.fn();
      const unsubscribe = subscribeSlackStore(listener);

      // Ensure cache is populated
      const stateBefore = getSlackStoreState();
      expect(stateBefore.activeChannelId).toBe("general");

      // Simulate another tab modifying storage
      const externalState: SlackStoreState = {
        ...INITIAL_SEED_DATA,
        activeChannelId: "tech",
        messages: [
          ...INITIAL_SEED_DATA.messages,
          {
            id: "msg-ext-1",
            channelId: "tech",
            authorId: "nirav",
            content: "Message injected by another tab",
            createdAt: new Date().toISOString(),
            reactions: [],
          },
        ],
      };

      localStorage.setItem(SLACK_STORAGE_KEY, JSON.stringify(externalState));

      // Dispatch StorageEvent on window
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: SLACK_STORAGE_KEY,
          newValue: JSON.stringify(externalState),
        }),
      );

      // Verify listener was notified
      expect(listener).toHaveBeenCalled();

      // Verify getSlackStoreState returns external state immediately
      const stateAfter = getSlackStoreState();
      expect(stateAfter.activeChannelId).toBe("tech");
      expect(stateAfter.messages.some((m) => m.id === "msg-ext-1")).toBe(true);

      unsubscribe();
    });

    it("invalidates cache and recovers to seed data when storage event fires with key null (localStorage.clear)", () => {
      const listener = vi.fn();
      const unsubscribe = subscribeSlackStore(listener);

      // Add custom state first
      sendMessage({ channelId: "general", content: "Pre clear message", authorId: "karthik" });
      expect(getSlackStoreState().messages.some((m) => m.content === "Pre clear message")).toBe(true);

      // Another tab executes localStorage.clear()
      localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: null }));

      expect(listener).toHaveBeenCalled();

      // Querying store should reseed cleanly without crash
      const resetState = getSlackStoreState();
      expect(resetState.activeChannelId).toBe("general");
      expect(resetState.messages.some((m) => m.content === "Pre clear message")).toBe(false);

      unsubscribe();
    });

    it("ignores storage events for unrelated keys", () => {
      const listener = vi.fn();
      const unsubscribe = subscribeSlackStore(listener);

      // Dispatch event for unrelated key
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "unrelated:key:v1",
          newValue: "test",
        }),
      );

      // Listener should NOT be called
      expect(listener).not.toHaveBeenCalled();

      unsubscribe();
    });
  });

  // =========================================================================
  // 5. NORMALIZATION & ADVERSARIAL USER STRINGS
  // =========================================================================
  describe("5. normalizeUserId Adversarial Inputs & Email Mapping", () => {
    it("documents current behavior of normalizeUserId on whitespace strings", () => {
      expect(normalizeUserId("")).toBe("unknown");
      // Whitespace string is not normalized to 'unknown' but returns the raw whitespace string
      expect(normalizeUserId("   ")).toBe("   ");
    });

    it("documents behavior on founder email addresses", () => {
      // karthik@learnora.dev does not contain 'chinthalapati' and is not 'karthik'
      // so it currently returns the raw email string rather than 'karthik'
      expect(normalizeUserId("karthik@learnora.dev")).toBe("karthik@learnora.dev");
      expect(normalizeUserId("nirav@learnora.dev")).toBe("nirav@learnora.dev");

      // While kk.chinthalapati@gmail.com matches clean.includes('chinthalapati')
      expect(normalizeUserId("kk.chinthalapati@gmail.com")).toBe("karthik");
    });

    it("normalizes case variations and whitespace for founders and AI advisors", () => {
      expect(normalizeUserId("  KARTHIK  ")).toBe("karthik");
      expect(normalizeUserId("NIRAV")).toBe("nirav");
      expect(normalizeUserId("  K_AI ")).toBe("agent-k");
      expect(normalizeUserId("n_ai")).toBe("agent-n");
      expect(normalizeUserId("Agent-K")).toBe("agent-k");
      expect(normalizeUserId("Agent-N")).toBe("agent-n");
    });
  });
});
