import type {
  ActionStatus,
  Agent,
  AgentTask,
  Decision,
  DecisionOutcome,
  Member,
  ProposalStatus,
  Review,
  TaskStatus,
} from "./types";

/* The Boardroom's state rules, mirrored from the SQL functions so the UI can
 * explain what will happen and refuse early. The database remains the
 * authority — these never replace its checks, they just keep the screen honest
 * about what it is going to allow. */

/* ------------------------------------------------------------------ tasks */

/* Mirrors boardroom_tasks_guard in the migration. A cancelled task was stopped on
 * purpose and is final (ask again); only a failed one can be retried. */
const TASK_NEXT: Record<TaskStatus, TaskStatus[]> = {
  awaiting_owner: ["in_progress", "published", "cancelled", "failed"],
  in_progress: ["published", "cancelled", "failed"],
  published: [],
  cancelled: [],
  failed: ["awaiting_owner"],
};

export function canMoveTask(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_NEXT[from].includes(to);
}

export const TASK_OPEN: ReadonlySet<TaskStatus> = new Set(["awaiting_owner", "in_progress"]);

/** Only a failed task has a Retry; the database refuses it for any other state. */
export function canRetryTask(status: TaskStatus): boolean {
  return TASK_NEXT[status].includes("awaiting_owner");
}

/** Who the database lets stop an open task: its account owner, whoever asked, or a founder. */
export function canCancelTask(
  task: Pick<AgentTask, "status" | "owner_id" | "created_by">,
  user: { id: string | null; isFounder: boolean },
): boolean {
  if (!TASK_OPEN.has(task.status) || !user.id) return false;
  return user.isFounder || task.owner_id === user.id || task.created_by === user.id;
}

/** Who the database lets retry a failed task: the same people who can cancel one. */
export function canRetryAs(
  task: Pick<AgentTask, "status" | "owner_id" | "created_by">,
  user: { id: string | null; isFounder: boolean },
): boolean {
  if (!canRetryTask(task.status) || !user.id) return false;
  return user.isFounder || task.owner_id === user.id || task.created_by === user.id;
}

export function canSubmitResponse(
  task: Pick<AgentTask, "status" | "owner_id">,
  agent: Pick<Agent, "allow_proxy_submit"> | undefined,
  userId: string,
): { ok: true } | { ok: false; reason: string } {
  if (!agent) return { ok: false, reason: "This AI profile was removed." };
  if (!TASK_OPEN.has(task.status)) {
    return {
      ok: false,
      reason:
        task.status === "published"
          ? "A response was already submitted for this task."
          : `This task is ${task.status.replace(/_/g, " ")}.`,
    };
  }
  if (task.owner_id !== userId && !agent.allow_proxy_submit) {
    return { ok: false, reason: "Only the account owner can submit this response." };
  }
  return { ok: true };
}

export type Availability =
  | "disabled"
  | "awaiting_owner"
  | "awaiting_response"
  | "prompt_prepared"
  | "response_submitted"
  | "ready";

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  disabled: "Disabled",
  awaiting_owner: "Awaiting account owner",
  prompt_prepared: "Prompt prepared",
  awaiting_response: "Awaiting response",
  response_submitted: "Response submitted",
  ready: "Ready for handoff",
};

/** What can honestly be said about a profile. A profile is never "online":
 *  nothing here talks to the model, so the only facts are about our own tasks. */
export function agentAvailability(
  agent: Pick<Agent, "id" | "enabled">,
  tasks: Pick<AgentTask, "agent_id" | "status" | "started_at" | "submitted_at">[],
  now = Date.now(),
): Availability {
  if (!agent.enabled) return "disabled";
  const mine = tasks.filter((t) => t.agent_id === agent.id);
  const open = mine.filter((t) => TASK_OPEN.has(t.status));
  if (open.some((t) => t.status === "in_progress")) return "awaiting_response";
  if (open.length > 0) return "awaiting_owner";
  const recent = mine.some(
    (t) =>
      t.status === "published" &&
      t.submitted_at &&
      now - new Date(t.submitted_at).getTime() < 24 * 3600_000,
  );
  return recent ? "response_submitted" : "ready";
}

