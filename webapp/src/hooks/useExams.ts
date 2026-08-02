import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { examsApi, type ExamPayload } from "../api/exams";

export const examsKeys = { all: ["exams"] as const };

export function useExams() {
  return useQuery({ queryKey: examsKeys.all, queryFn: examsApi.fetch });
}

export function useSaveExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      payload,
      id,
    }: {
      payload: ExamPayload;
      id?: number | null;
    }) => examsApi.save(payload, id ?? null),
    onSuccess: () => qc.invalidateQueries({ queryKey: examsKeys.all }),
  });
}

export function useDeleteExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => examsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: examsKeys.all }),
  });
}
