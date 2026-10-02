import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { pastPapersApi, type PastPaperInput } from "../api/pastPapers";

export const pastPapersKeys = {
  forExam: (examId: number) => ["pastPapers", examId] as const,
};

export function usePastPapers(examId: number | null) {
  return useQuery({
    queryKey: pastPapersKeys.forExam(examId ?? -1),
    queryFn: () => pastPapersApi.fetchForExam(examId as number),
    enabled: examId !== null,
  });
}

export function useAddPastPaper(examId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<PastPaperInput, "exam_id">) => pastPapersApi.add({ ...input, exam_id: examId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: pastPapersKeys.forExam(examId) }),
  });
}

export function useRemovePastPaper(examId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pastPapersApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: pastPapersKeys.forExam(examId) }),
  });
}
