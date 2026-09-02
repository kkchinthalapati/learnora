import { useMemo } from "react";
import type { Exam } from "../api/types";
import { useMaterials } from "./useMaterials";
import { useFolders } from "./useFolders";
import { useFlashcards } from "./useFlashcards";
import { useAllDecks } from "./useDecks";
import { useQuizAttempts, useQuizzes } from "./useQuizzes";
import { useSessionsSince } from "./useSessions";
import {
  computeExamReadiness,
  generatePrepRoadmap,
  matchExamFolder,
  type ExamReadiness,
  type PrepMilestonePhase,
} from "../lib/examReadiness";

export interface UseExamReadinessResult {
  readiness: ExamReadiness | null;
  roadmap: PrepMilestonePhase[];
  isPending: boolean;
}

export function useExamReadiness(
  exam: Exam | null | undefined,
  now: Date = new Date(),
): UseExamReadinessResult {
  const { data: materials, isPending: materialsPending } = useMaterials();
  const { data: folders, isPending: foldersPending } = useFolders();
  const { data: decks, isPending: decksPending } = useAllDecks();
  const { data: flashcards, isPending: flashcardsPending } = useFlashcards();
  const { data: quizzes, isPending: quizzesPending } = useQuizzes();
  const { data: quizAttempts, isPending: quizAttemptsPending } =
    useQuizAttempts();
  const { data: sessions, isPending: sessionsPending } = useSessionsSince(90);

  const isPending =
    materialsPending ||
    foldersPending ||
    decksPending ||
    flashcardsPending ||
    quizzesPending ||
    quizAttemptsPending ||
    sessionsPending;

  const matchingFolder = useMemo(
    () => matchExamFolder(exam, folders),
    [exam, folders],
  );

  const scopedData = useMemo(() => {
    // An exam without a matching subject folder must not inherit account-wide
    // learning activity. Flashcards need their deck as the folder association;
    // quiz attempts need their quiz as the folder association.
    if (!matchingFolder) {
      return {
        materials: [],
        flashcards: [],
        quizAttempts: [],
        sessions: [],
      };
    }

    const folderId = matchingFolder.id;
    const relevantMaterials = (materials || []).filter(
      (material) => material.folder_id === folderId,
    );
    const deckIds = new Set(
      (decks || [])
        .filter((deck) => deck.folder_id === folderId)
        .map((deck) => deck.id),
    );
    const relevantFlashcards = (flashcards || []).filter(
      (card) => card.deck_id !== null && deckIds.has(card.deck_id),
    );
    const materialIds = new Set(
      relevantMaterials.map((material) => material.id),
    );
    const quizIds = new Set(
      (quizzes || [])
        .filter(
          (quiz) =>
            quiz.folder_id === folderId ||
            (quiz.material_id !== null && materialIds.has(quiz.material_id)),
        )
        .map((quiz) => quiz.id),
    );

    return {
      materials: relevantMaterials,
      flashcards: relevantFlashcards,
      quizAttempts: (quizAttempts || []).filter((attempt) =>
        quizIds.has(attempt.quiz_id),
      ),
      sessions: (sessions || []).filter(
        (session) => session.folder_id === folderId,
      ),
    };
  }, [
    matchingFolder,
    materials,
    decks,
    flashcards,
    quizzes,
    quizAttempts,
    sessions,
  ]);

  const readiness = useMemo(() => {
    if (!exam) return null;
    return computeExamReadiness(
      exam,
      matchingFolder,
      scopedData.materials,
      scopedData.flashcards,
      scopedData.quizAttempts,
      scopedData.sessions,
      now,
    );
  }, [exam, matchingFolder, scopedData, now]);

  const roadmap = useMemo(() => {
    if (!exam || !readiness) return [];
    return generatePrepRoadmap(exam, readiness, now);
  }, [exam, readiness, now]);

  return {
    readiness,
    roadmap,
    isPending,
  };
}
