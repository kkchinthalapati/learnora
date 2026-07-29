import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { materialsApi } from "../api/materials";
import type { MaterialType } from "../api/types";

export const materialsKeys = {
  all: ["materials"] as const,
  list: (folderId: string | null) => ["materials", folderId ?? "all"] as const,
  mostRecent: ["materials", "most-recent"] as const,
  byId: (id: string) => ["materials", "byId", id] as const,
};

export function useMaterials(folderId: string | null = null) {
  return useQuery({
    queryKey: materialsKeys.list(folderId),
    queryFn: () => materialsApi.fetch(folderId),
  });
}

export function useMostRecentMaterial() {
  return useQuery({
    queryKey: materialsKeys.mostRecent,
    queryFn: materialsApi.fetchMostRecent,
  });
}

export function useMaterial(id: string) {
  return useQuery({
    queryKey: materialsKeys.byId(id),
    queryFn: () => materialsApi.fetchById(id),
    enabled: !!id,
  });
}

export function useUploadMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      file,
      folderId,
      type,
      customTitle,
    }: {
      file: File;
      folderId: string | null;
      type: MaterialType;
      customTitle?: string;
    }) => materialsApi.uploadFile(file, folderId, type, customTitle),
    onSuccess: () => qc.invalidateQueries({ queryKey: materialsKeys.all }),
  });
}

export function useAddMaterialLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      url,
      folderId,
      customTitle,
    }: {
      url: string;
      folderId: string | null;
      customTitle?: string;
    }) => materialsApi.addLink(url, folderId, customTitle),
    onSuccess: () => qc.invalidateQueries({ queryKey: materialsKeys.all }),
  });
}

export function useDeleteMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      storagePath,
    }: {
      id: string;
      storagePath?: string | null;
    }) => materialsApi.delete(id, storagePath),
    onSuccess: () => qc.invalidateQueries({ queryKey: materialsKeys.all }),
  });
}

export function useMaterialSignedUrl() {
  return useMutation({
    mutationFn: (storagePath: string) => materialsApi.getSignedUrl(storagePath),
  });
}
