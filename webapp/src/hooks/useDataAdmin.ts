import { useMutation } from "@tanstack/react-query";
import { dataAdminApi } from "../api/dataAdmin";

export function useExportData() {
  return useMutation({ mutationFn: dataAdminApi.exportCSV });
}

export function useWipeData() {
  return useMutation({ mutationFn: dataAdminApi.wipe });
}
