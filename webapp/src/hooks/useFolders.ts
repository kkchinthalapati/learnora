import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { foldersApi } from "../api/folders";

export const foldersKeys = { all: ["folders"] as const };

export function useFolders() {
  return useQuery({ queryKey: foldersKeys.all, queryFn: foldersApi.fetch });
}

export function useAddFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, color }: { name: string; color?: string }) =>
      foldersApi.add(name, color),
    onSuccess: () => qc.invalidateQueries({ queryKey: foldersKeys.all }),
  });
}

export function useDeleteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => foldersApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: foldersKeys.all }),
  });
}

export function useRenameFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      foldersApi.rename(id, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: foldersKeys.all }),
  });
}
