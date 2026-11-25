import { describe, expect, it } from "vitest";
import {
  actionMoves,
  agentAvailability,
  canCreateAction,
  canCancelTask,
  canMoveTask,
  canRetryAs,
  canRetryTask,
  canSubmitResponse,
  DECISION_ONLY_STATUS,
  decisionNeedsMyVote,
  evaluateVotes,
  proposalMoves,
  reviewsDisagree,
} from "./workflow";
import { agents, decision, KARTHIK, members, NIRAV } from "./fixtures";

describe("task transitions and submission", () => {
  it("never reopens a published task", () => {
    expect(canMoveTask("published", "awaiting_owner")).toBe(false);
    expect(canMoveTask("failed", "awaiting_owner")).toBe(true);
  });

  it("follows the same lifecycle as the database", () => {
    expect(canMoveTask("awaiting_owner", "in_progress")).toBe(true);
    expect(canMoveTask("in_progress", "published")).toBe(true);
    expect(canMoveTask("in_progress", "awaiting_owner")).toBe(false);
    expect(canMoveTask("cancelled", "awaiting_owner")).toBe(false);
    expect(canMoveTask("failed", "published")).toBe(false);
  });

  it("offers Retry for a failed task only", () => {
    expect(canRetryTask("failed")).toBe(true);
    for (const s of ["awaiting_owner", "in_progress", "published", "cancelled"] as const) expect(canRetryTask(s), s).toBe(false);
  });

  it("offers Retry and Cancel only to the people the database allows", () => {
    const failed = { status: "failed" as const, owner_id: NIRAV, created_by: KARTHIK };
    const open = { status: "awaiting_owner" as const, owner_id: NIRAV, created_by: KARTHIK };
    expect(canRetryAs(failed, { id: NIRAV, isFounder: false })).toBe(true);
    expect(canRetryAs(failed, { id: KARTHIK, isFounder: false })).toBe(true);
    expect(canRetryAs(failed, { id: "u-mia", isFounder: false })).toBe(false);
    expect(canRetryAs(failed, { id: "u-mia", isFounder: true })).toBe(true);
    expect(canRetryAs({ ...failed, status: "cancelled" }, { id: NIRAV, isFounder: true })).toBe(false);
    expect(canCancelTask(open, { id: "u-mia", isFounder: false })).toBe(false);
    expect(canCancelTask(open, { id: KARTHIK, isFounder: false })).toBe(true);
    expect(canCancelTask({ ...open, status: "in_progress" }, { id: NIRAV, isFounder: false })).toBe(true);
    expect(canCancelTask({ ...open, status: "published" }, { id: NIRAV, isFounder: true })).toBe(false);
    expect(canCancelTask(open, { id: null, isFounder: true })).toBe(false);
  });

  it("lets only the account owner submit, unless proxy submission is switched on", () => {
    const task = { status: "awaiting_owner" as const, owner_id: NIRAV };
    expect(canSubmitResponse(task, agents[2], NIRAV)).toEqual({ ok: true });
    expect(canSubmitResponse(task, agents[2], KARTHIK).ok).toBe(false);
    expect(canSubmitResponse(task, { ...agents[2], allow_proxy_submit: true }, KARTHIK)).toEqual({ ok: true });
  });

  it("rejects a second submission and a removed profile", () => {
    expect(canSubmitResponse({ status: "published", owner_id: NIRAV }, agents[2], NIRAV).ok).toBe(false);
    expect(canSubmitResponse({ status: "awaiting_owner", owner_id: NIRAV }, undefined, NIRAV).ok).toBe(false);
  });
});

