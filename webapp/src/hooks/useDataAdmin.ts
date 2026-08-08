import { useMutation } from "@tanstack/react-query";
import { dataAdminApi } from "../api/dataAdmin";

type ExportFormat = "html" | "csv";

export function useExportData() {
  return useMutation({
    mutationFn: async (options?: { format?: ExportFormat }) => {
      const format = options?.format ?? "csv";
      if (format === "html") {
        return dataAdminApi.exportHTML();
      } else {
        return dataAdminApi.exportCSV();
      }
    },
  });
}

export function useWipeData() {
  return useMutation({ mutationFn: dataAdminApi.wipe });
}
