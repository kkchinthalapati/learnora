import { useMemo } from "react";
import type { Exam } from "../api/types";
import { useMaterials } from "./useMaterials";
import { useFolders } from "./useFolders";
import { useFlashcards } from "./useFlashcards";
import { useQuizAttempts } from "./useQuizzes";
import { useSessionsSince } from "./useSessions";
import {
  computeExamReadiness,
  generatePrepRoadmap,
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
  const { data: flashcards, isPending: flashcardsPending } = useFlashcards();
  const { data: quizAttempts, isPending: quizzesPending } = useQuizAttempts();
  const { data: sessions, isPending: sessionsPending } = useSessionsSince(90);

  const isPending =
    materialsPending ||
    foldersPending ||
    flashcardsPending ||
    quizzesPending ||
    sessionsPending;

  const matchingFolder = useMemo(() => {
    if (!exam || !folders || folders.length === 0) return null;
    const name = exam.exam_name.toLowerCase().trim();
    return (
      folders.find(
        (f) =>
          f.name.toLowerCase().trim() === name ||
          name.includes(f.name.toLowerCase().trim()) ||
          f.name.toLowerCase().trim().includes(name),
      ) ?? null
    );
  }, [exam, folders]);

  const readiness = useMemo(() => {
    if (!exam) return null;
    return computeExamReadiness(
      exam,
      matchingFolder,
      materials,
      flashcards,
      quizAttempts,
      sessions,
      now,
    );
  }, [exam, matchingFolder, materials, flashcards, quizAttempts, sessions, now]);

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
