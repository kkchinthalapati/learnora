import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { boardroomApi } from "../../api/boardroom";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Modal } from "../../components/Modal";
import { Skeleton } from "../../components/Skeleton";
import { friendlyErrorMessage } from "../../lib/friendlyError";
import { actionMoves, canCreateAction } from "../../lib/boardroom/workflow";
import type { ActionItem, ActionPriority, ActionStatus } from "../../lib/boardroom/types";
import { useActions, useBoardroomIdentity, useBoardroomRefresh, useDecisions } from "../../hooks/useBoardroom";
import { Field, formatTime, StatusBadge, Titled } from "./shared";
import styles from "./boardroom.module.css";

const PRIORITIES: ActionPriority[] = ["low", "medium", "high", "urgent"];
const STATUSES: ActionStatus[] = ["open", "in_progress", "blocked", "done", "cancelled"];

function linkLabel(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? `${u.host}${u.pathname}`.slice(0, 60) : null;
  } catch {
    return null;
  }
}

export function ActionsSection({ ws }: { ws: string }) {
  const actions = useActions(ws);
  const decisions = useDecisions(ws).data ?? [];
  const { members, isFounder } = useBoardroomIdentity(ws);
  const refresh = useBoardroomRefresh(ws);
  const [status, setStatus] = useState<ActionStatus | "active" | "all">("active");
  const [owner, setOwner] = useState("all");
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");
  const nameOf = (id: string | null) => members.find((m) => m.user_id === id)?.display_name ?? "Unassigned";

  const shown = (actions.data ?? []).filter((a) => {
    if (status === "active" && (a.status === "done" || a.status === "cancelled")) return false;
    if (status !== "active" && status !== "all" && a.status !== status) return false;
    if (owner === "none") return a.owner_id === null;
    if (owner !== "all" && a.owner_id !== owner) return false;
    return true;
  });

  async function patch(a: ActionItem, p: Parameters<typeof boardroomApi.updateAction>[1]) {
    setError("");
    try {
      await boardroomApi.updateAction(a.id, p);
      refresh();
    } catch (e) {
      setError(friendlyErrorMessage(e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <div className={styles.main}>
      <Titled
        title="Action centre"
        sub="Work that follows an approved decision. Anything else needs a founder to mark it exploratory."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            New task
          </Button>
        }
      />
      <div className={styles.formGrid}>
        <select className={styles.select} aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="active">Not finished</option>
          <option value="all">Everything</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
        <select className={styles.select} aria-label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="all">Any owner</option>
          <option value="none">Unassigned</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.display_name}
            </option>
          ))}
        </select>
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {actions.isLoading ? <Skeleton height={160} /> : null}
      {actions.data && shown.length === 0 ? <EmptyState icon="list-checks" title="No tasks here" message="Approve a decision, then turn it into tasks." /> : null}
      <ul className={styles.list}>
        {shown.map((a) => {
          const d = decisions.find((x) => x.id === a.decision_id);
          const label = linkLabel(a.link_url);
          return (
            <li key={a.id} className={styles.listItem}>
              <div className={styles.rowBetween}>
                <span className={styles.itemTitle}>{a.title}</span>
                <span className={styles.row}>
                  <Badge tone={a.priority === "urgent" ? "danger" : a.priority === "high" ? "warning" : "neutral"}>{a.priority}</Badge>
                  <StatusBadge status={a.status} />
                  {a.exploratory ? <Badge tone="warning">exploratory</Badge> : null}
                </span>
              </div>
              <p className={styles.meta}>
                {nameOf(a.owner_id)} · {d ? `from “${d.title}”` : "no decision (exploratory)"}
                {a.due_date ? ` · due ${a.due_date}` : ""}
                {a.completed_at ? ` · done ${formatTime(a.completed_at)}` : ""}
              </p>
              {a.description ? <p className={styles.muted}>{a.description}</p> : null}
              {a.completion_notes ? <p className={styles.muted}>Completion notes: {a.completion_notes}</p> : null}
              {label && a.link_url ? (
                <a href={a.link_url} target="_blank" rel="noopener noreferrer">
                  {label}
                </a>
              ) : null}
              <div className={styles.row}>
                <select className={styles.select} style={{ width: "auto" }} aria-label={`Status of ${a.title}`} value={a.status} onChange={(e) => void patch(a, { status: e.target.value as ActionStatus })}>
                  {[a.status, ...actionMoves(a.status)].map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </select>
                <select className={styles.select} style={{ width: "auto" }} aria-label={`Owner of ${a.title}`} value={a.owner_id ?? ""} onChange={(e) => void patch(a, { owner_id: e.target.value || null })}>
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.display_name}
                    </option>
                  ))}
                </select>
                <Button size="sm" variant="ghost" onClick={() => setOpen(open === a.id ? null : a.id)} aria-expanded={open === a.id}>
                  Notes & comments
                </Button>
              </div>
              {open === a.id ? <Comments ws={ws} action={a} onPatch={(p) => patch(a, p)} nameOf={nameOf} /> : null}
            </li>
          );
        })}
      </ul>
      {creating ? (
        <NewAction ws={ws} isFounder={isFounder} decisions={decisions} members={members} onClose={() => setCreating(false)} onSaved={refresh} />
      ) : null}
    </div>
  );
}