/* -------------------------------------------------------------- proposals */

const PROPOSAL_NEXT: Record<ProposalStatus, ProposalStatus[]> = {
  draft: ["under_review"],
  under_review: ["draft", "awaiting_founders"],
  awaiting_founders: ["under_review"],
  approved: ["implementing"],
  rejected: [],
  deferred: ["under_review"],
  implementing: ["completed"],
  completed: [],
};

/** Outcomes a proposal reaches only through a final decision, never by a button. */
export const DECISION_ONLY_STATUS: ReadonlySet<ProposalStatus> = new Set([
  "approved",
  "rejected",
  "deferred",
]);

export function proposalMoves(from: ProposalStatus): ProposalStatus[] {
  return PROPOSAL_NEXT[from];
}

export function proposalEditable(status: ProposalStatus): boolean {
  return status === "draft" || status === "under_review";
}

/** Agents disagree on a proposal when reviews hold both support and opposition.
 *  A count of verdicts, not a score: no consensus number is ever invented. */
export function reviewsDisagree(reviews: Pick<Review, "verdict">[]): boolean {
  const verdicts = new Set(reviews.map((r) => r.verdict));
  return verdicts.has("support") && verdicts.has("oppose");
}

/* -------------------------------------------------------------- decisions */

export type VoteState =
  | { state: "waiting"; missing: string[] }
  | { state: "contested" }
  | { state: "final"; outcome: DecisionOutcome };

/** Mirror of boardroom_evaluate_decision: final only when every founder has
 *  voted and all votes are the same. */
export function evaluateVotes(
  founders: Pick<Member, "user_id" | "display_name">[],
  votes: { user_id: string; vote: DecisionOutcome }[],
): VoteState {
  const founderVotes = founders
    .map((f) => ({ f, v: votes.find((x) => x.user_id === f.user_id) }))
    .filter((x) => x.v);
  const missing = founders
    .filter((f) => !votes.some((v) => v.user_id === f.user_id))
    .map((f) => f.display_name);
  if (missing.length > 0 || founders.length === 0) return { state: "waiting", missing };
  const distinct = new Set(founderVotes.map((x) => x.v!.vote));
  if (distinct.size > 1) return { state: "contested" };
  return { state: "final", outcome: [...distinct][0] };
}

export function decisionNeedsMyVote(
  decision: Pick<Decision, "status">,
  myVote: DecisionOutcome | undefined,
  isFounder: boolean,
): boolean {
  if (!isFounder) return false;
  if (decision.status === "contested") return true;
  return decision.status === "pending" && !myVote;
}

/** Follow-up work may only come from a final approval, unless a founder asks
 *  for exploratory work and says so. */
export function canCreateAction(
  decision: Pick<Decision, "status" | "outcome"> | undefined,
  exploratory: boolean,
  isFounder: boolean,
): { ok: true } | { ok: false; reason: string } {
  if (!decision) {
    return exploratory && isFounder
      ? { ok: true }
      : {
          ok: false,
          reason: exploratory
            ? "Only a founder can request exploratory work."
            : "Pick the approved decision this task comes from.",
        };
  }
  if (decision.status !== "final" || !["approved", "partially_approved"].includes(decision.outcome)) {
    return { ok: false, reason: "Tasks can only follow a final, approved decision." };
  }
  return { ok: true };
}

const ACTION_NEXT: Record<ActionStatus, ActionStatus[]> = {
  open: ["in_progress", "blocked", "done", "cancelled"],
  in_progress: ["open", "blocked", "done", "cancelled"],
  blocked: ["open", "in_progress", "cancelled"],
  done: ["open"],
  cancelled: ["open"],
};

export function actionMoves(from: ActionStatus): ActionStatus[] {
  return ACTION_NEXT[from];
}
