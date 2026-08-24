import { describe, expect, it } from "vitest";
import {
  addStoredPlanBlock,
  removeStoredPlanBlock,
  updateStoredPlanBlock,
} from "./planEdits";

const plan = {
  summary: "Keep the provider summary",
  providerMeta: { version: 3 },
  days: [
    {
      date: "2026-08-24",
      providerDayMeta: true,
      blocks: [
        {
          subject: "Biology",
          durationMins: 25,
          startHint: "Morning",
          reason: "Exam soon",
          providerBlockMeta: "keep",
        },
      ],
    },
    { date: "2026-08-25", blocks: [] },
  ],
};

describe("stored plan edits", () => {
  it("edits a block without dropping provider metadata", () => {
    const updated = updateStoredPlanBlock(
      plan,
      { dayIndex: 0, blockIndex: 0 },
      {
        subject: "Cell biology",
        durationMins: 40,
        startHint: "After class",
        date: "2026-08-24",
      },
    );

    const updatedRoot = updated as Record<string, unknown>;
    const updatedDays = updated.days as Array<Record<string, unknown>>;
    const updatedBlocks = updatedDays[0].blocks as Array<
      Record<string, unknown>
    >;
    expect(updatedRoot.providerMeta).toEqual({ version: 3 });
    expect(updatedDays[0]).toMatchObject({ providerDayMeta: true });
    expect(updatedBlocks[0]).toEqual({
      subject: "Cell biology",
      durationMins: 40,
      startHint: "After class",
      reason: "Exam soon",
      providerBlockMeta: "keep",
    });
  });

  it("moves, adds, and removes blocks while leaving the source immutable", () => {
    const moved = updateStoredPlanBlock(
      plan,
      { dayIndex: 0, blockIndex: 0 },
      {
        subject: "Biology",
        durationMins: 25,
        date: "2026-08-25",
      },
    );
    const movedDays = moved.days as Array<Record<string, unknown>>;
    expect(movedDays[0].blocks).toHaveLength(0);
    expect(
      (movedDays[1].blocks as Array<Record<string, unknown>>)[0],
    ).toMatchObject({
      subject: "Biology",
      reason: "Exam soon",
    });

    const added = addStoredPlanBlock(moved, {
      subject: "Physics",
      durationMins: 30,
      date: "2026-08-26",
    });
    const addedDays = added.days as Array<Record<string, unknown>>;
    expect(addedDays[2]).toEqual({
      date: "2026-08-26",
      blocks: [{ subject: "Physics", durationMins: 30 }],
    });

    const removed = removeStoredPlanBlock(added, {
      dayIndex: 1,
      blockIndex: 0,
    });
    const removedDays = removed.days as Array<Record<string, unknown>>;
    expect(removedDays[1].blocks).toHaveLength(0);
    expect(plan.days[0].blocks).toHaveLength(1);
  });
});
