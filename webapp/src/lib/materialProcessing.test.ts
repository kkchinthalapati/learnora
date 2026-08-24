import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMaterialProcessing,
  deriveMaterialStatus,
  getAllProcessingRecords,
  getMaterialProcessing,
  setMaterialProcessing,
  subscribeMaterialProcessing,
  type MaterialProcessingRecord,
} from "./materialProcessing";
import type { Material } from "../api/types";

function mockMaterial(overrides: Partial<Material> = {}): Material {
  return {
    id: "mat-test-1",
    user_id: "user-1",
    folder_id: null,
    title: "Quantum Physics",
    type: "pdf",
    raw_content: null,
    storage_path: "user-1/quantum.pdf",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("materialProcessing store and helpers", () => {
  beforeEach(() => {
    localStorage.clear();
    clearMaterialProcessing("mat-test-1");
    clearMaterialProcessing("mat-test-2");
  });

  it("sets, gets, and clears processing records", () => {
    expect(getMaterialProcessing("mat-test-1")).toBeNull();

    const record = setMaterialProcessing({
      materialId: "mat-test-1",
      status: "processing",
    });

    expect(record.materialId).toBe("mat-test-1");
    expect(record.status).toBe("processing");
    expect(record.updatedAt).toBeTypeOf("number");

    const retrieved = getMaterialProcessing("mat-test-1");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.status).toBe("processing");

    const all = getAllProcessingRecords();
    expect(all["mat-test-1"]).toBeDefined();

    clearMaterialProcessing("mat-test-1");
    expect(getMaterialProcessing("mat-test-1")).toBeNull();
  });

  it("notifies subscribers when processing records change", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeMaterialProcessing(listener);

    setMaterialProcessing({
      materialId: "mat-test-1",
      status: "failed",
      error: "Network timeout",
    });

    expect(listener).toHaveBeenCalledTimes(1);

    clearMaterialProcessing("mat-test-1");
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    setMaterialProcessing({
      materialId: "mat-test-1",
      status: "completed",
    });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  describe("deriveMaterialStatus", () => {
    it("returns completed if notes exist and no record failure", () => {
      const mat = mockMaterial();
      const status = deriveMaterialStatus(mat, 1);
      expect(status.status).toBe("completed");
    });

    it("returns processing if active record status is processing", () => {
      const mat = mockMaterial();
      const record: MaterialProcessingRecord = {
        materialId: mat.id,
        status: "processing",
        updatedAt: Date.now(),
      };
      const status = deriveMaterialStatus(mat, 0, record);
      expect(status.status).toBe("processing");
    });

    it("returns failed and error message if record is failed", () => {
      const mat = mockMaterial();
      const record: MaterialProcessingRecord = {
        materialId: mat.id,
        status: "failed",
        error: "AI rate limit reached",
        stageFailures: [{ stage: "notes", message: "AI rate limit reached" }],
        updatedAt: Date.now(),
      };
      const status = deriveMaterialStatus(mat, 0, record);
      expect(status.status).toBe("failed");
      expect(status.error).toBe("AI rate limit reached");
      expect(status.stageFailures).toEqual([
        { stage: "notes", message: "AI rate limit reached" },
      ]);
    });

    it("returns partially_processed and failure details if record is partially_processed", () => {
      const mat = mockMaterial();
      const record: MaterialProcessingRecord = {
        materialId: mat.id,
        status: "partially_processed",
        error: "Quiz generation failed",
        stageFailures: [{ stage: "quiz", message: "Quiz generation failed" }],
        updatedAt: Date.now(),
      };
      const status = deriveMaterialStatus(mat, 1, record);
      expect(status.status).toBe("partially_processed");
      expect(status.error).toBe("Quiz generation failed");
      expect(status.stageFailures).toHaveLength(1);
    });

    it("falls back to stored record if record argument is omitted", () => {
      const mat = mockMaterial({ id: "mat-stored-1" });
      setMaterialProcessing({
        materialId: "mat-stored-1",
        status: "failed",
        error: "Could not read PDF",
      });

      const status = deriveMaterialStatus(mat, 0);
      expect(status.status).toBe("failed");
      expect(status.error).toBe("Could not read PDF");
    });
  });
});
