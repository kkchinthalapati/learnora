import { useEffect, useState } from "react";
import type { Material, MaterialProcessingDbStatus } from "../api/types";
import { supabase } from "./supabase";

export type MaterialProcessingStatus =
  "processing" | "completed" | "partially_processed" | "failed";

export interface StageFailureRecord {
  stage: string;
  message: string;
}

export interface MaterialProcessingRecord {
  materialId: string;
  status: MaterialProcessingStatus;
  error?: string;
  stageFailures?: Array<{ stage: string; message: string }>;
  updatedAt: number;
  requestPayload?: unknown;
  /** False means notes were deliberately omitted, not left processing. */
  notesRequested?: boolean;
}

const STORAGE_KEY = "learnora_material_processing";

// In-memory cache synced with localStorage
let memoryRecords: Map<string, MaterialProcessingRecord> | null = null;
const listeners = new Set<() => void>();

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

function loadRecords(): Map<string, MaterialProcessingRecord> {
  if (memoryRecords !== null) {
    return memoryRecords;
  }
  const storage = getStorage();
  if (storage) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        memoryRecords = new Map(Object.entries(parsed));
        return memoryRecords;
      }
    } catch (err) {
      console.warn("[materialProcessing] failed to read from storage", err);
    }
  }
  memoryRecords = new Map();
  return memoryRecords;
}

function persistRecords(records: Map<string, MaterialProcessingRecord>) {
  memoryRecords = records;
  const storage = getStorage();
  if (storage) {
    try {
      const obj = Object.fromEntries(records.entries());
      storage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch (err) {
      console.warn("[materialProcessing] failed to write to storage", err);
    }
  }
}

function notify() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      console.error("[materialProcessing] listener notification error", err);
    }
  });
}

export function subscribeMaterialProcessing(listener: () => void): () => void {
  listeners.add(listener);
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    // The module-level cache is shared only within this tab. Re-read it when
    // another tab changes the persisted processing state.
    memoryRecords = null;
    loadRecords();
    listener();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", handleStorage);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorage);
    }
  };
}

const TO_DB: Record<MaterialProcessingStatus, MaterialProcessingDbStatus> = {
  processing: "pending",
  completed: "done",
  partially_processed: "partial",
  failed: "failed",
};

const FROM_DB: Record<MaterialProcessingDbStatus, MaterialProcessingStatus> = {
  pending: "processing",
  done: "completed",
  partial: "partially_processed",
  failed: "failed",
  skipped: "completed",
};

const rowWrites = new Map<string, Promise<void>>();

// Serialize each material's writes so a slow pending update cannot overwrite done.
function syncToRow(entry: MaterialProcessingRecord) {
  if (!supabase) return;
  const write = (rowWrites.get(entry.materialId) ?? Promise.resolve())
    .then(async () => {
      const { error } = await supabase
        .from("materials")
        .update({
          processing_status:
            entry.status === "completed" && entry.notesRequested === false
              ? "skipped"
              : TO_DB[entry.status],
          processing_error:
            entry.status === "failed" || entry.status === "partially_processed"
              ? (entry.error ?? null)
              : null,
          processing_updated_at: new Date(entry.updatedAt).toISOString(),
        })
        .eq("id", entry.materialId);
      if (error) throw new Error(error.message);
    })
    .catch((error) =>
      console.warn("[materialProcessing] row sync failed", error),
    )
    .finally(() => {
      if (rowWrites.get(entry.materialId) === write)
        rowWrites.delete(entry.materialId);
    });
  rowWrites.set(entry.materialId, write);
}

export async function flushMaterialProcessing(
  materialId: string,
): Promise<void> {
  await rowWrites.get(materialId);
}

