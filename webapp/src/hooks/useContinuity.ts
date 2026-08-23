import { useSyncExternalStore, useMemo, useCallback } from "react";
import {
  getStudySnapshot,
  subscribeContinuity,
  saveStudySnapshot,
  clearStudySnapshot,
  getResumeAction,
  getRecentContinuityItems,
  recordMaterialVisit,
  recordDeckReview,
  recordQuizProgress,
  recordFocusGoal,
  type StudySnapshot,
  type ResumeAction,
} from "../lib/continuity";

/**
 * React hook providing real-time synchronized study continuity snapshot,
 * primary 1-click resume action, and recent items tray across all tabs and devices.
 */
const EMPTY_SNAPSHOT_REF: StudySnapshot = Object.freeze({});

export function useContinuity() {
  const snapshot: StudySnapshot = useSyncExternalStore(
    subscribeContinuity,
    getStudySnapshot,
    () => EMPTY_SNAPSHOT_REF,
  );

  const resumeAction: ResumeAction | null = useMemo(() => {
    return getResumeAction(snapshot);
  }, [snapshot]);

  const recentItems: ResumeAction[] = useMemo(() => {
    return getRecentContinuityItems(snapshot);
  }, [snapshot]);

  const recordMaterial = useCallback(
    (material: {
      id: string;
      title: string;
      folderId?: string | null;
      scrollPercentage?: number;
    }) => {
      return recordMaterialVisit(material);
    },
    [],
  );

  const recordDeck = useCallback(
    (deck: { id: string; title: string; cardIndex: number; totalCards: number }) => {
      return recordDeckReview(deck);
    },
    [],
  );

  const recordQuiz = useCallback(
    (quiz: { id: string; title: string; questionIndex: number; totalQuestions: number }) => {
      return recordQuizProgress(quiz);
    },
    [],
  );

  const recordFocus = useCallback(
    (goal: { task: string; folderId?: string | null; minutesRemaining: number }) => {
      return recordFocusGoal(goal);
    },
    [],
  );

  const clearSnapshot = useCallback(() => {
    clearStudySnapshot();
  }, []);

  const saveSnapshot = useCallback((patch: Partial<StudySnapshot>) => {
    return saveStudySnapshot(patch);
  }, []);

  return {
    snapshot,
    resumeAction,
    recentItems,
    recordMaterial,
    recordDeck,
    recordQuiz,
    recordFocus,
    clearSnapshot,
    saveSnapshot,
  };
}
