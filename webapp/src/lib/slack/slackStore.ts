import { useSyncExternalStore, useMemo } from "react";
import { Storage } from "../storage";

// ==========================================
// 1. Data Types & Interfaces
// ==========================================

export interface SlackUser {
  id: string;
  name: string;
  avatar?: string;
  role: "founder" | "ai_advisor";
  advisorType?: "strategy" | "operations";
  isOnline: boolean;
  statusText?: string;
}

export interface SlackReaction {
  emoji: string;
  count: number;
  users: string[]; // User IDs who reacted
}

export interface SlackMessage {
  id: string;
  channelId: string;
  authorId: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  threadRootId?: string; // Set only if this message is a thread reply
  replyCount?: number;   // Top-level message reply count
  lastReplyAt?: string;  // Top-level message last reply timestamp
  reactions: SlackReaction[];
  providerUsed?: "gemini" | "groq" | "openrouter";
}

export interface SlackChannel {
  id: string;
  name: string;
  description: string;
  isPrivate: boolean;
}

export interface SlackStoreState {
  channels: SlackChannel[];
  activeChannelId: string;
  users: SlackUser[];
  messages: SlackMessage[];
}

export interface SendMessageParams {
  channelId: string;
  content: string;
  authorId: string;
  threadRootId?: string;
  providerUsed?: "gemini" | "groq" | "openrouter";
}

export interface ReactionParams {
  messageId: string;
  emoji: string;
  userId: string;
}

// ==========================================
// 2. Constants & Seed Data
// ==========================================

export const SLACK_STORAGE_KEY = "learnora:slack:store:v1";
export const SLACK_STORE_CHANGE_EVENT = "learnora:slack:store_changed";

export const INITIAL_CHANNELS: SlackChannel[] = [
  {
    id: "general",
    name: "general",
    description: "Company-wide announcements, high-level founder syncs, and general chat",
    isPrivate: false,
  },
  {
    id: "product",
    name: "product",
    description: "Product roadmap, UI/UX polish, feature specs, and user feedback",
    isPrivate: false,
  },
  {
    id: "strategy",
    name: "strategy",
    description: "Long-term vision, business models, monetization, and competitive moats",
    isPrivate: false,
  },
  {
    id: "tech",
    name: "tech",
    description: "Architecture, scalability, performance optimizations, and infrastructure",
    isPrivate: false,
  },
];

export const INITIAL_USERS: SlackUser[] = [
  {
    id: "karthik",
    name: "Karthik",
    avatar: "/avatars/karthik.png",
    role: "founder",
    isOnline: true,
    statusText: "Building Learnora 🚀",
  },
  {
    id: "nirav",
    name: "Nirav",
    avatar: "/avatars/nirav.png",
    role: "founder",
    isOnline: true,
    statusText: "Evaluating risks & scale ⚡",
  },
  {
    id: "agent-k",
    name: "K AI",
    avatar: "/avatars/k-ai.png",
    role: "ai_advisor",
    advisorType: "strategy",
    isOnline: true,
    statusText: "Strategy & Growth Co-Founder 🧠",
  },
  {
    id: "agent-n",
    name: "N AI",
    avatar: "/avatars/n-ai.png",
    role: "ai_advisor",
    advisorType: "operations",
    isOnline: true,
    statusText: "Operations & Risk Co-Founder 🛡️",
  },
];

