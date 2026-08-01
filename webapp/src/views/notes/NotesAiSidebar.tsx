import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { ChatMessageBubble } from "../../components/chat/ChatMessage";
import { useCreateModal } from "../../context/createModal";
import { useSettings } from "../../context/settings";
import { useToast } from "../../context/toast";
import {
  AiError,
  callEdge,
  trimHistory,
  type ChatMessage as HistoryMessage,
  type FilePayload,
} from "../../api/ai";
import { stripActionTagBlocks, fenceUntrusted } from "../../lib/actionTags";
import { decodeBase64UTF8 } from "../../lib/aiJson";
import {
  buildNotesSystemContext,
  prepareDocumentContext,
} from "../../lib/notesChatPrompt";
import type { ChatMessage } from "../../context/chat";
import type { IconName } from "../../components/icons";
import chatStyles from "../../components/chat/chat.module.css";
import styles from "./notesSidebar.module.css";

/* The AI study sidebar docked beside the notes editor — ports the vanilla's
 * `.notes-ai-panel` (index.html:1084-1155), its wiring in js/main.js's
 * `bindNotesEditor`/`bindNotesQuickActions`/`bindNotesSuggestions`
 * (:2522-2628), and `AI.sendNotesChat` (js/ai.js:1388-1512).
 *
 * This is not the workspace Turbo chat with a different prompt. It keeps its
 * own conversation, and it executes no action tags: the vanilla panel's own
 * system context tells the model it "cannot run app actions", and the two
 * quick-action cards above the chat are how a quiz or a deck actually gets
 * made. Tags are still *stripped* from what is displayed, because a model that
 * emits one anyway must not have the raw markup rendered at the student.
 *
 * One deliberate divergence: the vanilla pushed this panel's turns onto
 * `AI.chatHistory` — the same array the workspace chat uses — so a question
 * asked here silently became context for the floating panel on another view,
 * and vice versa. Here the transcript is local to the mounted sidebar, and
 * `NotesView` keys it on the material, so switching documents starts a fresh
 * conversation about the document actually on screen. */

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const SUGGESTIONS = [
  {
    label: "Explain the key ideas",
    prompt: "Explain the key ideas in this document in plain language.",
  },
  {
    label: "Make a revision sheet",
    prompt: "Summarise this document into a short revision sheet.",
  },
  {
    label: "Test me on it",
    prompt:
      "Ask me three questions about this document, one at a time, and wait for my answer before giving the next.",
  },
] as const;

let idSeed = 0;
const nextId = () => `notes-msg-${Date.now()}-${idSeed++}`;

interface QuickActionProps {
  icon: IconName;
  title: string;
  description: string;
  badge?: string;
  soon?: boolean;
  onActivate: () => void;
}

function QuickActionCard({
  icon,
  title,
  description,
  badge,
  soon,
  onActivate,
}: QuickActionProps) {
  /* A real <button>, where the vanilla used a role="button" div that had to
     hand-wire Enter and Space (js/main.js:2573-2581). */
  return (
    <button
      type="button"
      className={`${styles.card}${soon ? ` ${styles.cardSoon}` : ""}`}
      onClick={onActivate}
    >
      <span className={styles.cardIcon}>
        <Icon name={icon} size={20} />
      </span>
      <span className={styles.cardBody}>
        <span className={styles.cardHead}>
          <strong>{title}</strong>
          {badge ? <span className={styles.badge}>{badge}</span> : null}
        </span>
        <span className={styles.cardDesc}>{description}</span>
      </span>
    </button>
  );
}

interface NotesAiSidebarProps {
  materialId: string;
  /** The open material's folder, carried into the Create dialog the quick
   *  actions open so a generated deck/quiz files itself alongside its source. */
  folderId: string | null;
  /** Reads the editor's current plain text at send time — not a snapshot, so
   *  the model sees what the student is looking at now, including unsaved
   *  edits (the vanilla read `Editor.getPlainText()` the same way). */
  getDocumentText: () => string;
}

