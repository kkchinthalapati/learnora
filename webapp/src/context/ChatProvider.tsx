import { useCallback, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import {
  AiError,
  callEdge,
  trimHistory,
  type ChatMessage as HistoryMessage,
} from "../api/ai";
import {
  generateWeeklyPlan,
  loadWorkspaceContext,
  PlanShapeError,
} from "../api/aiPlan";
import { generateQuizFromTopic, QuizShapeError } from "../api/aiQuiz";
import { decksApi } from "../api/decks";
import { examsApi } from "../api/exams";
import { flashcardsApi } from "../api/flashcards";
import { notesApi } from "../api/notes";
import { generateDeckFromTopic, DeckShapeError } from "../api/studyPackage";
import { tasksApi } from "../api/tasks";
import { decksKeys } from "../hooks/useDecks";
import { examsKeys } from "../hooks/useExams";
import { flashcardsKeys } from "../hooks/useFlashcards";
import { plansKeys } from "../hooks/usePlans";
import { quizzesKeys } from "../hooks/useQuizzes";
import { tasksKeys } from "../hooks/useTasks";
import { formatMonthDay } from "../lib/date";
import {
  executeActions,
  pathForNavigateTarget,
  type ActionHandlers,
} from "../lib/chatActions";
import { stripActionTagBlocks, fenceUntrusted } from "../lib/actionTags";
import { activeContextForPath, buildSystemContext } from "../lib/chatPrompt";
import { decodeBase64UTF8, extractFlashcardJSON } from "../lib/aiJson";
import { THEME_PRESETS, type Mode } from "../lib/appearance";
import { useAppearance } from "./appearance";
import { useDialog } from "./dialog";
import { useSettings } from "./settings";
import { useTimer } from "./timer";
import { useToast } from "./toast";
import {
  ChatContext,
  type AttachedFile,
  type ChatApi,
  type ChatMessage,
  type ReplyPart,
} from "./chat";

/* Drives `AI.send` (js/ai.js:900-1275) — the workspace chat.
 *
 * Lives above the router (but inside it, so it can navigate) because the
 * panel is app-wide: the dashboard command bar pushes into the same
 * conversation the panel shows, exactly as the vanilla's one `#turbo-chat`
 * did for every entry point.
 *
 * The reply is rendered as soon as it lands, with its action tags stripped,
 * and only then are the actions executed — so a student reads the answer
 * while the confirmation for "create this task?" is up, which is the order the
 * vanilla's `onChunk` established. */

const MAX_FILE_BYTES = 10 * 1024 * 1024;

let idSeed = 0;
const nextId = () => `msg-${Date.now()}-${idSeed++}`;

/* The vanilla's flashcard-reply guard (js/ai.js:1303-1316): a conversational
   answer that happens to quote a couple of cards must not be treated as a
   deck, or the reply disappears behind a card list. */
function detectFlashcardReply(text: string) {
  const cards = extractFlashcardJSON(text);
  if (cards.length === 0) return null;
  const trimmed = text.trim();
  const conversational =
    trimmed.length > 0 &&
    !trimmed.startsWith("[") &&
    !trimmed.startsWith("```");
  if (conversational && cards.length < 3) return null;
  return cards;
}

/** Resolves a `COMPLETE_TASK`/`DELETE_TASK`/`RESCHEDULE_TASK`/`DELETE_EXAM`
 *  tag's name against a freshly-fetched list. The model only ever sees names
 *  in WORKSPACE STATE, never a stable id, so an exact case-insensitive match
 *  is the only handle chat has on an existing row — same reasoning as the
 *  grounding rules' "only reference tasks and exams you can see". */
function findByName<T>(
  items: T[],
  name: string,
  getName: (item: T) => string,
): T | undefined {
  const target = name.trim().toLowerCase();
  return items.find((item) => getName(item).trim().toLowerCase() === target);
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  /* Read by saveCards, which needs the current message's cards but must not
     itself change identity on every new message the way depending on
     `messages` directly would — send() doesn't take that dependency either,
     for the same reason (see pathnameRef below for the established pattern). */
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [file, setFile] = useState<AttachedFile | null>(null);
  const [draft, setDraft] = useState("");

  /* The model-facing transcript, kept apart from the rendered messages: it
     holds the *clean* text (tags stripped) the vanilla pushed to
     `AI.chatHistory`, not the widgets or the injected system context. */
  const historyRef = useRef<HistoryMessage[]>([]);

  /* Whichever flashcard is currently on screen in the review view, if any.
     A ref rather than state: registering it must never itself trigger a
     chat re-render, and `<GRADE_FLASHCARD>` only ever needs the latest
     value at the moment a reply executes it. */
  const flashcardGraderRef = useRef<((score: number) => void) | null>(null);
  const registerFlashcardGrader = useCallback(
    (grader: ((score: number) => void) | null) => {
      flashcardGraderRef.current = grader;
    },
    [],
  );

  const { confirm } = useDialog();
  const { showToast } = useToast();
  const { settings } = useSettings();
  const { startPreset } = useTimer();
  const { setAppearance, save: saveAppearance } = useAppearance();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    setIsFullscreen(false);
  }, []);
  const toggleFullscreen = useCallback(() => setIsFullscreen((v) => !v), []);
  const clearDraft = useCallback(() => setDraft(""), []);
  const compose = useCallback((text: string) => {
    setIsOpen(true);
    setDraft(text);
  }, []);

  const clearFile = useCallback(() => setFile(null), []);

  const attachFile = useCallback(
    (picked: File) => {
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
    },
    [showToast],
  );

  /* --- action handlers ------------------------------------------------- */

  const setTheme = useCallback(
    (value: string): boolean => {
      /* The vanilla looked for `.theme-preset-btn[data-theme="dark"]`, which
         does not exist — the presets are named `default`, `lavender`, … — so
         "switch to dark mode" silently applied the *default accent* instead
         and then reported success. Light/dark are the appearance `mode` here,
         and a preset name sets the accent, which is what the student asked
         for in each case. */
      if (value === "dark" || value === "light" || value === "system") {
        setAppearance({ mode: value as Mode });
        saveAppearance();
        return true;
      }
      if (THEME_PRESETS.some((p) => p.id === value)) {
        setAppearance({ accent: value });
        saveAppearance();
        return true;
      }
      return false;
    },
    [setAppearance, saveAppearance],
  );

  const handlers = useMemo<ActionHandlers>(
    () => ({
      confirm,
      addTask: async (text, dueDate) => {
        await tasksApi.add(text, dueDate ?? null);
        /* Invalidated through the client rather than a mutation hook: the
           chat can be closed (unmounting an observer) between the confirm and
           the write landing, and the task list must still refresh. */
        await qc.invalidateQueries({ queryKey: tasksKeys.all });
      },
      completeTask: async (name) => {
        const tasks = await tasksApi.fetch();
        const match = findByName(tasks, name, (t) => t.text);
        if (!match) return false;
        // Idempotent: a task already done stays done rather than being
        // toggled back to pending by a second "mark it done" request.
        if (!match.is_done) await tasksApi.toggle(match.id, false);
        await qc.invalidateQueries({ queryKey: tasksKeys.all });
        return true;
      },
      deleteTask: async (name) => {
        const tasks = await tasksApi.fetch();
        const match = findByName(tasks, name, (t) => t.text);
        if (!match) return false;
        await tasksApi.delete(match.id);
        await qc.invalidateQueries({ queryKey: tasksKeys.all });
        return true;
      },
      rescheduleTask: async (name, dueDate) => {
        const tasks = await tasksApi.fetch();
        const match = findByName(tasks, name, (t) => t.text);
        if (!match) return false;
        await tasksApi.updateDueDate(match.id, dueDate);
        await qc.invalidateQueries({ queryKey: tasksKeys.all });
        return true;
      },
      addExam: async (name, date, difficulty) => {
        await examsApi.save({
          exam_name: name,
          exam_date: date,
          difficulty,
          status: "Scheduled",
        });
        await qc.invalidateQueries({ queryKey: examsKeys.all });
      },
      deleteExam: async (name) => {
        const exams = await examsApi.fetch();
        const match = findByName(exams, name, (e) => e.exam_name);
        if (!match) return false;
        await examsApi.delete(match.id);
        await qc.invalidateQueries({ queryKey: examsKeys.all });
        return true;
      },
      startTimer: (minutes) => {
        startPreset({ countdown: minutes }, "countdown");
        void navigate("/timer");
      },
      setTheme,
      navigate: (view) => {
        const path = pathForNavigateTarget(view);
        if (!path) return false;
        void navigate(path);
        return true;
      },
      generateQuiz: (topic) => {
        generateQuizFromTopic(topic, settings)
          .then((quiz) => {
            qc.invalidateQueries({ queryKey: quizzesKeys.all });
            showToast("Quiz generated successfully!");
            void navigate(`/quiz/${quiz.id}`);
          })
          .catch((err: unknown) => {
            const message =
              err instanceof QuizShapeError ||
              (err instanceof AiError && err.refused)
                ? err.message
                : "Failed to generate quiz. Please try again.";
            showToast(message, { error: true });
          });
      },
      generateDeck: (topic) => {
        generateDeckFromTopic(topic, settings)
          .then(() => {
            qc.invalidateQueries({ queryKey: decksKeys.all });
            showToast("Flashcard deck generated successfully!");
            void navigate("/library/flashcards");
          })
          .catch((err: unknown) => {
            const message =
              err instanceof DeckShapeError ||
              (err instanceof AiError && err.refused)
                ? err.message
                : "Failed to generate flashcards. Please try again.";
            showToast(message, { error: true });
          });
      },
      generatePlan: () => {
        generateWeeklyPlan(settings)
          .then((plan) => {
            qc.setQueryData(plansKeys.forWeek(plan.week_start), plan);
            showToast("Plan generated successfully!");
            void navigate("/plan");
          })
          .catch((err: unknown) => {
            const message =
              err instanceof PlanShapeError ||
              (err instanceof AiError && err.refused)
                ? err.message
                : "Failed to generate your weekly plan. Please try again.";
            showToast(message, { error: true });
          });
      },
      gradeFlashcard: (score) => {
        flashcardGraderRef.current?.(score);
      },
    }),
    [confirm, navigate, qc, setTheme, settings, showToast, startPreset],
  );

  /* --- send ------------------------------------------------------------ */

  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

  const send = useCallback(
    async (query: string) => {
      const attached = file;
      const userMessage: ChatMessage = {
        id: nextId(),
        role: "user",
        text: query,
        fileName: attached?.name,
      };
      const pendingId = nextId();
      setMessages((prev) => [
        ...prev,
        userMessage,
        { id: pendingId, role: "ai", text: "", pending: true },
      ]);
      setIsSending(true);
      /* Cleared on send, like the vanilla's `finally { this.setFile(null) }` —
         an attachment belongs to the message it was sent with. */
      setFile(null);

      const finish = (patch: Partial<ChatMessage>) =>
        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingId ? { ...m, pending: false, ...patch } : m,
          ),
        );

      try {
        /* Workspace context is best-effort: the chat still works when the
           tables can't be read, it just knows less (js/ai.js:911-929). */
        let pendingTasks = "None";
        let upcomingExams = "None";
        try {
          const ctx = await loadWorkspaceContext();
          pendingTasks = ctx.pendingTasks;
          upcomingExams = ctx.upcomingExams;
        } catch (err) {
          console.warn("[chat] Failed to fetch workspace context:", err);
        }

        const pathname = pathnameRef.current;
        let notesMarkdown: string | null = null;
        const notesMatch = /^\/notes\/([^/]+)/.exec(pathname);
        if (notesMatch) {
          try {
            const notes = await notesApi.fetchByMaterial(notesMatch[1]);
            notesMarkdown = notes[0]?.markdown_content ?? null;
          } catch {
            /* No notes context is a smaller loss than no reply. */
          }
        }

        /* A plain-text attachment is inlined into the prompt rather than sent
           as a binary part — the vanilla did the same, and it is why the file
           body is fenced: an uploaded .txt is attacker-influenced input. */
        let filePayload = attached;
        let appendedFileContext = "";
        if (attached && attached.mimeType === "text/plain") {
          try {
            const decoded = fenceUntrusted(decodeBase64UTF8(attached.data));
            appendedFileContext = `\n\nThe student attached a text file "${attached.name}" with the following content:\n"""\n${decoded}\n"""`;
            filePayload = null;
          } catch (err) {
            console.error("[chat] Failed to decode text attachment:", err);
          }
        }

        const systemContext = buildSystemContext({
          pendingTasks,
          upcomingExams,
          activeContext: activeContextForPath(pathname, notesMarkdown),
          appendedFileContext,
          query,
        });

        const priorHistory = trimHistory(historyRef.current);
        const { text } = await callEdge({
          history: [...priorHistory, { role: "user", content: systemContext }],
          file: filePayload,
          settings,
        });

        /* Show the answer before asking about its actions — the student reads
           it while the confirmation is up. */
        finish({ text: stripActionTagBlocks(text).trim() });

        const cards = detectFlashcardReply(text);
        if (cards) {
          historyRef.current = [
            ...historyRef.current,
            { role: "user", content: query },
            {
              role: "model",
              content: "[Generated a set of flashcards for the student]",
            },
          ];
          finish({ text: "", cards });
          return;
        }

        const parts: ReplyPart[] = await executeActions(text, handlers);
        const cleanText = stripActionTagBlocks(text).trim();

        historyRef.current = [
          ...historyRef.current,
          { role: "user", content: query },
          { role: "model", content: cleanText },
        ];

        finish({
          text: cleanText,
          parts: parts.some((p) => p.kind === "widget") ? parts : undefined,
        });
      } catch (err) {
        /* The failed exchange is not written to history: replaying it would
           make the model answer a question the student never saw answered. */
        finish({
          error: true,
          text:
            err instanceof Error
              ? err.message
              : "Something went wrong. Please try again.",
        });
      } finally {
        setIsSending(false);
      }
    },
    [file, handlers, settings],
  );

  const saveCards = useCallback(
    async (messageId: string) => {
      const message = messagesRef.current.find((m) => m.id === messageId);
      if (!message?.cards?.length || message.savedDeckId) return;

      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, savingCards: true } : m)),
      );

      try {
        // Filed nowhere — same as a Create pipeline "Topic" source — since a
        // chat reply has no folder of its own to suggest.
        const deck = await decksApi.add(
          null,
          `Chat Flashcards — ${formatMonthDay(new Date())}`,
        );
        await flashcardsApi.addBatch(deck.id, message.cards);
        await Promise.all([
          qc.invalidateQueries({ queryKey: decksKeys.all }),
          qc.invalidateQueries({ queryKey: flashcardsKeys.dueCount }),
        ]);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, savingCards: false, savedDeckId: deck.id }
              : m,
          ),
        );
        showToast("Saved to your flashcard library.");
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, savingCards: false } : m,
          ),
        );
        showToast(
          err instanceof Error ? err.message : "Failed to save flashcards.",
          { error: true },
        );
      }
    },
    [qc, showToast],
  );

  const value = useMemo<ChatApi>(
    () => ({
      messages,
      isOpen,
      isFullscreen,
      isSending,
      file,
      draft,
      open,
      close,
      toggleFullscreen,
      compose,
      clearDraft,
      send,
      attachFile,
      clearFile,
      saveCards,
      registerFlashcardGrader,
    }),
    [
      messages,
      isOpen,
      isFullscreen,
      isSending,
      file,
      draft,
      open,
      close,
      toggleFullscreen,
      compose,
      clearDraft,
      send,
      attachFile,
      clearFile,
      saveCards,
      registerFlashcardGrader,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