export const INITIAL_MESSAGES: SlackMessage[] = [
  {
    id: "msg-gen-1",
    channelId: "general",
    authorId: "karthik",
    content: "Welcome to our personal founders' Slack! 🚀 Excited to have a dedicated workspace for the two of us plus @K AI and @N AI. Let's keep strategy, product, and tech discussions organized here.",
    createdAt: "2026-11-09T07:00:00.000Z",
    reactions: [
      { emoji: "🚀", count: 2, users: ["nirav", "agent-k"] },
      { emoji: "🔥", count: 1, users: ["karthik"] },
    ],
  },
  {
    id: "msg-gen-2",
    channelId: "general",
    authorId: "nirav",
    content: "Great to have this up. Having @K AI for strategy and @N AI for operational risk directly in our channels will speed up decision velocity without switching tabs.",
    createdAt: "2026-11-09T07:02:00.000Z",
    reactions: [
      { emoji: "💯", count: 2, users: ["karthik", "nirav"] },
    ],
  },
  {
    id: "msg-gen-3",
    channelId: "general",
    authorId: "agent-k",
    content: "Ready to drive Learnora's growth and competitive moat. Mention me anytime with @K AI for strategy, pricing models, or roadmap trade-offs.",
    createdAt: "2026-11-09T07:04:00.000Z",
    reactions: [
      { emoji: "🧠", count: 2, users: ["karthik", "nirav"] },
    ],
  },
  {
    id: "msg-gen-4",
    channelId: "general",
    authorId: "agent-n",
    content: "Standing by to stress-test architecture, technical debt, and execution risks. Mention me with @N AI whenever you need an operational sanity check.",
    createdAt: "2026-11-09T07:05:00.000Z",
    reactions: [
      { emoji: "🛡️", count: 2, users: ["karthik", "nirav"] },
    ],
  },
  {
    id: "msg-strat-1",
    channelId: "strategy",
    authorId: "karthik",
    content: "Setting up our core strategic pillars for Q4. @K AI what are the top 3 expansion levers we should prioritize?",
    createdAt: "2026-11-09T07:10:00.000Z",
    reactions: [
      { emoji: "💡", count: 1, users: ["nirav"] },
    ],
  },
  {
    id: "msg-prod-1",
    channelId: "product",
    authorId: "nirav",
    content: "Tracking student feedback on flashcard study sessions. Focusing on latency and continuous review loops.",
    createdAt: "2026-11-09T07:12:00.000Z",
    reactions: [
      { emoji: "👀", count: 2, users: ["karthik", "agent-k"] },
    ],
  },
  {
    id: "msg-tech-1",
    channelId: "tech",
    authorId: "nirav",
    content: "Reviewing local-first client state and offline resilience. @N AI let's ensure our multi-provider fallback handles 429 rate limits gracefully.",
    createdAt: "2026-11-09T07:15:00.000Z",
    reactions: [
      { emoji: "⚡", count: 2, users: ["karthik", "agent-n"] },
    ],
  },
];

export const INITIAL_SEED_DATA: SlackStoreState = Object.freeze({
  channels: INITIAL_CHANNELS,
  activeChannelId: "general",
  users: INITIAL_USERS,
  messages: INITIAL_MESSAGES,
});

// ==========================================
// 3. In-Memory Cache & Normalization
// ==========================================

let cachedState: SlackStoreState | null = null;
const listeners = new Set<() => void>();

export function normalizeUserId(userId: string): string {
  if (!userId) return "unknown";
  const clean = userId.trim().toLowerCase();
  if (
    clean === "karthik" ||
    clean === "u-karthik" ||
    clean === "00000000-0000-4000-8000-000000000001" ||
    clean === "00000000-0000-0000-0000-00000000000a" ||
    clean.includes("chinthalapati")
  ) {
    return "karthik";
  }
  if (
    clean === "nirav" ||
    clean === "u-nirav" ||
    clean === "00000000-0000-4000-8000-000000000002" ||
    clean === "00000000-0000-0000-0000-00000000000b"
  ) {
    return "nirav";
  }
  if (clean === "agent-k" || clean === "k_ai" || clean === "k-ai") {
    return "agent-k";
  }
  if (clean === "agent-n" || clean === "n_ai" || clean === "n-ai") {
    return "agent-n";
  }
  return userId;
}

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Ignore listener error
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SLACK_STORE_CHANGE_EVENT));
  }
}

// Multi-tab sync via window storage event
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event: StorageEvent) => {
    if (event.key === SLACK_STORAGE_KEY || event.key === null) {
      cachedState = null;
      notifyListeners();
    }
  });
}

// ==========================================
// 4. Persistence & State Accessors
// ==========================================

export function getSlackStoreState(): SlackStoreState {
  if (!cachedState) {
    const stored = Storage.get<SlackStoreState | null>(SLACK_STORAGE_KEY, null);
    if (
      stored &&
      Array.isArray(stored.channels) &&
      Array.isArray(stored.messages) &&
      Array.isArray(stored.users) &&
      typeof stored.activeChannelId === "string"
    ) {
      cachedState = stored;
    } else {
      cachedState = JSON.parse(JSON.stringify(INITIAL_SEED_DATA));
      Storage.set(SLACK_STORAGE_KEY, cachedState);
    }
  }
  return cachedState!;
}

