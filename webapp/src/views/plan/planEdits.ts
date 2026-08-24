import type { PlanBlock } from "../../lib/aiJson";

export interface PlanBlockLocation {
  /** Index among valid, renderable days rather than the raw JSON array. */
  dayIndex: number;
  /** Index among valid, renderable blocks rather than the raw JSON array. */
  blockIndex: number;
}

export interface PlanBlockInput {
  subject: string;
  durationMins: number;
  startHint?: string;
  date: string;
}

export class PlanEditError extends Error {
  constructor() {
    super(
      "This plan changed before the edit could be saved. Please try again.",
    );
    this.name = "PlanEditError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isStoredDay(value: unknown): value is Record<string, unknown> & {
  date: string;
} {
  return isRecord(value) && typeof value.date === "string";
}

function isStoredBlock(value: unknown): value is Record<string, unknown> & {
  subject: string;
} {
  return isRecord(value) && typeof value.subject === "string";
}

function requirePlanRoot(planJson: unknown) {
  if (!isRecord(planJson) || !Array.isArray(planJson.days)) {
    throw new PlanEditError();
  }
  return planJson;
}

function findRawDayIndex(days: unknown[], renderedDayIndex: number) {
  let seen = -1;
  return days.findIndex((day) => {
    if (!isStoredDay(day)) return false;
    seen += 1;
    return seen === renderedDayIndex;
  });
}

function findRawBlockIndex(blocks: unknown[], renderedBlockIndex: number) {
  let seen = -1;
  return blocks.findIndex((block) => {
    if (!isStoredBlock(block)) return false;
    seen += 1;
    return seen === renderedBlockIndex;
  });
}

function blockFromInput(
  input: PlanBlockInput,
  original: Record<string, unknown> = {},
) {
  const next: Record<string, unknown> = {
    ...original,
    subject: input.subject.trim(),
    durationMins: Math.round(input.durationMins),
  };
  const startHint = input.startHint?.trim();
  if (startHint) next.startHint = startHint;
  else delete next.startHint;
  return next;
}

function insertBlockOnDate(
  days: unknown[],
  date: string,
  block: Record<string, unknown>,
) {
  const targetIndex = days.findIndex(
    (day) => isStoredDay(day) && day.date === date,
  );
  if (targetIndex >= 0) {
    const targetDay = days[targetIndex] as Record<string, unknown>;
    const blocks = Array.isArray(targetDay.blocks) ? [...targetDay.blocks] : [];
    blocks.push(block);
    days[targetIndex] = { ...targetDay, blocks };
    return;
  }

  const newDay = { date, blocks: [block] };
  const laterDayIndex = days.findIndex(
    (day) => isStoredDay(day) && day.date > date,
  );
  if (laterDayIndex < 0) days.push(newDay);
  else days.splice(laterDayIndex, 0, newDay);
}

function requireStoredBlock(
  root: Record<string, unknown>,
  location: PlanBlockLocation,
) {
  const days = [...(root.days as unknown[])];
  const rawDayIndex = findRawDayIndex(days, location.dayIndex);
  if (rawDayIndex < 0) throw new PlanEditError();

  const day = days[rawDayIndex];
  if (!isStoredDay(day)) throw new PlanEditError();
  const blocks = Array.isArray(day.blocks) ? [...day.blocks] : [];
  const rawBlockIndex = findRawBlockIndex(blocks, location.blockIndex);
  if (rawBlockIndex < 0) throw new PlanEditError();

  const block = blocks[rawBlockIndex];
  if (!isStoredBlock(block)) throw new PlanEditError();
  return { days, rawDayIndex, day, blocks, rawBlockIndex, block };
}

/**
 * Edits the raw stored JSON rather than rebuilding it from the parsed view.
 * This preserves unknown top-level metadata and any provider-specific fields
 * on untouched days/blocks (including `reason` on the edited block).
 */
export function updateStoredPlanBlock(
  planJson: unknown,
  location: PlanBlockLocation,
  input: PlanBlockInput,
) {
  const root = requirePlanRoot(planJson);
  const { days, rawDayIndex, day, blocks, rawBlockIndex, block } =
    requireStoredBlock(root, location);
  const nextBlock = blockFromInput(input, block);

  if (day.date === input.date) {
    blocks[rawBlockIndex] = nextBlock;
    days[rawDayIndex] = { ...day, blocks };
  } else {
    blocks.splice(rawBlockIndex, 1);
    days[rawDayIndex] = { ...day, blocks };
    insertBlockOnDate(days, input.date, nextBlock);
  }

  return { ...root, days };
}

export function removeStoredPlanBlock(
  planJson: unknown,
  location: PlanBlockLocation,
) {
  const root = requirePlanRoot(planJson);
  const { days, rawDayIndex, day, blocks, rawBlockIndex } = requireStoredBlock(
    root,
    location,
  );
  blocks.splice(rawBlockIndex, 1);
  days[rawDayIndex] = { ...day, blocks };
  return { ...root, days };
}

export function addStoredPlanBlock(planJson: unknown, input: PlanBlockInput) {
  const root = requirePlanRoot(planJson);
  const days = [...(root.days as unknown[])];
  insertBlockOnDate(days, input.date, blockFromInput(input));
  return { ...root, days };
}

export function toPlanBlockInput(
  block: PlanBlock,
  date: string,
): PlanBlockInput {
  return {
    subject: block.subject,
    durationMins: block.durationMins ?? 25,
    startHint: block.startHint,
    date,
  };
}
