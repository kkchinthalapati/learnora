import { Link } from "react-router";
import { Badge } from "../../components/Badge";
import { Skeleton } from "../../components/Skeleton";
import { AVAILABILITY_LABEL, agentAvailability, decisionNeedsMyVote, reviewsDisagree, TASK_OPEN } from "../../lib/boardroom/workflow";
import {
  useActions,
  useAgents,
  useAudit,
  useBoardroomIdentity,
  useDecisions,
  useProposals,
  useReviews,
  useTasks,
  useThreads,
  useVotes,
} from "../../hooks/useBoardroom";
import { formatTime, Titled, useNames } from "./shared";
import styles from "./boardroom.module.css";

const AUDIT_TEXT: Record<string, string> = {
  task_created: "prepared a prompt",
  response_submitted: "submitted an AI response",
  task_cancelled: "cancelled a task",
  task_retried: "retried a task",
  decision_proposed: "proposed a decision",
  decision_vote: "voted on a decision",
  decision_final: "— decision became final",
  decision_contested: "— founders disagree on a decision",
  proposal_created: "created a proposal",
  proposal_status: "moved a proposal",
  document_saved: "saved a document",
  member_joined: "joined",
  role_changed: "changed a role",
  action_updated: "updated a task",
  request_another_round: "asked for another round",
  request_more_evidence: "asked for more evidence",
  workspace_created: "created the workspace",
  code_rotated: "rotated the invite code",
};