function updateState(updater: (prev: SlackStoreState) => SlackStoreState): SlackStoreState {
  const current = getSlackStoreState();
  const next = updater(current);
  cachedState = next;
  Storage.set(SLACK_STORAGE_KEY, next);
  notifyListeners();
  return next;
}

export function subscribeSlackStore(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);

  return () => {
    listeners.delete(onStoreChange);
  };
}

// ==========================================
// 5. Store Actions
// ==========================================

export function sendMessage(params: SendMessageParams): SlackMessage {
  const authorId = normalizeUserId(params.authorId);
  const now = new Date().toISOString();
  const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const newMessage: SlackMessage = {
    id: messageId,
    channelId: params.channelId,
    authorId,
    content: params.content.trim(),
    createdAt: now,
    reactions: [],
    ...(params.threadRootId ? { threadRootId: params.threadRootId } : {}),
    ...(params.providerUsed ? { providerUsed: params.providerUsed } : {}),
  };

  updateState((prev) => {
    const updatedMessages = prev.messages.map((m) => {
      if (params.threadRootId && m.id === params.threadRootId) {
        return {
          ...m,
          replyCount: (m.replyCount ?? 0) + 1,
          lastReplyAt: now,
        };
      }
      return m;
    });

    return {
      ...prev,
      messages: [...updatedMessages, newMessage],
    };
  });

  return newMessage;
}

export function addReaction(params: ReactionParams): void {
  const userId = normalizeUserId(params.userId);

  updateState((prev) => {
    const updatedMessages = prev.messages.map((msg) => {
      if (msg.id !== params.messageId) return msg;

      const existingReactionIndex = msg.reactions.findIndex((r) => r.emoji === params.emoji);
      if (existingReactionIndex >= 0) {
        const existing = msg.reactions[existingReactionIndex];
        if (existing.users.includes(userId)) return msg; // Already reacted

        const updatedReactions = [...msg.reactions];
        updatedReactions[existingReactionIndex] = {
          ...existing,
          count: existing.count + 1,
          users: [...existing.users, userId],
        };
        return { ...msg, reactions: updatedReactions };
      }

      return {
        ...msg,
        reactions: [...msg.reactions, { emoji: params.emoji, count: 1, users: [userId] }],
      };
    });

    return { ...prev, messages: updatedMessages };
  });
}

export function toggleReaction(params: ReactionParams): void {
  const userId = normalizeUserId(params.userId);

  updateState((prev) => {
    const updatedMessages = prev.messages.map((msg) => {
      if (msg.id !== params.messageId) return msg;

      const existingReactionIndex = msg.reactions.findIndex((r) => r.emoji === params.emoji);
      if (existingReactionIndex >= 0) {
        const existing = msg.reactions[existingReactionIndex];
        if (existing.users.includes(userId)) {
          // Remove reaction
          const remainingUsers = existing.users.filter((u) => u !== userId);
          if (remainingUsers.length === 0) {
            return {
              ...msg,
              reactions: msg.reactions.filter((r) => r.emoji !== params.emoji),
            };
          }
          const updatedReactions = [...msg.reactions];
          updatedReactions[existingReactionIndex] = {
            ...existing,
            count: remainingUsers.length,
            users: remainingUsers,
          };
          return { ...msg, reactions: updatedReactions };
        } else {
          // User adding to existing reaction
          const updatedReactions = [...msg.reactions];
          updatedReactions[existingReactionIndex] = {
            ...existing,
            count: existing.count + 1,
            users: [...existing.users, userId],
          };
          return { ...msg, reactions: updatedReactions };
        }
      }

      // Add new reaction
      return {
        ...msg,
        reactions: [...msg.reactions, { emoji: params.emoji, count: 1, users: [userId] }],
      };
    });

    return { ...prev, messages: updatedMessages };
  });
}

