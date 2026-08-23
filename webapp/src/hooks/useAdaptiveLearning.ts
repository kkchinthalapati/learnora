import { useMemo } from "react";
import type { Flashcard, WeakTopic } from "../api/types";
import {
  computeOverallRetention,
  computeSubjectMastery,
  extractTopWeakTopics,
  getCardsAtForgettingRisk,
  getPreExamSurgeQueue,
  type SubjectMastery,
} from "../lib/adaptiveLearning";
import { useAllDecks } from "./useDecks";
import { useExams } from "./useExams";
import { useAllFlashcards, useFlashcardsDueCount } from "./useFlashcards";
import { useFolders } from "./useFolders";
import { useQuizAttempts, useQuizzes } from "./useQuizzes";
import { useSessionsSince } from "./useSessions";

export interface UseAdaptiveLearningResult {
  overallRetentionRate: number;
  forgettingRiskCards: Flashcard[];
  subjectMasteries: SubjectMastery[];
  topWeakTopics: WeakTopic[];
  surgeCards: Flashcard[];
  isPending: boolean;
  totalCardsCount: number;
  dueCardsCount: number;
}

export function useAdaptiveLearning(): UseAdaptiveLearningResult {
  const flashcardsQuery = useAllFlashcards();
  const dueCountQuery = useFlashcardsDueCount();
  const decksQuery = useAllDecks();
  const foldersQuery = useFolders();
  const examsQuery = useExams();
  const quizzesQuery = useQuizzes();
  const quizAttemptsQuery = useQuizAttempts();
  const sessionsQuery = useSessionsSince(90);

  const isPending =
    flashcardsQuery.isPending ||
    dueCountQuery.isPending ||
    decksQuery.isPending ||
    foldersQuery.isPending ||
    examsQuery.isPending ||
    quizzesQuery.isPending ||
    quizAttemptsQuery.isPending ||
    sessionsQuery.isPending;

  const cards = useMemo(() => flashcardsQuery.data ?? [], [flashcardsQuery.data]);
  const decks = useMemo(() => decksQuery.data ?? [], [decksQuery.data]);
  const folders = useMemo(() => foldersQuery.data ?? [], [foldersQuery.data]);
  const exams = useMemo(() => examsQuery.data ?? [], [examsQuery.data]);
  const quizzes = useMemo(() => quizzesQuery.data ?? [], [quizzesQuery.data]);
  const quizAttempts = useMemo(
    () => quizAttemptsQuery.data ?? [],
    [quizAttemptsQuery.data],
  );

  const overallRetentionRate = useMemo(
    () => computeOverallRetention(cards),
    [cards],
  );

  const forgettingRiskCards = useMemo(
    () => getCardsAtForgettingRisk(cards, 0.75),
    [cards],
  );

  const topWeakTopics = useMemo(
    () => extractTopWeakTopics(quizAttempts, 5),
    [quizAttempts],
  );

  const surgeCards = useMemo(
    () => getPreExamSurgeQueue(cards, exams, folders, new Date(), decks),
    [cards, exams, folders, decks],
  );

  const subjectMasteries = useMemo<SubjectMastery[]>(() => {
    if (!folders || folders.length === 0) return [];

    // Map deck ID to folder ID
    const deckFolderMap = new Map<string, string>();
    decks.forEach((deck) => {
      if (deck.folder_id) {
        deckFolderMap.set(deck.id, deck.folder_id);
      }
    });

    // Map quiz ID to folder ID
    const quizFolderMap = new Map<string, string>();
    quizzes.forEach((quiz) => {
      if (quiz.folder_id) {
        quizFolderMap.set(quiz.id, quiz.folder_id);
      }
    });

    return folders.map((folder) => {
      const folderCards = cards.filter(
        (card) => card.deck_id && deckFolderMap.get(card.deck_id) === folder.id,
      );

      const folderAttempts = quizAttempts.filter(
        (attempt) => quizFolderMap.get(attempt.quiz_id) === folder.id,
      );

      return computeSubjectMastery(
        folder.id,
        folder.name,
        folderCards,
        folderAttempts,
      );
    });
  }, [folders, decks, quizzes, cards, quizAttempts]);

  return {
    overallRetentionRate,
    forgettingRiskCards,
    subjectMasteries,
    topWeakTopics,
    surgeCards,
    isPending,
    totalCardsCount: cards.length,
    dueCardsCount: dueCountQuery.data ?? 0,
  };
}