export function OverviewSection({ ws }: { ws: string }) {
  const { userId, isFounder, members } = useBoardroomIdentity(ws);
  const threads = useThreads(ws);
  const tasks = useTasks(ws);
  const agents = useAgents(ws).data ?? [];
  const proposals = useProposals(ws).data ?? [];
  const reviews = useReviews(ws).data ?? [];
  const decisions = useDecisions(ws).data ?? [];
  const votes = useVotes(ws).data ?? [];
  const actions = useActions(ws).data ?? [];
  const audit = useAudit(ws);
  const names = useNames(members, agents);

  if (threads.isLoading || tasks.isLoading) return <Skeleton height={320} />;

  const open = (threads.data ?? []).filter((t) => t.status === "open");
  const pending = (tasks.data ?? []).filter((t) => TASK_OPEN.has(t.status));
  const disagreeing = proposals.filter((p) => reviewsDisagree(reviews.filter((r) => r.proposal_id === p.id)));
  const contested = decisions.filter((d) => d.status === "contested");
  const awaiting = decisions.filter((d) => d.status === "pending" || d.status === "contested");
  const myVotes = (id: string) => votes.find((v) => v.decision_id === id && v.user_id === userId)?.vote;
  const openActions = actions.filter((a) => a.status !== "done" && a.status !== "cancelled");

  return (
    <div className={styles.main}>
      <Titled title="Overview" sub="What needs a person right now. Nothing here is guessed: it is counted from the discussions, tasks and votes." />

      <div className={styles.grid}>
        <section className={styles.card} aria-label="Pending AI submissions">
          <h2 className={styles.cardTitle}>Waiting on an account owner ({pending.length})</h2>
          {pending.length === 0 ? <p className={styles.muted}>No prompt is waiting to be run.</p> : null}
          <ul className={styles.list}>
            {pending.slice(0, 6).map((t) => (
              <li key={t.id}>
                <Link className={styles.listItem} to={`/boardroom/discussions/${t.thread_id}`}>
                  <span className={styles.itemTitle}>{names.agent(t.agent_id)}</span>
                  <span className={styles.meta}>
                    {names.person(t.owner_id)} to run it{t.owner_id === userId ? " (you)" : ""} · {formatTime(t.created_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.card} aria-label="Founder decisions">
          <h2 className={styles.cardTitle}>Decisions awaiting founders ({awaiting.length})</h2>
          {awaiting.length === 0 ? <p className={styles.muted}>No decision is open.</p> : null}
          <ul className={styles.list}>
            {awaiting.slice(0, 5).map((d) => (
              <li key={d.id}>
                <Link className={styles.listItem} to="/boardroom/decisions">
                  <span className={styles.itemTitle}>{d.title}</span>
                  <span className={styles.meta}>
                    {d.status}
                    {decisionNeedsMyVote(d, myVotes(d.id), isFounder) ? " · your vote is needed" : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.card} aria-label="Disagreements">
          <h2 className={styles.cardTitle}>Unresolved disagreements ({disagreeing.length + contested.length})</h2>
          {disagreeing.length + contested.length === 0 ? <p className={styles.muted}>None. Disagreement is kept visible, never averaged away.</p> : null}
          <ul className={styles.list}>
            {disagreeing.map((p) => (
              <li key={p.id} className={styles.listItem}>
                <span className={styles.itemTitle}>{p.title}</span>
                <span className={styles.meta}>AI reviews both support and oppose it</span>
              </li>
            ))}
            {contested.map((d) => (
              <li key={d.id} className={styles.listItem}>
                <span className={styles.itemTitle}>{d.title}</span>
                <span className={styles.meta}>The founders voted differently</span>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.card} aria-label="Open tasks">
          <h2 className={styles.cardTitle}>Open action items ({openActions.length})</h2>
          {openActions.length === 0 ? <p className={styles.muted}>Nothing open.</p> : null}
          <ul className={styles.list}>
            {openActions.slice(0, 5).map((a) => (
              <li key={a.id}>
                <Link className={styles.listItem} to="/boardroom/actions">
                  <span className={styles.itemTitle}>{a.title}</span>
                  <span className={styles.meta}>
                    {a.owner_id ? names.person(a.owner_id) : "Unassigned"} · {a.priority}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className={styles.grid}>
        <section className={styles.card} aria-label="AI profiles">
          <h2 className={styles.cardTitle}>AI profiles</h2>
          <p className={styles.muted}>Status is about our own tasks. Learnora is not connected to Claude or ChatGPT, so it can never say a profile is online.</p>
          <ul className={styles.list}>
            {agents.map((a) => (
              <li key={a.id} className={styles.rowBetween}>
                <span>{a.display_name}</span>
                <Badge tone={a.enabled ? "accent" : "neutral"}>{AVAILABILITY_LABEL[agentAvailability(a, tasks.data ?? [])]}</Badge>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.card} aria-label="Members">
          <h2 className={styles.cardTitle}>Members</h2>
          <ul className={styles.list}>
            {members.map((m) => (
              <li key={m.user_id} className={styles.rowBetween}>
                <span>{m.display_name}</span>
                <Badge>{m.role}</Badge>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.card} aria-label="Active discussions">
          <h2 className={styles.cardTitle}>Active discussions ({open.length})</h2>
          <ul className={styles.list}>
            {open.slice(0, 5).map((t) => (
              <li key={t.id}>
                <Link className={styles.listItem} to={`/boardroom/discussions/${t.id}`}>
                  <span className={styles.itemTitle}>{t.title}</span>
                  <span className={styles.meta}>{formatTime(t.last_message_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
          {open.length === 0 ? <p className={styles.muted}>No open discussion.</p> : null}
        </section>
      </div>

      <section className={styles.card} aria-label="Recent activity">
        <h2 className={styles.cardTitle}>Recent activity</h2>
        {audit.isLoading ? <Skeleton height={80} /> : null}
        {audit.data?.length === 0 ? <p className={styles.muted}>Nothing yet.</p> : null}
        <ul className={styles.list}>
          {audit.data?.slice(0, 10).map((a) => (
            <li key={a.id} className={styles.meta}>
              {formatTime(a.created_at)} · {names.person(a.actor_id)} {AUDIT_TEXT[a.action] ?? a.action.replace(/_/g, " ")}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
