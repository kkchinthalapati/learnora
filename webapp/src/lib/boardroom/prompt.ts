import type { Agent, TaskMode } from "./types";

/* The task types the screen offers. A prompt is no longer built here: the
 * database assembles it (boardroom_build_prompt in the migration) from the
 * stored message, the frozen snapshot and the profile, so a browser cannot
 * write text that poses as the server's own instructions. This file keeps the
 * labels and guidance the screen shows; boardroom.integrity.sql.test.ts checks
 * they are word for word what the database puts in the prompt. */

interface ModeSpec {
  label: string;
  task: string;
  format: string[];
}

export const MODES: Record<TaskMode, ModeSpec> = {
  independent: {
    label: "Independent analysis",
    task:
      "Give your own independent analysis of the question below. You have NOT been shown any other AI's view on purpose — do not guess what they would say.",
    format: [
      "Recommendation (one sentence)",
      "Reasoning, with the assumptions it depends on",
      "Risks and what could go wrong",
      "Alternatives you considered and why you ranked them lower",
      "What evidence is missing, and your confidence (low / medium / high)",
    ],
  },
  cross_examination: {
    label: "Cross-examination",
    task:
      "Cross-examine the other contributors' independent opinions (included below). Do not be polite for its own sake and do not manufacture agreement.",
    format: [
      "The strongest argument made by another contributor, and why",
      "The weaknesses you found in their reasoning",
      "Unsupported assumptions you challenge",
      "Whether you defend or revise your own recommendation, and why",
      "Missing evidence",
      "Your confidence (low / medium / high)",
      "What would change your position",
    ],
  },
  response_to_agent: {
    label: "Response to another agent",
    task:
      "Respond directly to the specific contribution quoted in the discussion below. Address its claims, not a summary of them.",
    format: [
      "Where you agree, and the evidence for it",
      "Where you disagree, and the evidence for it",
      "A concrete question you would put back to that contributor",
    ],
  },
  research_critique: {
    label: "Research critique",
    task:
      "Critique the research and claims presented below: check what is sourced, what is asserted, and what is missing.",
    format: [
      "Claims that are well supported",
      "Claims that are asserted without support",
      "Sources or checks you would want before relying on this",
      "Your overall confidence in the conclusion",
    ],
  },
  final_synthesis: {
    label: "Reconciliation / final synthesis",
    task:
      "You are given the full debate. Reconcile it honestly: where the contributors still disagree, say so rather than papering over it.",
    format: [
      "Remaining agreement",
      "Remaining disagreement",
      "A recommended compromise, if one exists",
      "Unresolved risks",
      "Your final recommendation and confidence",
    ],
  },
  decision_review: {
    label: "Decision review",
    task:
      "Review the proposal and the debate for the founders, who will make the decision. You advise; you do not decide.",
    format: [
      "Verdict on the proposal: support / concerns / oppose",
      "The two strongest reasons for your verdict",
      "Conditions under which you would change it",
      "Risks the founders should record if they approve",
    ],
  },
  implementation_plan: {
    label: "Implementation planning",
    task:
      "Propose a concrete implementation plan for the approved direction, sized for a two-person team.",
    format: [
      "Ordered steps, each small enough to review",
      "Dependencies and what must be true before each step",
      "How each step is verified",
      "Rollback or mitigation for the riskiest step",
    ],
  },
  code_review: {
    label: "Code review",
    task:
      "Review the code or diff described below for correctness, security and maintainability.",
    format: [
      "Defects that would cause wrong behaviour, most severe first",
      "Security concerns",
      "Maintainability issues worth fixing now vs. later",
      "What you could not judge from the material provided",
    ],
  },
};

const OPINION_MODES: ReadonlySet<TaskMode> = new Set([
  "cross_examination",
  "response_to_agent",
  "final_synthesis",
  "decision_review",
]);

export function modeShowsOpinions(mode: TaskMode): boolean {
  return OPINION_MODES.has(mode);
}

/** Where to open the provider, with a safe fallback if the stored URL is odd. */
export function openTarget(agent: Pick<Agent, "provider" | "native_url">): string {
  try {
    const url = new URL(agent.native_url);
    if (url.protocol === "https:") return url.toString();
  } catch {
    /* fall through */
  }
  return agent.provider === "claude" ? "https://claude.ai/new" : "https://chatgpt.com/";
}
