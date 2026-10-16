import { describe, expect, it } from "vitest";
import type { Exam, Folder } from "../api/types";
import type { ScheduledBlock } from "./autoSchedule";
import {
  blocksForSubject,
  blocksFromSchedule,
  examCountdown,
  examsForSubject,
  formatMinutes,
  subjectNameMatches,
  subjectProgress,
  upcomingBlocks,
} from "./subjects";

const folder = (id: string, name: string): Folder => ({ id, name, user_id: "u", color: "#000", created_at: "" });
const exam = (over: Partial<Exam>): Exam => ({
  id: 1,
  user_id: "u",
  exam_name: "Biology Paper 2",
  exam_date: "2026-10-21",
  difficulty: null,
  status: null,
  ...over,
});

describe("subjects", () => {
  it("matches a subject named in free text, either way round", () => {
    expect(subjectNameMatches("Biology", "biology")).toBe(true);
    expect(subjectNameMatches("Chemistry Paper 1", "Chemistry")).toBe(true);
    expect(subjectNameMatches("Bio", "Biology")).toBe(true);
    expect(subjectNameMatches("Physics", "Biology")).toBe(false);
    expect(subjectNameMatches("", "Biology")).toBe(false);
  });

  it("lists this week's blocks from today on, for one subject or all", () => {
    const plan = {
      days: [
        { date: "2026-10-16", blocks: [{ subject: "Biology", durationMins: 30 }] },
        { date: "2026-10-14", blocks: [{ subject: "Biology", durationMins: 20 }] },
        { date: "2026-10-15", blocks: [{ subject: "Chemistry" }, { subject: "Biology" }] },
      ],
    };
    const bio = upcomingBlocks(plan, "2026-10-15", "Biology");
    expect(bio.map((b) => b.date)).toEqual(["2026-10-15", "2026-10-16"]);
    expect(upcomingBlocks(plan, "2026-10-15")).toHaveLength(3);
    expect(upcomingBlocks(null, "2026-10-15")).toEqual([]);
  });

  it("turns the computed schedule into the same blocks, and filters a subject by id first", () => {
    const scheduled: ScheduledBlock[] = [
      { id: "a", demandId: "d", date: "2026-10-16", startMin: 600, endMin: 645, label: "Revise enzymes", kind: "exam", load: 3, subject: "Biology", folderId: "f1", energy: 1 },
      { id: "b", demandId: "d", date: "2026-10-15", startMin: 540, endMin: 570, label: "Essay plan", kind: "task", load: 1, subject: null, folderId: null, energy: 1 },
      { id: "c", demandId: "d", date: "2026-10-14", startMin: 540, endMin: 570, label: "Old", kind: "task", load: 1, subject: "Biology", folderId: "f1", energy: 1 },
    ];
    const blocks = blocksFromSchedule(scheduled, "2026-10-15");
    expect(blocks.map((b) => b.date)).toEqual(["2026-10-15", "2026-10-16"]);
    expect(blocks[1].block).toMatchObject({ subject: "Biology", durationMins: 45, reason: "Revise enzymes" });
    expect(blocks[0].block.subject).toBe("Essay plan");

    const bio = blocksForSubject(blocks, { id: "f1", name: "Biology" });
    expect(bio).toHaveLength(1);
    /* The id wins over the name: a block filed under another subject that
       happens to mention Biology stays out. */
    expect(blocksForSubject([{ ...blocks[1], folderId: "f2" }], { id: "f1", name: "Biology" })).toEqual([]);
  });

  it("finds a subject's upcoming exams, by folder id or by name, soonest first", () => {
    const bio = folder("f1", "Biology");
    const folders = [bio, folder("f2", "Chemistry")];
    const exams = [
      exam({ id: 1, exam_name: "Biology Paper 2", exam_date: "2026-10-30" }),
      exam({ id: 2, exam_name: "Mock", exam_date: "2026-10-20", folder_id: "f1" }),
      exam({ id: 3, exam_name: "Biology Paper 1", exam_date: "2026-10-01" }),
      exam({ id: 4, exam_name: "Chemistry Paper 1", exam_date: "2026-10-18" }),
    ];
    expect(examsForSubject(exams, bio, folders, "2026-10-15").map((e) => e.id)).toEqual([2, 1]);
  });

  it("says an exam countdown in words", () => {
    expect(examCountdown(exam({ exam_date: "2026-10-21" }), "2026-10-15")).toBe("Biology Paper 2 in 6 days");
    expect(examCountdown(exam({ exam_date: "2026-10-16" }), "2026-10-15")).toBe("Biology Paper 2 tomorrow");
    expect(examCountdown(exam({ exam_date: "2026-10-15" }), "2026-10-15")).toBe("Biology Paper 2 is today");
  });

  it("adds up practised cards across a subject's lessons", () => {
    const progress = new Map([
      ["a", { total: 4, practised: 1 }],
      ["b", { total: 2, practised: 2 }],
    ]);
    expect(subjectProgress([{ id: "a" }, { id: "b" }, { id: "c" }], progress)).toEqual({ total: 6, practised: 3 });
  });

  it("formats minutes plainly", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(90)).toBe("1 hr 30 min");
    expect(formatMinutes(120)).toBe("2 hr");
  });
});
