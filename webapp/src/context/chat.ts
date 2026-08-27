import { createContext, useContext } from "react";
import type { IconName } from "../components/icons";
import type { FlashcardDraft } from "../lib/aiJson";

/* Chat context + hook. Provider lives in ChatProvider.tsx.
 *
 * Everything here is plain data — no React nodes. The provider decides *what*
 * happened; `ChatMessage` decides how it looks. That split is what lets the
 * action-tag execution be tested without rendering anything. */

/** An action the app executed (or declined to) on the model's instruction.
 *  Replaces the tag block at its exact position in the reply, which is why
 *  the reply is a list of parts rather than one string. */
export interface ActionWidget {
  icon: IconName;
  /** Sentence shown to the student, e.g. "Added task:". */
  text: string;
  /** The subject of the action, rendered emphasised. */
  subject?: string;
  /** True when the student declined, or the action could not be carried out. */
  cancelled: boolean;
}

export type ReplyPart =
  { kind: "text"; text: string } | { kind: "widget"; widget: ActionWidget };

export interface ChatMessage {
  id: string;
  role: "user" | "ai";
  /** User messages, and AI messages before their actions have been resolved. */
  text: string;
  /** AI messages once actions are executed: text interleaved with widgets. */
  parts?: ReplyPart[];
  /** Name of a file attached to a user message. */
  fileName?: string;
  /** AI message still waiting on the model. */
  pending?: boolean;
  /** AI message that is a failure notice rather than a reply. */
  error?: boolean;
  /** A reply that was a flashcard set rather than prose. */
  cards?: FlashcardDraft[];
  /** Set once `cards` has been saved as a real deck — the id it saved to,
   *  so the bubble can swap its "Save as deck" button for a link there
   *  instead of letting the student save the same set twice. */
  savedDeckId?: string;
  /** True while `saveCards` is persisting this message's `cards`. */
  savingCards?: boolean;
}

export interface AttachedFile {
  name: string;
  mimeType: string;
  /** base64, without the `data:…;base64,` prefix. */
  data: string;
}

export interface ChatApi {
  messages: ChatMessage[];
  isOpen: boolean;
  isFullscreen: boolean;
  /** True while a reply is in flight. */
  isSending: boolean;
  file: AttachedFile | null;

  open: () => void;
  close: () => void;
  toggleFullscreen: () => void;
  /** Open the panel and put `text` in the composer without sending it. */
  compose: (text: string) => void;
  /** Text the composer should adopt; cleared once it has. */
  draft: string;
  clearDraft: () => void;

  send: (query: string) => Promise<void>;
  attachFile: (file: File) => void;
  clearFile: () => void;

  /** Persists a `cards`-bearing message's flashcards as a real deck the
   *  student can review — the chat's own generation was, until now, always
   *  throwaway: the only way to keep a conversational "generate flashcards"
   *  reply was to notice, then redo the whole thing through Create. */
  saveCards: (messageId: string) => Promise<void>;

  /** The review view registers whichever card is on screen, so a
   *  `<GRADE_FLASHCARD>` tag executed from anywhere (the panel, the review
   *  screen's own "AI grade" box) can score it. `null` unregisters — a chat
   *  reply that arrives after the student has left the review view grades
   *  nothing, matching the vanilla's "click target missing" behaviour. */
  registerFlashcardGrader: (grader: ((score: number) => void) | null) => void;
}

export const ChatContext = createContext<ChatApi | null>(null);

export function useChat(): ChatApi {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside <ChatProvider>");
  return ctx;
}

export function useOptionalChat(): ChatApi | null {
  return useContext(ChatContext);
}
