import { useState } from "react";
import { boardroomApi } from "../../api/boardroom";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Modal } from "../../components/Modal";
import { Skeleton } from "../../components/Skeleton";
import { friendlyErrorMessage } from "../../lib/friendlyError";
import { decisionNeedsMyVote, evaluateVotes } from "../../lib/boardroom/workflow";
import type { Decision, DecisionOutcome, Member, Proposal } from "../../lib/boardroom/types";
import {
  useBoardroomIdentity,
  useBoardroomRefresh,
  useDecisions,
  useVotes,
} from "../../hooks/useBoardroom";
import { Field, formatTime, StatusBadge, Titled } from "./shared";
import styles from "./boardroom.module.css";

const OUTCOMES: { value: DecisionOutcome; label: string }[] = [
  { value: "approved", label: "Approve" },
  { value: "rejected", label: "Reject" },
  { value: "deferred", label: "Defer" },
  { value: "partially_approved", label: "Approve in part" },
];

export function DecisionForm({
  ws,
  threadId,
  proposals,
  decisions,
  members,
  onClose,
  onSaved,
}: {
  ws: string;
  threadId: string;
  proposals: Proposal[];
  decisions: Decision[];
  members: Member[];
  onClose: () => void;
  onSaved: () => void;
}) {
  void ws;
  const [title, setTitle] = useState("");
  const [outcome, setOutcome] = useState<DecisionOutcome>("approved");
  const [rationale, setRationale] = useState("");
  const [supporting, setSupporting] = useState("");
  const [rejected, setRejected] = useState("");
  const [risks, setRisks] = useState("");
  const [proposal, setProposal] = useState("");
  const [owner, setOwner] = useState("");
  const [supersedes, setSupersedes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const finals = decisions.filter((d) => d.status === "final");

  async function save() {
    setBusy(true);
    setError("");
    try {
      await boardroomApi.proposeDecision({
        thread: threadId,
        proposal: proposal || null,
        title,
        outcome,
        rationale,
        supporting,
        rejected,
        risks,
        implOwner: owner || null,
        supersedes: supersedes || null,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(friendlyErrorMessage(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Record a decision"
      subtitle="Your vote is recorded now. It becomes final only when every founder votes the same way."
      footer={
        <Button variant="primary" busy={busy} disabled={title.trim() === "" || rationale.trim() === ""} onClick={() => void save()}>
          Record my vote
        </Button>
      }
    >
      <div className={styles.field}>
        <Field label="Title">
          <input className={styles.input} value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Outcome you vote for">
          <select className={styles.select} value={outcome} onChange={(e) => setOutcome(e.target.value as DecisionOutcome)}>
            {OUTCOMES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Rationale">
          <textarea className={styles.textarea} value={rationale} onChange={(e) => setRationale(e.target.value)} />
        </Field>
        <div className={styles.formGrid}>
          <Field label="Supporting arguments">
            <textarea className={styles.textarea} value={supporting} onChange={(e) => setSupporting(e.target.value)} />
          </Field>
          <Field label="Rejected alternatives">
            <textarea className={styles.textarea} value={rejected} onChange={(e) => setRejected(e.target.value)} />
          </Field>
          <Field label="Known risks accepted">
            <textarea className={styles.textarea} value={risks} onChange={(e) => setRisks(e.target.value)} />
          </Field>
        </div>
        <div className={styles.formGrid}>
          <Field label="Proposal (optional)">
            <select className={styles.select} value={proposal} onChange={(e) => setProposal(e.target.value)}>
              <option value="">None</option>
              {proposals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Implementation owner">
            <select className={styles.select} value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">Not assigned</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </Field>
          {finals.length > 0 ? (
            <Field label="Supersedes (optional)" hint="Replaces an earlier final decision when this one is final.">
              <select className={styles.select} value={supersedes} onChange={(e) => setSupersedes(e.target.value)}>
                <option value="">Nothing</option>
                {finals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>
        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
    </Modal>
  );
}

export function DecisionsSection({ ws }: { ws: string }) {
  const decisions = useDecisions(ws);
  const votes = useVotes(ws).data ?? [];
  const { userId, members, isFounder } = useBoardroomIdentity(ws);
  const refresh = useBoardroomRefresh(ws);
  const [error, setError] = useState("");
  const founders = members.filter((m) => m.role === "founder");
  const nameOf = (id: string | null) => members.find((m) => m.user_id === id)?.display_name ?? "Someone";

  async function vote(d: Decision, v: DecisionOutcome) {
    setError("");
    try {
      await boardroomApi.vote(d.id, v);
      refresh();
    } catch (e) {
      setError(friendlyErrorMessage(e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <div className={styles.main}>
      <Titled
        title="Decisions"
        sub="The record of what the founders decided and why. A final decision is never edited; a later one can supersede it."
      />
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {decisions.isLoading ? <Skeleton height={160} /> : null}
      {decisions.data?.length === 0 ? (
        <EmptyState icon="check-square" title="No decisions yet" message="Record one from a discussion once the founders have weighed the AI input." />
      ) : null}
      <div className={styles.grid}>
        {decisions.data?.map((d) => {
          const mine = votes.find((v) => v.decision_id === d.id && v.user_id === userId)?.vote;
          const dv = votes.filter((v) => v.decision_id === d.id);
          const state = evaluateVotes(founders, dv);
          const superseded = decisions.data?.find((x) => x.supersedes_id === d.id && x.status === "final");
          return (
            <article key={d.id} className={styles.card}>
              <div className={styles.rowBetween}>
                <h2 className={styles.cardTitle}>{d.title}</h2>
                <StatusBadge status={d.status} />
              </div>
              <p className={styles.meta}>
                {d.outcome.replace("_", " ")} · proposed by {nameOf(d.proposed_by)} · {formatTime(d.decided_at ?? d.created_at)}
                {d.implementation_owner ? ` · owner ${nameOf(d.implementation_owner)}` : ""}
              </p>
              <p className={styles.muted}>{d.rationale}</p>
              {d.supporting_arguments ? <p className={styles.muted}><strong>For:</strong> {d.supporting_arguments}</p> : null}
              {d.rejected_alternatives ? <p className={styles.muted}><strong>Rejected:</strong> {d.rejected_alternatives}</p> : null}
              {d.known_risks ? <p className={styles.muted}><strong>Risks:</strong> {d.known_risks}</p> : null}
              {superseded ? <p className={styles.notice}>Superseded by “{superseded.title}”.</p> : null}
              {d.supersedes_id ? (
                <p className={styles.meta}>Supersedes “{decisions.data?.find((x) => x.id === d.supersedes_id)?.title ?? "an earlier decision"}”.</p>
              ) : null}

              <div>
                <strong>Founder votes</strong>
                <ul className={styles.list}>
                  {founders.map((f) => {
                    const v = dv.find((x) => x.user_id === f.user_id);
                    return (
                      <li key={f.user_id} className={styles.rowBetween}>
                        <span>{f.display_name}</span>
                        <span className={styles.meta}>{v ? v.vote.replace("_", " ") : "not voted"}</span>
                      </li>
                    );
                  })}
                </ul>
                {d.status === "pending" && state.state === "waiting" ? (
                  <p className={styles.muted}>Waiting for {state.missing.join(", ")}.</p>
                ) : null}
                {d.status === "contested" ? <p className={styles.notice}>The founders voted differently. Change a vote or record a new decision.</p> : null}
              </div>

              {decisionNeedsMyVote(d, mine, isFounder) ? (
                <div className={styles.row} role="group" aria-label="Your vote">
                  {OUTCOMES.map((o) => (
                    <Button key={o.value} size="sm" variant={o.value === "approved" ? "primary" : "secondary"} onClick={() => void vote(d, o.value)}>
                      {o.label}
                    </Button>
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
