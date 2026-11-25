import { useSyncExternalStore } from "react";
import {
  type SlackMessage,
  type SlackChannel,
  sendMessage,
} from "./slackStore";
import {
  type AIMentionTarget,
  detectAIMentions,
} from "./mentions";
import {
  getAIPersona,
  buildAIContext,
} from "./aiPersonas";
import { executeAIRotation } from "./aiRotationEngine";

// ==========================================
// 1. Thinking Indicator Store (In-Memory Reactive)
// ==========================================

export interface ThinkingStatus {
  id: string; // `${persona}-${channelId}-${threadRootId || 'feed'}`
  persona: AIMentionTarget;
  channelId: string;
  threadRootId?: string;
  startedAt: number;
}

let activeThinkingList: ThinkingStatus[] = [];
let cachedThinkingSnapshots = new Map<string, ThinkingStatus[]>();
const EMPTY_THINKING_LIST: ThinkingStatus[] = [];
const thinkingListeners = new Set<() => void>();

function notifyThinkingChange(): void {
  cachedThinkingSnapshots.clear();
  for (const listener of thinkingListeners) {
    try {
      listener();
    } catch {
      /* ignore listener error */
    }
  }
}

export function subscribeThinking(listener: () => void): () => void {
  thinkingListeners.add(listener);
  return () => {
    thinkingListeners.delete(listener);
  };
}

export function getThinkingList(): ThinkingStatus[] {
  return activeThinkingList;
}

export function addThinkingIndicator(status: ThinkingStatus): void {
  if (activeThinkingList.some((t) => t.id === status.id)) return;
  activeThinkingList = [...activeThinkingList, status];
  notifyThinkingChange();
}

export function removeThinkingIndicator(indicatorId: string): void {
  activeThinkingList = activeThinkingList.filter((t) => t.id !== indicatorId);
  notifyThinkingChange();
}

export function clearAllThinking(): void {
  activeThinkingList = [];
  notifyThinkingChange();
}

export function getThinkingSnapshot(channelId: string, threadRootId?: string): ThinkingStatus[] {
  const key = `${channelId}:${threadRootId ?? ""}`;
  let snapshot = cachedThinkingSnapshots.get(key);
  if (!snapshot) {
    snapshot = activeThinkingList.filter(
      (t) =>
        t.channelId === channelId &&
        (threadRootId ? t.threadRootId === threadRootId : !t.threadRootId),
    );
    cachedThinkingSnapshots.set(key, snapshot);
  }
  return snapshot;
}

/**
 * React 19 hook to observe active thinking indicators for a channel and optional thread.
 */
export function useSlackThinking(channelId: string, threadRootId?: string): ThinkingStatus[] {
  return useSyncExternalStore(
    subscribeThinking,
    () => getThinkingSnapshot(channelId, threadRootId),
    () => EMPTY_THINKING_LIST,
  );
}

// ==========================================
// 2. Dispatcher Orchestrator
// ==========================================

export interface DispatchAIMentionsParams {
  userMessage: SlackMessage;
  channel?: SlackChannel;
  channelId?: string;
  channelName?: string;
  channelDescription?: string;
  threadRootId?: string;
  threadRootMessage?: SlackMessage;
}

/**
 * Inspects a user message for AI mentions (@K AI, @N AI), displays in-stream thinking indicators,
 * executes multi-provider rotation concurrently, posts replies to slackStore, and removes indicators.
 */
export async function dispatchAIMentions(
  params: DispatchAIMentionsParams,
): Promise<SlackMessage[]> {
  const content = params.userMessage.content;
  const targetChannelId = params.channelId ?? params.channel?.id ?? params.userMessage.channelId;
  const targetChannelName = params.channelName ?? params.channel?.name ?? targetChannelId;
  const targetThreadRootId = params.threadRootId ?? params.userMessage.threadRootId;

  const mentionedPersonas = detectAIMentions(content);
  if (mentionedPersonas.length === 0) {
    return [];
  }

  const results: SlackMessage[] = [];

  // Concurrently execute responses for each mentioned AI co-founder
  await Promise.all(
    mentionedPersonas.map(async (personaId) => {
      const personaConfig = getAIPersona(personaId);
      const indicatorId = `${personaId}-${targetChannelId}-${targetThreadRootId || "feed"}`;

      // 1. Show reactive thinking indicator
      addThinkingIndicator({
        id: indicatorId,
        persona: personaId,
        channelId: targetChannelId,
        threadRootId: targetThreadRootId,
        startedAt: Date.now(),
      });

      try {
        // 2. Build multi-turn context
        const context = buildAIContext({
          personaId,
          channelId: targetChannelId,
          channelName: targetChannelName,
          channelDescription: params.channel?.description,
          threadRootId: targetThreadRootId,
          userPrompt: content,
          senderId: params.userMessage.authorId,
        });

        // 3. Execute multi-provider rotation engine
        const aiResult = await executeAIRotation({
          systemInstruction: context.systemInstruction,
          openAiMessages: context.openAiMessages,
          geminiPayload: context.geminiPayload,
          userPrompt: content,
        });

        // 4. Commit AI response into slackStore
        const posted = sendMessage({
          channelId: targetChannelId,
          content: aiResult.text,
          authorId: personaConfig.storeUserId,
          threadRootId: targetThreadRootId,
          providerUsed: aiResult.provider,
        });

        results.push(posted);
      } catch (err: any) {
        // 5. Post friendly fallback message if all providers fail
        const errorDesc = err?.message || "Failed to reach AI providers";
        const fallbackMessage = sendMessage({
          channelId: targetChannelId,
          content: `⚠️ @${personaConfig.name} could not connect to AI providers right now (${errorDesc}). Please try again in a moment.`,
          authorId: personaConfig.storeUserId,
          threadRootId: targetThreadRootId,
        });
        results.push(fallbackMessage);
      } finally {
        // 6. Guarantee thinking indicator removal
        removeThinkingIndicator(indicatorId);
      }
    }),
  );

  return results;
}

/**
 * Convenient React hook to trigger hands-free background AI execution.
 */
export function useSlackAiDispatcher() {
  const dispatchMessage = async (params: DispatchAIMentionsParams): Promise<SlackMessage[]> => {
    return dispatchAIMentions(params);
  };

  return { dispatchMessage };
}
