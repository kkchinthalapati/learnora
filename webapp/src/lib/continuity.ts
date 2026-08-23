/**
 * Cross-Device Study Continuity Module
 *
 * Captures, persists, and synchronizes learning session snapshots across tabs
 * and devices, enabling seamless 1-click resumption of notes, flashcards,
 * quizzes, and focus goals.
 */

export const CONTINUITY_STORAGE_KEY = "learnora:study_continuity_snapshot";
export const CONTINUITY_CHANGE_EVENT = "learnora:continuity_changed";

export interface LastOpenedMaterial {
  id: string;
  title: string;
  folderId?: string | null;
  scrollPercentage: number;
  lastVisitedAt: string;
}

export interface LastReviewedDeck {
  id: string;
  title: string;
  cardIndex: number;
  totalCards: number;
  lastReviewedAt: string;
}

export interface LastQuizDraft {
  id: string;
  title: string;
  questionIndex: number;
  totalQuestions: number;
  lastAttemptedAt: string;
}

export interface LastFocusGoal {
  task: string;
  folderId?: string | null;
  minutesRemaining: number;
  lastActiveAt?: string;
}

export interface StudySnapshot {
  lastOpenedMaterial?: LastOpenedMaterial | null;
  lastReviewedDeck?: LastReviewedDeck | null;
  lastQuizDraft?: LastQuizDraft | null;
  lastFocusGoal?: LastFocusGoal | null;
  updatedAt?: string;
}

export interface ResumeAction {
  type: "material" | "deck" | "quiz" | "focus";
  title: string;
  subtitle: string;
  targetUrl: string;
  progressPercentage: number;
  timestamp: string;
  badgeLabel: string;
  iconName: "notes" | "flashcards" | "quizzes" | "timer";
}

const EMPTY_SNAPSHOT: StudySnapshot = Object.freeze({});
const listeners = new Set<() => void>();
let cachedSnapshot: StudySnapshot = EMPTY_SNAPSHOT;
let cachedRaw: string | null = null;

function safeParseSnapshot(raw: string | null): StudySnapshot {
  if (!raw) return EMPTY_SNAPSHOT;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    // Ignore corrupt local storage values safely
  }
  return EMPTY_SNAPSHOT;
}

function notifyContinuityChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CONTINUITY_CHANGE_EVENT));
  }
  listeners.forEach((fn) => fn());
}

/**
 * Retrieves the current persisted study continuity snapshot.
 * Guarantees reference stability for useSyncExternalStore.
 */
export function getStudySnapshot(): StudySnapshot {
  if (typeof window === "undefined" || !window.localStorage) {
    return EMPTY_SNAPSHOT;
  }
  try {
    const raw = window.localStorage.getItem(CONTINUITY_STORAGE_KEY);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedSnapshot = safeParseSnapshot(raw);
    }
    return cachedSnapshot;
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

/**
 * Merges and saves partial updates to the learning snapshot with multi-tab event propagation.
 */
export function saveStudySnapshot(patch: Partial<StudySnapshot>): StudySnapshot {
  const current = getStudySnapshot();
  const merged: StudySnapshot = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const serialized = JSON.stringify(merged);
      window.localStorage.setItem(CONTINUITY_STORAGE_KEY, serialized);
      cachedRaw = serialized;
      cachedSnapshot = merged;
    } catch (err) {
      console.error("[continuity] Failed to persist snapshot to localStorage:", err);
    }
  }

  notifyContinuityChanged();
  return merged;
}

/**
 * Convenience helper to record opening a study material / note.
 */
export function recordMaterialVisit(material: {
  id: string;
  title: string;
  folderId?: string | null;
  scrollPercentage?: number;
}): StudySnapshot {
  return saveStudySnapshot({
    lastOpenedMaterial: {
      id: material.id,
      title: material.title,
      folderId: material.folderId ?? null,
      scrollPercentage: Math.max(0, Math.min(100, Math.round(material.scrollPercentage ?? 0))),
      lastVisitedAt: new Date().toISOString(),
    },
  });
}

/**
 * Convenience helper to record reviewing flashcards in a deck.
 */
export function recordDeckReview(deck: {
  id: string;
  title: string;
  cardIndex: number;
  totalCards: number;
}): StudySnapshot {
  return saveStudySnapshot({
    lastReviewedDeck: {
      id: deck.id,
      title: deck.title,
      cardIndex: Math.max(0, deck.cardIndex),
      totalCards: Math.max(1, deck.totalCards),
      lastReviewedAt: new Date().toISOString(),
    },
  });
}