export function NotesAiSidebar({
  materialId,
  folderId,
  getDocumentText,
}: NotesAiSidebarProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [file, setFile] = useState<FilePayload | null>(null);
  const [input, setInput] = useState("");

  /* The model-facing transcript: clean text only (tags stripped, the injected
     system context left out), like ChatProvider's own `historyRef`. */
  const historyRef = useRef<HistoryMessage[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { openCreateModal } = useCreateModal();
  const { settings } = useSettings();
  const { showToast } = useToast();

  const getDocumentTextRef = useRef(getDocumentText);
  getDocumentTextRef.current = getDocumentText;

  useEffect(() => {
    const feed = feedRef.current;
    if (feed) feed.scrollTop = feed.scrollHeight;
  }, [messages]);

  const send = useCallback(
    async (query: string) => {
      const attached = file;
      const pendingId = nextId();
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "user",
          text: query,
          fileName: attached?.name,
        },
        { id: pendingId, role: "ai", text: "", pending: true },
      ]);
      setIsSending(true);
      /* An attachment belongs to the message it was sent with — the vanilla
         cleared `this.notesFile` in its own `finally`. */
      setFile(null);

      const finish = (patch: Partial<ChatMessage>) =>
        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingId ? { ...m, pending: false, ...patch } : m,
          ),
        );

      try {
        const documentContext = prepareDocumentContext(
          getDocumentTextRef.current(),
        );

        /* A plain-text attachment is inlined into the prompt rather than sent
           as a binary part, and fenced on the way in: an uploaded .txt is
           attacker-influenced input (js/ai.js:1416-1424). */
        let filePayload = attached;
        let appendedFileContext = "";
        if (attached && attached.mimeType === "text/plain") {
          try {
            const decoded = fenceUntrusted(decodeBase64UTF8(attached.data));
            appendedFileContext = `\n\nThe student attached a text file "${attached.name}" with the following content:\n"""\n${decoded}\n"""`;
            filePayload = null;
          } catch (err) {
            console.error(
              "[notes-chat] Failed to decode text attachment:",
              err,
            );
          }
        }

        const systemContext = buildNotesSystemContext({
          documentContext,
          appendedFileContext,
          query,
        });

        const { text } = await callEdge({
          history: [
            ...trimHistory(historyRef.current),
            { role: "user", content: systemContext },
          ],
          file: filePayload,
          settings,
        });

        const cleanText = stripActionTagBlocks(text).trim();
        historyRef.current = [
          ...historyRef.current,
          { role: "user", content: query },
          { role: "model", content: cleanText },
        ];
        finish({ text: cleanText });
      } catch (err) {
        /* The failed exchange is not written to history — replaying it would
           have the model answer a question the student never saw answered. */
        finish({
          error: true,
          text:
            err instanceof AiError || err instanceof Error
              ? err.message
              : "Something went wrong. Please try again.",
        });
      } finally {
        setIsSending(false);
      }
    },
    [file, settings],
  );

  const submit = (text: string) => {
    if (isSending) return;
    const value = text.trim();
    if (!value && !file) return;
    setInput("");
    void send(value || "Analyze this document.");
  };

  const attachFile = (picked: File) => {
    if (picked.size > MAX_FILE_BYTES) {
      showToast("File too large. Maximum size is 10MB.", { error: true });
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => showToast("Failed to read file.", { error: true });
    reader.onload = (e) => {
      const result = String(e.target?.result ?? "");
      setFile({
        name: picked.name,
        mimeType: picked.type,
        data: result.split(",")[1] ?? "",
      });
    };
    reader.readAsDataURL(picked);
  };

  /* Both cards open the same Create dialog, scoped to the document on screen
     with the matching output pre-ticked — the vanilla's own consolidation
     (js/main.js:2589-2612), which replaced a four-field quiz modal and a
     no-options-at-all flashcard generation with one dialog. */
  const openCreateForDocument = (
    outputs: { flashcards: boolean; quiz: boolean },
    title: string,
  ) => {
    openCreateModal({ type: "material", materialId, folderId, outputs, title });
  };

  return (
    <aside className={styles.panel} aria-label="Study assistant">
      <div className={styles.cards}>
        <QuickActionCard
          icon="help-circle"
          title="Quiz me"
          description="Check what stuck"
          badge="Popular"
          onActivate={() =>
            openCreateForDocument(
              { flashcards: false, quiz: true },
              "Quiz on this document",
            )
          }
        />
        <QuickActionCard
          icon="layers"
          title="Flashcards"
          description="Active recall drill"
          onActivate={() =>
            openCreateForDocument(
              { flashcards: true, quiz: false },
              "Flashcards from this document",
            )
          }
        />
        <QuickActionCard
          icon="mic"
          title="Podcast"
          description="Listen & learn — soon"
          soon
          onActivate={() => showToast("Podcast generation coming soon")}
        />
      </div>

      <div className={styles.chat}>
        <div className={styles.intro}>
          <span className={styles.avatar}>
            <Icon name="bot" size={20} />
          </span>
          <div>
            <h3 className={styles.greeting}>Study with me</h3>
            <p className={styles.subtext}>
              I&apos;m reading this document alongside you — ask me anything
              about it.
            </p>
          </div>
        </div>

        <div className={styles.suggestions}>
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion.label}
              type="button"
              className={styles.suggestion}
              disabled={isSending}
              onClick={() => submit(suggestion.prompt)}
            >
              {suggestion.label}
            </button>
          ))}
        </div>

        <div
          className={styles.feed}
          ref={feedRef}
          role="log"
          aria-live="polite"
          aria-label="Conversation about this document"
        >
          {messages.map((message) => (
            <ChatMessageBubble key={message.id} message={message} />
          ))}
        </div>

        {file ? (
          <div className={chatStyles.filePill}>
            <span>{file.name}</span>
            <button
              type="button"
              className={chatStyles.removeFile}
              aria-label={`Remove ${file.name}`}
              onClick={() => setFile(null)}
            >
              ✖
            </button>
          </div>
        ) : null}

        <form
          className={styles.dock}
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
        >
          <label className={styles.iconBtn}>
            <Icon name="paperclip" size={20} label="Attach a file" />
            <input
              type="file"
              hidden
              accept=".pdf,.doc,.docx,.txt,.mp3,.mp4,.wav,.m4a,.aac,.ogg"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) attachFile(picked);
                /* Reset so re-picking the same file fires `change` again. */
                e.target.value = "";
              }}
            />
          </label>
          <textarea
            ref={inputRef}
            className={styles.input}
            rows={1}
            value={input}
            /* Shortened from the vanilla's "Ask Learnora AI about your
               notes..." — in a single-row textarea at this column's width
               that wrapped to a second line the box has no room for, so it
               rendered as a clipped half-line of text. */
            placeholder="Ask about your notes…"
            aria-label="Ask about this document"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              /* Enter sends, Shift+Enter breaks the line — the vanilla's
                 keydown handler (js/main.js:2534-2539). */
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
          />
          <button
            type="submit"
            className={styles.sendBtn}
            aria-label="Send"
            disabled={isSending}
          >
            <Icon name="send" size={18} />
          </button>
        </form>
      </div>
    </aside>
  );
}