describe("agentAvailability", () => {
  const a = { id: "a-cn", enabled: true };
  it("is disabled when switched off", () => {
    expect(agentAvailability({ ...a, enabled: false }, [])).toBe("disabled");
  });
  it("is ready with no tasks, never 'online'", () => {
    expect(agentAvailability(a, [])).toBe("ready");
  });
  it("distinguishes waiting on the owner from waiting on the response", () => {
    const t = { agent_id: "a-cn", status: "awaiting_owner" as const, started_at: null, submitted_at: null };
    expect(agentAvailability(a, [t])).toBe("awaiting_owner");
    expect(agentAvailability(a, [{ ...t, status: "in_progress" as const, started_at: "2026-11-08T00:00:00Z" }])).toBe("awaiting_response");
  });
  it("shows a recent submission for a day, then goes back to ready", () => {
    const now = Date.parse("2026-11-08T12:00:00Z");
    const t = { agent_id: "a-cn", status: "published" as const, started_at: null, submitted_at: "2026-11-08T10:00:00Z" };
    expect(agentAvailability(a, [t], now)).toBe("response_submitted");
    expect(agentAvailability(a, [t], now + 48 * 3600_000)).toBe("ready");
  });
});

describe("proposals", () => {
  it("cannot be approved, rejected or deferred by a status button", () => {
    for (const from of ["draft", "under_review", "awaiting_founders"] as const) {
      for (const to of proposalMoves(from)) expect(DECISION_ONLY_STATUS.has(to)).toBe(false);
    }
  });
  it("reports disagreement only when verdicts really conflict", () => {
    expect(reviewsDisagree([{ verdict: "support" }, { verdict: "oppose" }])).toBe(true);
    expect(reviewsDisagree([{ verdict: "support" }, { verdict: "concerns" }])).toBe(false);
    expect(reviewsDisagree([])).toBe(false);
  });
});

describe("evaluateVotes", () => {
  it("waits until every founder has voted", () => {
    expect(evaluateVotes(members, [{ user_id: KARTHIK, vote: "approved" }])).toEqual({
      state: "waiting",
      missing: ["Nirav"],
    });
  });
  it("is final only when all founders agree", () => {
    expect(
      evaluateVotes(members, [
        { user_id: KARTHIK, vote: "approved" },
        { user_id: NIRAV, vote: "approved" },
      ]),
    ).toEqual({ state: "final", outcome: "approved" });
  });
  it("is contested, not averaged, when founders disagree", () => {
    expect(
      evaluateVotes(members, [
        { user_id: KARTHIK, vote: "approved" },
        { user_id: NIRAV, vote: "rejected" },
      ]),
    ).toEqual({ state: "contested" });
  });
  it("ignores votes from non-founders", () => {
    expect(
      evaluateVotes([members[0]], [
        { user_id: "someone", vote: "rejected" },
        { user_id: KARTHIK, vote: "approved" },
      ]),
    ).toEqual({ state: "final", outcome: "approved" });
  });
  it("asks only founders who have not voted, or when contested", () => {
    expect(decisionNeedsMyVote({ status: "pending" }, undefined, true)).toBe(true);
    expect(decisionNeedsMyVote({ status: "pending" }, "approved", true)).toBe(false);
    expect(decisionNeedsMyVote({ status: "contested" }, "approved", true)).toBe(true);
    expect(decisionNeedsMyVote({ status: "pending" }, undefined, false)).toBe(false);
    expect(decisionNeedsMyVote({ status: "final" }, undefined, true)).toBe(false);
  });
});

describe("action items", () => {
  it("require a final approved decision", () => {
    expect(canCreateAction(decision("d"), false, false)).toEqual({ ok: true });
    expect(canCreateAction(decision("d", { outcome: "partially_approved" }), false, false)).toEqual({ ok: true });
    expect(canCreateAction(decision("d", { status: "pending" }), false, true).ok).toBe(false);
    expect(canCreateAction(decision("d", { outcome: "rejected" }), false, true).ok).toBe(false);
    expect(canCreateAction(undefined, false, true).ok).toBe(false);
  });
  it("allow exploratory work only when a founder asks", () => {
    expect(canCreateAction(undefined, true, true)).toEqual({ ok: true });
    expect(canCreateAction(undefined, true, false).ok).toBe(false);
  });
  it("lets a finished task be reopened", () => {
    expect(actionMoves("done")).toContain("open");
  });
});