/**
 * Convenience helper to record quiz draft progress.
 */
export function recordQuizProgress(quiz: {
  id: string;
  title: string;
  questionIndex: number;
  totalQuestions: number;
}): StudySnapshot {
  return saveStudySnapshot({
    lastQuizDraft: {
      id: quiz.id,
      title: quiz.title,
      questionIndex: Math.max(0, quiz.questionIndex),
      totalQuestions: Math.max(1, quiz.totalQuestions),
      lastAttemptedAt: new Date().toISOString(),
    },
  });
}

/**
 * Convenience helper to record an active focus goal.
 */
export function recordFocusGoal(goal: {
  task: string;
  folderId?: string | null;
  minutesRemaining: number;
}): StudySnapshot {
  return saveStudySnapshot({
    lastFocusGoal: {
      task: goal.task,
      folderId: goal.folderId ?? null,
      minutesRemaining: Math.max(0, goal.minutesRemaining),
      lastActiveAt: new Date().toISOString(),
    },
  });
}

/**
 * Clears the study snapshot from storage.
 */
export function clearStudySnapshot(): void {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.removeItem(CONTINUITY_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
  cachedRaw = null;
  cachedSnapshot = EMPTY_SNAPSHOT;
  notifyContinuityChanged();
}

/**
 * Subscribes to continuity state changes across local mutations and multi-tab storage events.
 */
export function subscribeContinuity(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);

  const handleStorage = (event: StorageEvent) => {
    if (event.key === CONTINUITY_STORAGE_KEY || event.key === null) {
      cachedRaw = event.newValue;
      cachedSnapshot = safeParseSnapshot(event.newValue);
      onStoreChange();
    }
  };

  const handleLocalChange = () => {
    onStoreChange();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", handleStorage);
    window.addEventListener(CONTINUITY_CHANGE_EVENT, handleLocalChange);
  }

  return () => {
    listeners.delete(onStoreChange);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(CONTINUITY_CHANGE_EVENT, handleLocalChange);
    }
  };
}

/**
 * Computes the primary resume action from the current learning snapshot,
 * selecting the most recent active study context.
 */
export function getResumeAction(snapshot: StudySnapshot): ResumeAction | null {
  const candidates: {
    action: ResumeAction;
    time: number;
  }[] = [];

  // 1. Last Opened Material
  if (snapshot.lastOpenedMaterial) {
    const m = snapshot.lastOpenedMaterial;
    const progress = Math.max(0, Math.min(100, Math.round(m.scrollPercentage)));
    candidates.push({
      time: new Date(m.lastVisitedAt || 0).getTime(),
      action: {
        type: "material",
        title: m.title || "Untitled Document",
        subtitle: progress > 0 ? `Notes • ${progress}% read` : "Notes • Just opened",
        targetUrl: `/notes/${m.id}`,
        progressPercentage: progress,
        timestamp: m.lastVisitedAt,
        badgeLabel: "Reading",
        iconName: "notes",
      },
    });
  }

  // 2. Last Reviewed Deck
  if (snapshot.lastReviewedDeck) {
    const d = snapshot.lastReviewedDeck;
    const progress = Math.round(
      (Math.min(d.cardIndex + 1, d.totalCards) / Math.max(1, d.totalCards)) * 100,
    );
    candidates.push({
      time: new Date(d.lastReviewedAt || 0).getTime(),
      action: {
        type: "deck",
        title: d.title || "Flashcards Deck",
        subtitle: `Flashcards • Card ${d.cardIndex + 1} of ${d.totalCards}`,
        targetUrl: `/review/${d.id}`,
        progressPercentage: progress,
        timestamp: d.lastReviewedAt,
        badgeLabel: "Reviewing",
        iconName: "flashcards",
      },
    });
  }

  // 3. Last Quiz Draft
  if (snapshot.lastQuizDraft) {
    const q = snapshot.lastQuizDraft;
    const progress = Math.round(
      (Math.min(q.questionIndex + 1, q.totalQuestions) / Math.max(1, q.totalQuestions)) * 100,
    );
    candidates.push({
      time: new Date(q.lastAttemptedAt || 0).getTime(),
      action: {
        type: "quiz",
        title: q.title || "Quiz",
        subtitle: `Quiz • Question ${q.questionIndex + 1} of ${q.totalQuestions}`,
        targetUrl: `/quiz/${q.id}`,
        progressPercentage: progress,
        timestamp: q.lastAttemptedAt,
        badgeLabel: "In Progress",
        iconName: "quizzes",
      },
    });
  }

  // 4. Last Focus Goal
  if (snapshot.lastFocusGoal && snapshot.lastFocusGoal.minutesRemaining > 0) {
    const f = snapshot.lastFocusGoal;
    candidates.push({
      time: new Date(f.lastActiveAt || snapshot.updatedAt || 0).getTime(),
      action: {
        type: "focus",
        title: f.task || "Focus Session",
        subtitle: `Focus Goal • ${f.minutesRemaining}m remaining`,
        targetUrl: "/timer",
        progressPercentage: 50,
        timestamp: f.lastActiveAt || snapshot.updatedAt || new Date().toISOString(),
        badgeLabel: "Focusing",
        iconName: "timer",
      },
    });
  }

  if (candidates.length === 0) {
    return null;
  }

  // Pick the most recent activity
  candidates.sort((a, b) => b.time - a.time);
  return candidates[0].action;
}