export function setMaterialProcessing(
  entry: Partial<MaterialProcessingRecord> & {
    materialId: string;
    status: MaterialProcessingStatus;
  },
  opts: { sync?: boolean } = {},
): MaterialProcessingRecord {
  const records = loadRecords();
  const existing = records.get(entry.materialId);
  const updated: MaterialProcessingRecord = {
    ...existing,
    ...entry,
    updatedAt: entry.updatedAt ?? Date.now(),
  };
  records.set(entry.materialId, updated);
  persistRecords(records);
  notify();
  if (opts.sync !== false) syncToRow(updated);
  return updated;
}

/** Status the server row carries, mapped to the client vocabulary. Null when
 *  the row predates the column. */
export function rowProcessingStatus(
  material: Material,
): DerivedMaterialStatus | null {
  const db = material.processing_status;
  if (!db || !Object.hasOwn(FROM_DB, db)) return null;
  const status = FROM_DB[db];
  return status === "failed" || status === "partially_processed"
    ? { status, error: material.processing_error ?? undefined }
    : { status };
}

export function getMaterialProcessing(
  materialId: string,
): MaterialProcessingRecord | null {
  const records = loadRecords();
  return records.get(materialId) ?? null;
}

export function clearMaterialProcessing(materialId: string): void {
  const records = loadRecords();
  if (records.delete(materialId)) {
    persistRecords(records);
    notify();
  }
}

export function getAllProcessingRecords(): Record<
  string,
  MaterialProcessingRecord
> {
  const records = loadRecords();
  return Object.fromEntries(records.entries());
}

export interface DerivedMaterialStatus {
  status: MaterialProcessingStatus;
  error?: string;
  stageFailures?: Array<{ stage: string; message: string }>;
}

export function deriveMaterialStatus(
  material: Material,
  notesCount: number,
  record?: MaterialProcessingRecord | null,
): DerivedMaterialStatus {
  const localRecord =
    record !== undefined ? record : getMaterialProcessing(material.id);
  const rowStatus = rowProcessingStatus(material);
  /* Prefer whichever is newer: the local cache during this tab's own run,
     the row when another device finished (or failed) the job. */
  const rowNewer =
    rowStatus &&
    (!localRecord ||
      (material.processing_updated_at &&
        Date.parse(material.processing_updated_at) > localRecord.updatedAt));
  if (rowNewer) return rowStatus;
  const activeRecord = localRecord;

  if (activeRecord) {
    if (activeRecord.status === "processing") {
      return {
        status: "processing",
        error: activeRecord.error,
        stageFailures: activeRecord.stageFailures,
      };
    }
    if (activeRecord.status === "failed") {
      return {
        status: "failed",
        error: activeRecord.error || "Material processing failed.",
        stageFailures: activeRecord.stageFailures,
      };
    }
    if (activeRecord.status === "partially_processed") {
      return {
        status: "partially_processed",
        error: activeRecord.error,
        stageFailures: activeRecord.stageFailures,
      };
    }
    if (activeRecord.status === "completed") {
      return { status: "completed" };
    }
  }

  if (notesCount > 0) {
    return { status: "completed" };
  }

  return {
    status: "processing",
  };
}

export function useMaterialProcessing(
  materialId?: string | null,
): MaterialProcessingRecord | null {
  const [record, setRecord] = useState<MaterialProcessingRecord | null>(() =>
    materialId ? getMaterialProcessing(materialId) : null,
  );

  useEffect(() => {
    if (!materialId) {
      setRecord(null);
      return;
    }
    setRecord(getMaterialProcessing(materialId));
    return subscribeMaterialProcessing(() => {
      setRecord(getMaterialProcessing(materialId));
    });
  }, [materialId]);

  return record;
}

export function useAllMaterialProcessing(): Record<
  string,
  MaterialProcessingRecord
> {
  const [records, setRecords] = useState<
    Record<string, MaterialProcessingRecord>
  >(() => getAllProcessingRecords());

  useEffect(() => {
    setRecords(getAllProcessingRecords());
    return subscribeMaterialProcessing(() => {
      setRecords(getAllProcessingRecords());
    });
  }, []);

  return records;
}