export function setActiveChannel(channelId: string): void {
  updateState((prev) => ({
    ...prev,
    activeChannelId: channelId,
  }));
}

export function setPresence(userId: string, isOnline: boolean, statusText?: string): void {
  const normalizedId = normalizeUserId(userId);

  updateState((prev) => {
    const existingIndex = prev.users.findIndex((u) => u.id === normalizedId);
    if (existingIndex >= 0) {
      const updatedUsers = [...prev.users];
      updatedUsers[existingIndex] = {
        ...updatedUsers[existingIndex],
        isOnline,
        ...(statusText !== undefined ? { statusText } : {}),
      };
      return { ...prev, users: updatedUsers };
    }
    return prev;
  });
}

export function resetStore(): void {
  cachedState = JSON.parse(JSON.stringify(INITIAL_SEED_DATA));
  Storage.set(SLACK_STORAGE_KEY, cachedState);
  notifyListeners();
}

// ==========================================
// 6. Query Selectors
// ==========================================

export function getChannels(): SlackChannel[] {
  return getSlackStoreState().channels;
}

export function getActiveChannel(): SlackChannel {
  const state = getSlackStoreState();
  return state.channels.find((c) => c.id === state.activeChannelId) || state.channels[0];
}

export function getChannelMessages(channelId: string): SlackMessage[] {
  return getSlackStoreState()
    .messages.filter((m) => m.channelId === channelId && !m.threadRootId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function getThreadReplies(threadRootId: string): SlackMessage[] {
  return getSlackStoreState()
    .messages.filter((m) => m.threadRootId === threadRootId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function getMessage(messageId: string): SlackMessage | undefined {
  return getSlackStoreState().messages.find((m) => m.id === messageId);
}

export function getUsers(): SlackUser[] {
  return getSlackStoreState().users;
}

export function getUser(userId: string): SlackUser | undefined {
  const normalized = normalizeUserId(userId);
  return getSlackStoreState().users.find((u) => u.id === normalized);
}

// ==========================================
// 7. React 19 Hooks
// ==========================================

export function useSlackStore<T = SlackStoreState>(selector?: (state: SlackStoreState) => T): T {
  const state = useSyncExternalStore(
    subscribeSlackStore,
    getSlackStoreState,
    () => INITIAL_SEED_DATA,
  );
  return useMemo(() => (selector ? selector(state) : (state as unknown as T)), [state, selector]);
}

export function useSlackActiveChannel(): SlackChannel {
  const state = useSyncExternalStore(subscribeSlackStore, getSlackStoreState, () => INITIAL_SEED_DATA);
  return useMemo(
    () => state.channels.find((c) => c.id === state.activeChannelId) || state.channels[0],
    [state.channels, state.activeChannelId],
  );
}

export function useSlackChannels(): SlackChannel[] {
  const state = useSyncExternalStore(subscribeSlackStore, getSlackStoreState, () => INITIAL_SEED_DATA);
  return state.channels;
}

export function useSlackChannelMessages(channelId: string): SlackMessage[] {
  const state = useSyncExternalStore(subscribeSlackStore, getSlackStoreState, () => INITIAL_SEED_DATA);
  return useMemo(
    () =>
      state.messages
        .filter((m) => m.channelId === channelId && !m.threadRootId)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [state.messages, channelId],
  );
}

export function useSlackThreadReplies(threadRootId: string | null | undefined): SlackMessage[] {
  const state = useSyncExternalStore(subscribeSlackStore, getSlackStoreState, () => INITIAL_SEED_DATA);
  return useMemo(() => {
    if (!threadRootId) return [];
    return state.messages
      .filter((m) => m.threadRootId === threadRootId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [state.messages, threadRootId]);
}

export function useSlackUsers(): SlackUser[] {
  const state = useSyncExternalStore(subscribeSlackStore, getSlackStoreState, () => INITIAL_SEED_DATA);
  return state.users;
}

export function useSlackUser(userId: string): SlackUser | undefined {
  const state = useSyncExternalStore(subscribeSlackStore, getSlackStoreState, () => INITIAL_SEED_DATA);
  const normalized = normalizeUserId(userId);
  return useMemo(() => state.users.find((u) => u.id === normalized), [state.users, normalized]);
}
