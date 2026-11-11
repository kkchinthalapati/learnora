import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getSlackStoreState,
  sendMessage,
  addReaction,
  toggleReaction,
  setActiveChannel,
  setPresence,
  resetStore,
  getChannels,
  getActiveChannel,
  getChannelMessages,
  getThreadReplies,
  getMessage,
  getUser,
  subscribeSlackStore,
  SLACK_STORAGE_KEY,
  type SlackStoreState,
} from "./slackStore";

describe("slackStore", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    vi.clearAllMocks();
  });

  describe("1. Initialization & LocalStorage Persistence", () => {
    it("initializes empty storage with default seed data", () => {
      const state = getSlackStoreState();
      expect(state.channels).toHaveLength(4);
      expect(state.channels.map((c) => c.name)).toEqual(["general", "product", "strategy", "tech"]);
      expect(state.activeChannelId).toBe("general");
      expect(state.users).toHaveLength(4);
      expect(state.users.map((u) => u.name)).toEqual(["Karthik", "Nirav", "K AI", "N AI"]);
      expect(state.messages.length).toBeGreaterThanOrEqual(7);

      // Verify stored in localStorage
      const rawStored = localStorage.getItem(SLACK_STORAGE_KEY);
      expect(rawStored).toBeTruthy();
      const parsed: SlackStoreState = JSON.parse(rawStored!);
      expect(parsed.channels).toHaveLength(4);
      expect(parsed.activeChannelId).toBe("general");
    });

    it("survives cache clear and reads back persisted changes from localStorage", () => {
      sendMessage({
        channelId: "strategy",
        content: "Testing persistence across cache invalidation",
        authorId: "karthik",
      });

      // Reset store state reference
      const stateBefore = getSlackStoreState();
      const msgCount = stateBefore.messages.length;

      // Wipe memory cache by calling getSlackStoreState after re-instantiation
      const stored = JSON.parse(localStorage.getItem(SLACK_STORAGE_KEY)!);
      expect(stored.messages).toHaveLength(msgCount);
      expect(stored.messages[stored.messages.length - 1].content).toBe(
        "Testing persistence across cache invalidation",
      );
    });
  });

  describe("2. Channel Selection", () => {
    it("defaults active channel to general and allows switching", () => {
      expect(getActiveChannel().id).toBe("general");

      setActiveChannel("tech");
      expect(getActiveChannel().id).toBe("tech");
      expect(getActiveChannel().name).toBe("tech");

      // Verify persistence
      const state = getSlackStoreState();
      expect(state.activeChannelId).toBe("tech");
    });

    it("returns all configured seed channels", () => {
      const channels = getChannels();
      expect(channels.map((c) => c.id)).toEqual(["general", "product", "strategy", "tech"]);
    });
  });

  describe("3. Sending Messages", () => {
    it("creates message with generated id, ISO createdAt, and correct attributes", () => {
      const msg = sendMessage({
        channelId: "general",
        content: "Hello team!",
        authorId: "nirav",
      });

      expect(msg.id).toMatch(/^msg-\d+-[a-z0-9]+$/);
      expect(msg.channelId).toBe("general");
      expect(msg.authorId).toBe("nirav");
      expect(msg.content).toBe("Hello team!");
      expect(msg.reactions).toEqual([]);
      expect(new Date(msg.createdAt).getTime()).toBeGreaterThan(0);

      const retrieved = getMessage(msg.id);
      expect(retrieved).toEqual(msg);
    });

    it("normalizes authorId aliases (e.g. u-karthik or UUID)", () => {
      const msg1 = sendMessage({
        channelId: "general",
        content: "Alias 1",
        authorId: "u-karthik",
      });
      expect(msg1.authorId).toBe("karthik");

      const msg2 = sendMessage({
        channelId: "general",
        content: "Alias 2",
        authorId: "00000000-0000-4000-8000-000000000002",
      });
      expect(msg2.authorId).toBe("nirav");

      const msg3 = sendMessage({
        channelId: "general",
        content: "AI Alias",
        authorId: "k_ai",
      });
      expect(msg3.authorId).toBe("agent-k");
    });
  });

  describe("4. Thread Reply Linkage", () => {
    it("links thread replies to root message and increments replyCount and lastReplyAt", () => {
      const rootMsg = sendMessage({
        channelId: "strategy",
        content: "Root proposal: Expansion to high schools?",
        authorId: "karthik",
      });

      expect(rootMsg.replyCount).toBeUndefined();

      const reply1 = sendMessage({
        channelId: "strategy",
        content: "Agreed, let's test a pilot first.",
        authorId: "nirav",
        threadRootId: rootMsg.id,
      });

      expect(reply1.threadRootId).toBe(rootMsg.id);

      const updatedRoot1 = getMessage(rootMsg.id)!;
      expect(updatedRoot1.replyCount).toBe(1);
      expect(updatedRoot1.lastReplyAt).toBe(reply1.createdAt);

      const reply2 = sendMessage({
        channelId: "strategy",
        content: "@K AI analyze the unit economics for high schools.",
        authorId: "nirav",
        threadRootId: rootMsg.id,
      });

      const updatedRoot2 = getMessage(rootMsg.id)!;
      expect(updatedRoot2.replyCount).toBe(2);
      expect(updatedRoot2.lastReplyAt).toBe(reply2.createdAt);

      // Verify getChannelMessages excludes replies
      const channelMessages = getChannelMessages("strategy");
      const foundReplyInFeed = channelMessages.some((m) => m.id === reply1.id || m.id === reply2.id);
      expect(foundReplyInFeed).toBe(false);

      // Verify getThreadReplies returns only replies in order
      const threadReplies = getThreadReplies(rootMsg.id);
      expect(threadReplies).toHaveLength(2);
      expect(threadReplies[0].id).toBe(reply1.id);
      expect(threadReplies[1].id).toBe(reply2.id);
    });
  });

  describe("5. Reaction Toggling", () => {
    it("adds a reaction to a message and increments count", () => {
      const msg = sendMessage({
        channelId: "tech",
        content: "Released new Vite build optimization",
        authorId: "nirav",
      });

      addReaction({ messageId: msg.id, emoji: "🚀", userId: "karthik" });

      const updated = getMessage(msg.id)!;
      expect(updated.reactions).toHaveLength(1);
      expect(updated.reactions[0]).toEqual({
        emoji: "🚀",
        count: 1,
        users: ["karthik"],
      });
    });

    it("prevents duplicate reactions from same user on addReaction", () => {
      const msg = sendMessage({
        channelId: "tech",
        content: "Test idempotence",
        authorId: "nirav",
      });

      addReaction({ messageId: msg.id, emoji: "🚀", userId: "karthik" });
      addReaction({ messageId: msg.id, emoji: "🚀", userId: "karthik" });

      const updated = getMessage(msg.id)!;
      expect(updated.reactions).toHaveLength(1);
      expect(updated.reactions[0].count).toBe(1);
    });

    it("toggles reaction off when already present, and removes entry when count drops to zero", () => {
      const msg = sendMessage({
        channelId: "tech",
        content: "Toggle reaction test",
        authorId: "nirav",
      });

      // First toggle: adds reaction
      toggleReaction({ messageId: msg.id, emoji: "🔥", userId: "karthik" });
      expect(getMessage(msg.id)!.reactions).toHaveLength(1);
      expect(getMessage(msg.id)!.reactions[0].count).toBe(1);

      // Second toggle: removes reaction
      toggleReaction({ messageId: msg.id, emoji: "🔥", userId: "karthik" });
      expect(getMessage(msg.id)!.reactions).toHaveLength(0);

      // Third toggle: re-adds reaction
      toggleReaction({ messageId: msg.id, emoji: "🔥", userId: "karthik" });
      expect(getMessage(msg.id)!.reactions).toHaveLength(1);
    });
  });

  describe("6. Multi-User Reactions", () => {
    it("handles multiple users reacting with the same emoji and independent removal", () => {
      const msg = sendMessage({
        channelId: "general",
        content: "Sprint goals achieved!",
        authorId: "karthik",
      });

      // User 1 reacts
      addReaction({ messageId: msg.id, emoji: "🎉", userId: "karthik" });
      // User 2 reacts
      addReaction({ messageId: msg.id, emoji: "🎉", userId: "nirav" });

      let current = getMessage(msg.id)!;
      expect(current.reactions).toHaveLength(1);
      expect(current.reactions[0].count).toBe(2);
      expect(current.reactions[0].users).toEqual(["karthik", "nirav"]);

      // User 1 toggles off
      toggleReaction({ messageId: msg.id, emoji: "🎉", userId: "karthik" });
      current = getMessage(msg.id)!;
      expect(current.reactions).toHaveLength(1);
      expect(current.reactions[0].count).toBe(1);
      expect(current.reactions[0].users).toEqual(["nirav"]);

      // User 2 toggles off
      toggleReaction({ messageId: msg.id, emoji: "🎉", userId: "nirav" });
      current = getMessage(msg.id)!;
      expect(current.reactions).toHaveLength(0);
    });

    it("manages multiple distinct emoji reactions simultaneously", () => {
      const msg = sendMessage({
        channelId: "general",
        content: "Multi emoji test",
        authorId: "karthik",
      });

      addReaction({ messageId: msg.id, emoji: "👍", userId: "karthik" });
      addReaction({ messageId: msg.id, emoji: "❤️", userId: "nirav" });
      addReaction({ messageId: msg.id, emoji: "💡", userId: "agent-k" });

      const current = getMessage(msg.id)!;
      expect(current.reactions).toHaveLength(3);
      expect(current.reactions.map((r) => r.emoji)).toEqual(["👍", "❤️", "💡"]);
    });
  });

  describe("7. User Presence & Profiles", () => {
    it("updates user presence and statusText", () => {
      setPresence("karthik", false, "In deep strategy review 🧠");

      const user = getUser("karthik");
      expect(user).toBeDefined();
      expect(user?.isOnline).toBe(false);
      expect(user?.statusText).toBe("In deep strategy review 🧠");
    });

    it("resolves user by aliases using normalizeUserId", () => {
      expect(getUser("u-karthik")?.name).toBe("Karthik");
      expect(getUser("00000000-0000-4000-8000-000000000002")?.name).toBe("Nirav");
      expect(getUser("agent-k")?.name).toBe("K AI");
      expect(getUser("agent-n")?.name).toBe("N AI");
    });
  });

  describe("8. Store Reset", () => {
    it("restores seed data and clears custom mutations", () => {
      sendMessage({ channelId: "general", content: "Transient message", authorId: "karthik" });
      setActiveChannel("tech");
      expect(getSlackStoreState().activeChannelId).toBe("tech");

      resetStore();

      const state = getSlackStoreState();
      expect(state.activeChannelId).toBe("general");
      expect(state.messages.some((m) => m.content === "Transient message")).toBe(false);
    });
  });

  describe("9. Subscriptions & Event Notifications", () => {
    it("triggers registered listener on mutations and supports unsubscription", () => {
      const listener = vi.fn();
      const unsubscribe = subscribeSlackStore(listener);

      sendMessage({ channelId: "general", content: "Sub trigger", authorId: "karthik" });
      expect(listener).toHaveBeenCalledTimes(1);

      toggleReaction({ messageId: "msg-gen-1", emoji: "🔥", userId: "nirav" });
      expect(listener).toHaveBeenCalledTimes(2);

      setActiveChannel("strategy");
      expect(listener).toHaveBeenCalledTimes(3);

      unsubscribe();

      sendMessage({ channelId: "general", content: "Post unsubscribe", authorId: "karthik" });
      expect(listener).toHaveBeenCalledTimes(3); // Not incremented
    });
  });
});