/**
 * Returns all active continuity items sorted by recency for quick access trays.
 */
export function getRecentContinuityItems(snapshot: StudySnapshot): ResumeAction[] {
  const items: { action: ResumeAction; time: number }[] = [];

  if (snapshot.lastOpenedMaterial) {
    const m = snapshot.lastOpenedMaterial;
    const progress = Math.max(0, Math.min(100, Math.round(m.scrollPercentage)));
    items.push({
      time: new Date(m.lastVisitedAt || 0).getTime(),
      action: {
        type: "material",
        title: m.title || "Untitled Document",
        subtitle: `Notes • ${progress}% read`,
        targetUrl: `/notes/${m.id}`,
        progressPercentage: progress,
        timestamp: m.lastVisitedAt,
        badgeLabel: "Notes",
        iconName: "notes",
      },
    });
  }

  if (snapshot.lastReviewedDeck) {
    const d = snapshot.lastReviewedDeck;
    const progress = Math.round(
      (Math.min(d.cardIndex + 1, d.totalCards) / Math.max(1, d.totalCards)) * 100,
    );
    items.push({
      time: new Date(d.lastReviewedAt || 0).getTime(),
      action: {
        type: "deck",
        title: d.title || "Flashcards Deck",
        subtitle: `Flashcards • Card ${d.cardIndex + 1}/${d.totalCards}`,
        targetUrl: `/review/${d.id}`,
        progressPercentage: progress,
        timestamp: d.lastReviewedAt,
        badgeLabel: "Deck",
        iconName: "flashcards",
      },
    });
  }

  if (snapshot.lastQuizDraft) {
    const q = snapshot.lastQuizDraft;
    const progress = Math.round(
      (Math.min(q.questionIndex + 1, q.totalQuestions) / Math.max(1, q.totalQuestions)) * 100,
    );
    items.push({
      time: new Date(q.lastAttemptedAt || 0).getTime(),
      action: {
        type: "quiz",
        title: q.title || "Quiz",
        subtitle: `Quiz • Q${q.questionIndex + 1}/${q.totalQuestions}`,
        targetUrl: `/quiz/${q.id}`,
        progressPercentage: progress,
        timestamp: q.lastAttemptedAt,
        badgeLabel: "Quiz",
        iconName: "quizzes",
      },
    });
  }

  if (snapshot.lastFocusGoal && snapshot.lastFocusGoal.minutesRemaining > 0) {
    const f = snapshot.lastFocusGoal;
    items.push({
      time: new Date(f.lastActiveAt || snapshot.updatedAt || 0).getTime(),
      action: {
        type: "focus",
        title: f.task || "Focus Session",
        subtitle: `Timer • ${f.minutesRemaining}m left`,
        targetUrl: "/timer",
        progressPercentage: 50,
        timestamp: f.lastActiveAt || snapshot.updatedAt || new Date().toISOString(),
        badgeLabel: "Timer",
        iconName: "timer",
      },
    });
  }

  items.sort((a, b) => b.time - a.time);
  return items.map((i) => i.action);
}
