import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushMaterialProcessing,
  setMaterialProcessing,
  deriveMaterialStatus,
} from "./materialProcessing";
import type { Material } from "../api/types";

const { update } = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("./supabase", () => ({ supabase: { from: () => ({ update }) } }));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("material status sync", () => {
  it("persists intentionally omitted notes for a second device", async () => {
    update.mockReturnValue({ eq: () => Promise.resolve({ error: null }) });
    setMaterialProcessing({
      materialId: "cards-only",
      status: "completed",
      notesRequested: false,
    });
    await flushMaterialProcessing("cards-only");
    expect(update.mock.calls[0][0].processing_status).toBe("skipped");
  });
  it("waits for pending before sending completion and uses the event timestamp", async () => {
    let finishPending!: (result: { error: null }) => void;
    update.mockReturnValueOnce({
      eq: () =>
        new Promise((done) => {
          finishPending = done;
        }),
    });
    update.mockReturnValueOnce({ eq: () => Promise.resolve({ error: null }) });
    setMaterialProcessing({
      materialId: "ordered",
      status: "processing",
      updatedAt: 1000,
    });
    setMaterialProcessing({
      materialId: "ordered",
      status: "completed",
      updatedAt: 2000,
    });
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][0].processing_status).toBe("pending");
    finishPending({ error: null });
    await flushMaterialProcessing("ordered");
    expect(update.mock.calls[1][0]).toMatchObject({
      processing_status: "done",
      processing_updated_at: new Date(2000).toISOString(),
    });
  });

  it("still sends the final status after a network rejection", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    update.mockReturnValueOnce({
      eq: () => Promise.reject(new Error("offline")),
    });
    update.mockReturnValueOnce({ eq: () => Promise.resolve({ error: null }) });
    setMaterialProcessing({ materialId: "retry-sync", status: "processing" });
    setMaterialProcessing({ materialId: "retry-sync", status: "completed" });
    await flushMaterialProcessing("retry-sync");
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[1][0].processing_status).toBe("done");
    warn.mockRestore();
  });

  it("shows completion from another device over an older local pending record", () => {
    const material = {
      id: "phone",
      processing_status: "done",
      processing_updated_at: new Date(2000).toISOString(),
    } as Material;
    expect(
      deriveMaterialStatus(material, 0, {
        materialId: "phone",
        status: "processing",
        updatedAt: 1000,
      }),
    ).toEqual({ status: "completed" });
  });

  it("keeps a newer in-progress retry over an old completed row", () => {
    const material = {
      id: "phone",
      processing_status: "done",
      processing_updated_at: new Date(1000).toISOString(),
    } as Material;
    expect(
      deriveMaterialStatus(material, 1, {
        materialId: "phone",
        status: "processing",
        updatedAt: 2000,
      }).status,
    ).toBe("processing");
  });
});
