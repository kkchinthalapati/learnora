import { useState } from "react";
import { boardroomApi } from "../../api/boardroom";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Modal } from "../../components/Modal";
import { Skeleton } from "../../components/Skeleton";
import { friendlyErrorMessage } from "../../lib/friendlyError";
import { proposalEditable, proposalMoves, reviewsDisagree } from "../../lib/boardroom/workflow";
import type { Proposal } from "../../lib/boardroom/types";
import {
  useAgents,
  useBoardroomIdentity,
  useBoardroomRefresh,
  useProposals,
  useReviews,
} from "../../hooks/useBoardroom";
import { Field, StatusBadge, Titled, useNames } from "./shared";
import styles from "./boardroom.module.css";

const COMPLEXITY: Proposal["complexity"][] = ["unknown", "small", "medium", "large", "very_large"];

type Fields = Pick<
  Proposal,
  "title" | "description" | "problem" | "solution" | "benefits" | "risks" | "alternatives" | "complexity" | "success_criteria"
>;

export function ProposalForm({
  ws,
  threadId,
  existing,
  onClose,
  onSaved,
}: {
  ws: string;
  threadId?: string | null;
  existing?: Proposal;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState<Fields>({
    title: existing?.title ?? "",
    description: existing?.description ?? "",
    problem: existing?.problem ?? "",
    solution: existing?.solution ?? "",
    benefits: existing?.benefits ?? "",
    risks: existing?.risks ?? "",
    alternatives: existing?.alternatives ?? "",
    complexity: existing?.complexity ?? "unknown",
    success_criteria: existing?.success_criteria ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof Fields) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy(true);
    setError("");
    try {
      await boardroomApi.saveProposal({ id: existing?.id, ws, thread: existing?.thread_id ?? threadId ?? null, fields: f });
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
      title={existing ? "Edit proposal" : "New proposal"}
      footer={
        <Button variant="primary" busy={busy} disabled={f.title.trim() === ""} onClick={() => void save()}>
          Save
        </Button>
      }
    >
      <div className={styles.field}>
        <Field label="Title">
          <input className={styles.input} value={f.title} maxLength={160} onChange={set("title")} />
        </Field>
        <Field label="Description">
          <textarea className={styles.textarea} value={f.description} onChange={set("description")} />
        </Field>
        <Field label="Problem">
          <textarea className={styles.textarea} value={f.problem} onChange={set("problem")} />
        </Field>
        <Field label="Proposed solution">
          <textarea className={styles.textarea} value={f.solution} onChange={set("solution")} />
        </Field>
        <div className={styles.formGrid}>
          <Field label="Expected benefits">
            <textarea className={styles.textarea} value={f.benefits} onChange={set("benefits")} />
          </Field>
          <Field label="Risks">
            <textarea className={styles.textarea} value={f.risks} onChange={set("risks")} />
          </Field>
          <Field label="Alternatives">
            <textarea className={styles.textarea} value={f.alternatives} onChange={set("alternatives")} />
          </Field>
          <Field label="Success criteria">
            <textarea className={styles.textarea} value={f.success_criteria} onChange={set("success_criteria")} />
          </Field>
        </div>
        <Field label="Implementation complexity">
          <select className={styles.select} value={f.complexity} onChange={set("complexity")}>
            {COMPLEXITY.map((c) => (
              <option key={c} value={c}>
                {c.replace("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
    </Modal>
  );
}

export function ProposalsSection({ ws }: { ws: string }) {
  const proposals = useProposals(ws);
  const reviews = useReviews(ws).data ?? [];
  const agents = useAgents(ws).data ?? [];
  const { members, isFounder } = useBoardroomIdentity(ws);
  const names = useNames(members, agents);
  const refresh = useBoardroomRefresh(ws);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Proposal | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function move(p: Proposal, status: Proposal["status"]) {
    setError("");
    try {
      await boardroomApi.setProposalStatus(p.id, status);
      refresh();
    } catch (e) {
      setError(friendlyErrorMessage(e instanceof Error ? e.message : String(e)));
    }
  }
  async function ask(p: Proposal, kind: "another_round" | "more_evidence") {
    setError("");
    try {
      await boardroomApi.requestMore(p.id, kind, note);
      setNote("");
      refresh();
    } catch (e) {
      setError(friendlyErrorMessage(e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <div className={styles.main}>
      <Titled
        title="Proposals"
        sub="Formal changes the founders decide on. AI reviews are recorded beside the proposal and never decide it."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            New proposal
          </Button>
        }
      />
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {proposals.isLoading ? <Skeleton height={160} /> : null}
      {proposals.isError ? <p className={styles.error}>Couldn’t load proposals.</p> : null}
      {proposals.data?.length === 0 ? (
        <EmptyState icon="file-text" title="No proposals yet" message="Write one when a discussion is ready for a decision." />
      ) : null}
      <div className={styles.grid}>
        {proposals.data?.map((p) => {
          const rs = reviews.filter((r) => r.proposal_id === p.id);
          const next = proposalMoves(p.status).filter((s) => s !== "implementing" || isFounder);
          return (
            <article key={p.id} className={styles.card}>
              <div className={styles.rowBetween}>
                <h2 className={styles.cardTitle}>{p.title}</h2>
                <StatusBadge status={p.status} />
              </div>
              {p.description ? <p className={styles.muted}>{p.description}</p> : null}
              {[
                ["Problem", p.problem],
                ["Solution", p.solution],
                ["Benefits", p.benefits],
                ["Risks", p.risks],
                ["Alternatives", p.alternatives],
                ["Success criteria", p.success_criteria],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <strong>{k}</strong>
                    <p className={styles.muted}>{v}</p>
                  </div>
                ))}
              <p className={styles.meta}>
                Complexity: {p.complexity.replace("_", " ")} · owner {names.person(p.owner_id)}
              </p>

              <div>
                <strong>AI reviews</strong>
                {rs.length === 0 ? (
                  <p className={styles.muted}>None yet. Ask AI profiles from the discussion and attach this proposal.</p>
                ) : (
                  <ul className={styles.list}>
                    {rs.map((r) => (
                      <li key={r.id} className={styles.rowBetween}>
                        <span>{names.agent(r.agent_id)}</span>
                        <Badge tone={r.verdict === "support" ? "success" : r.verdict === "oppose" ? "danger" : r.verdict === "concerns" ? "warning" : "neutral"}>
                          {r.verdict}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
                {reviewsDisagree(rs) ? <p className={styles.notice}>The AI profiles disagree. That is kept, not averaged.</p> : null}
              </div>

              <div className={styles.row}>
                {proposalEditable(p.status) ? (
                  <Button size="sm" onClick={() => setEditing(p)}>
                    Edit
                  </Button>
                ) : null}
                {next.map((s) => (
                  <Button key={s} size="sm" onClick={() => void move(p, s)}>
                    {s === "awaiting_founders" ? "Send to founders" : s === "under_review" ? "Move to review" : s.replace("_", " ")}
                  </Button>
                ))}
              </div>
              {isFounder && (p.status === "awaiting_founders" || p.status === "under_review") ? (
                <div className={styles.field}>
                  <input className={styles.input} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
                  <div className={styles.row}>
                    <Button size="sm" onClick={() => void ask(p, "another_round")}>
                      Request another round
                    </Button>
                    <Button size="sm" onClick={() => void ask(p, "more_evidence")}>
                      Request more evidence
                    </Button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      {creating ? <ProposalForm ws={ws} onClose={() => setCreating(false)} onSaved={refresh} /> : null}
      {editing ? <ProposalForm ws={ws} existing={editing} onClose={() => setEditing(null)} onSaved={refresh} /> : null}
    </div>
  );
}
