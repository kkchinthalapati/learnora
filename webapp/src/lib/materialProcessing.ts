import { useEffect, useState } from "react";
import type { Material } from "../api/types";

export type MaterialProcessingStatus =
  | "processing"
  | "completed"
  | "partially_processed"
  | "failed";

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
  return () => {
    listeners.delete(listener);
  };
}

export function setMaterialProcessing(
  entry: Partial<MaterialProcessingRecord> & {
    materialId: string;
    status: MaterialProcessingStatus;
  },
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
  return updated;
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
  const activeRecord =
    record !== undefined ? record : getMaterialProcessing(material.id);

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