function Comments({
  ws,
  action,
  onPatch,
  nameOf,
}: {
  ws: string;
  action: ActionItem;
  onPatch: (p: { completion_notes: string }) => Promise<void>;
  nameOf: (id: string | null) => string;
}) {
  const qc = useQueryClient();
  const comments = useQuery({ queryKey: ["boardroom", ws, "action-comments", action.id], queryFn: () => boardroomApi.actionComments(action.id) });
  const [body, setBody] = useState("");
  const [notes, setNotes] = useState(action.completion_notes);
  const [error, setError] = useState("");

  async function add() {
    try {
      await boardroomApi.addActionComment(ws, action.id, body.trim());
      setBody("");
      void qc.invalidateQueries({ queryKey: ["boardroom", ws, "action-comments", action.id] });
    } catch (e) {
      setError(friendlyErrorMessage(e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <div className={styles.field}>
      <Field label="Completion notes">
        <textarea className={styles.textarea} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Button size="sm" disabled={notes === action.completion_notes} onClick={() => void onPatch({ completion_notes: notes })}>
        Save notes
      </Button>
      <ul className={styles.list} aria-label="Comments">
        {comments.data?.map((c) => (
          <li key={c.id} className={styles.meta}>
            <strong>{nameOf(c.author_id)}</strong> · {formatTime(c.created_at)}: {c.body}
          </li>
        ))}
      </ul>
      <div className={styles.row}>
        <input className={styles.input} style={{ flex: 1 }} aria-label="Add a comment" value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} />
        <Button size="sm" disabled={body.trim() === ""} onClick={() => void add()}>
          Comment
        </Button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}

function NewAction({
  ws,
  isFounder,
  decisions,
  members,
  onClose,
  onSaved,
}: {
  ws: string;
  isFounder: boolean;
  decisions: ReturnType<typeof useDecisions>["data"] & object;
  members: ReturnType<typeof useBoardroomIdentity>["members"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const approved = decisions.filter((d) => d.status === "final" && ["approved", "partially_approved"].includes(d.outcome));
  const [decision, setDecision] = useState(approved[0]?.id ?? "");
  const [exploratory, setExploratory] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState("");
  const [priority, setPriority] = useState<ActionPriority>("medium");
  const [due, setDue] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rule = canCreateAction(exploratory ? undefined : decisions.find((d) => d.id === decision), exploratory, isFounder);
  const linkOk = link === "" || /^https:\/\/\S+$/.test(link);

  async function save() {
    setBusy(true);
    setError("");
    try {
      await boardroomApi.createAction({
        workspace_id: ws,
        decision_id: exploratory ? null : decision,
        thread_id: decisions.find((d) => d.id === decision)?.thread_id ?? null,
        title: title.trim(),
        description,
        owner_id: owner || null,
        priority,
        due_date: due || null,
        exploratory,
        link_url: link || null,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(friendlyErrorMessage(e instanceof Error ? e.message : String(e)));
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New task"
      footer={
        <Button variant="primary" busy={busy} disabled={title.trim() === "" || !rule.ok || !linkOk} onClick={() => void save()}>
          Create task
        </Button>
      }
    >
      <div className={styles.field}>
        {!exploratory ? (
          <Field label="From the approved decision">
            <select className={styles.select} value={decision} onChange={(e) => setDecision(e.target.value)}>
              {approved.length === 0 ? <option value="">No approved decision yet</option> : null}
              {approved.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {isFounder ? (
          <label className={styles.row}>
            <input type="checkbox" checked={exploratory} onChange={(e) => setExploratory(e.target.checked)} />
            <span>Exploratory work, not tied to an approved decision</span>
          </label>
        ) : null}
        {!rule.ok ? <p className={styles.notice}>{rule.reason}</p> : null}
        <Field label="Title">
          <input className={styles.input} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Description">
          <textarea className={styles.textarea} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className={styles.formGrid}>
          <Field label="Owner">
            <select className={styles.select} value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select className={styles.select} value={priority} onChange={(e) => setPriority(e.target.value as ActionPriority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due date">
            <input className={styles.input} type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
        <Field label="GitHub issue or pull request (optional)" hint="A link only. Learnora never merges or deploys anything.">
          <input className={styles.input} value={link} placeholder="https://github.com/…" onChange={(e) => setLink(e.target.value)} />
        </Field>
        {!linkOk ? <p className={styles.error}>Use a full https:// address.</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
    </Modal>
  );
}
