import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { boardroomApi } from "../../api/boardroom";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { friendlyErrorMessage } from "../../lib/friendlyError";
import { renderMarkdownNodes } from "../../lib/markdownToReact";
import { Storage } from "../../lib/storage";
import { MODES, openTarget } from "../../lib/boardroom/prompt";
import { canCancelTask, canRetryAs, canSubmitResponse, TASK_OPEN } from "../../lib/boardroom/workflow";
import type { Agent, AgentTask } from "../../lib/boardroom/types";
import { copyText, formatTime, StatusBadge } from "./shared";
import styles from "./boardroom.module.css";

const MAX_RESPONSE = 60000;
const draftKey = (taskId: string) => `learnora:boardroom:draft:${taskId}`;

interface Props {
  task: AgentTask;
  agent: Agent | undefined;
  ownerName: string;
  /** Who asked for this task (the server records it; it is also in the prompt). */
  requesterName: string;
  userId: string | null;
  isFounder: boolean;
  /** Texts already submitted for this profile in this discussion, to catch a re-paste. */
  priorTexts: string[];
  onChanged: () => void;
}

/** One relay task: the prompt to run, the controls to run it, and the place to paste the answer. */
export function TaskCard({ task, agent, ownerName, requesterName, userId, isFounder, priorTexts, onChanged }: Props) {
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showManifest, setShowManifest] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [problemOpen, setProblemOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const isOwner = !!userId && task.owner_id === userId;
  const open = TASK_OPEN.has(task.status);
  const submit = canSubmitResponse(task, agent, userId ?? "");
  // Offer only what the database will allow this person to do.
  const actor = { id: userId, isFounder };
  const mayCancel = canCancelTask(task, actor);
  const mayRetry = canRetryAs(task, actor);

  const snapshot = useQuery({
    queryKey: ["boardroom", task.workspace_id, "snapshot", task.snapshot_id],
    queryFn: () => boardroomApi.snapshot(task.snapshot_id),
    enabled: showManifest,
    staleTime: Infinity,
  });

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    try {
      await fn();
      setNote(null);
      onChanged();
    } catch (e) {
      setNote({ tone: "bad", text: friendlyErrorMessage(e instanceof Error ? e.message : String(e)) });
    } finally {
      setBusy(null);
    }
  }

  async function copy(text: string, what: string) {
    const ok = await copyText(text);
    if (ok) setNote({ tone: "ok", text: `${what} copied.` });
    else {
      setShowPrompt(true);
      setNote({ tone: "bad", text: "Couldn't copy automatically. The text is shown below: select it and copy." });
    }
  }

  function openProvider() {
    if (!agent) return;
    window.open(openTarget(agent), "_blank", "noopener,noreferrer");
    if (isOwner && task.status === "awaiting_owner") void run("start", () => boardroomApi.taskStarted(task.id));
  }

  const provider = agent?.provider === "claude" ? "Claude" : "ChatGPT";

  return (
    <div className={styles.task} data-testid="agent-task">
      <div className={styles.rowBetween}>
        <strong>{agent?.display_name ?? "Removed AI profile"}</strong>
        <StatusBadge status={task.status} />
      </div>
      <p className={styles.muted}>
        {MODES[task.mode].label} · round {task.round} · runs on {ownerName}’s own {provider} subscription ·{" "}
        {formatTime(task.created_at)}
      </p>
      <p className={styles.meta} data-testid="task-provenance">
        Requested by {requesterName}
        {task.prompt_hash ? (
          <>
            {" "}· prompt fingerprint <span className={styles.mono}>{task.prompt_hash.slice(0, 12)}</span>
          </>
        ) : null}
        {task.attempt > 1 ? ` · attempt ${task.attempt}` : ""}
      </p>

      {task.status === "failed" && task.error ? (
        <p className={styles.error}>
          {ownerName} reported a problem: {task.error}
        </p>
      ) : null}

      {open && !isOwner ? (
        <p className={styles.muted}>Waiting for {ownerName} to run this in their {provider} and paste the answer back.</p>
      ) : null}

      {open && isOwner ? (
        <div className={styles.row}>
          <Button size="sm" variant="primary" onClick={() => void copy(task.prompt, "Prompt")}>
            Copy prompt
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (!snapshot.data) setShowManifest(true);
              void boardroomApi
                .snapshot(task.snapshot_id)
                .then((s) => copy(s.content, "Context"))
                .catch(() => setNote({ tone: "bad", text: "Couldn't load the context snapshot." }));
            }}
          >
            Copy context only
          </Button>
          <Button size="sm" onClick={openProvider}>
            Open {provider}
          </Button>
          {task.status === "awaiting_owner" ? (
            <Button size="sm" variant="ghost" busy={busy === "start"} onClick={() => void run("start", () => boardroomApi.taskStarted(task.id))}>
              Mark started
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setProblemOpen(true)}>
            Report a problem
          </Button>
          <Button size="sm" variant="success" onClick={() => setSubmitOpen(true)}>
            Submit response
          </Button>
        </div>
      ) : null}

      <div className={styles.row}>
        <Button size="sm" variant="ghost" onClick={() => setShowPrompt((v) => !v)} aria-expanded={showPrompt}>
          {showPrompt ? "Hide prompt" : "View prompt"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShowManifest((v) => !v)} aria-expanded={showManifest}>
          What context was used?
        </Button>
        {mayCancel ? (
          <Button size="sm" variant="ghost" busy={busy === "cancel"} onClick={() => void run("cancel", () => boardroomApi.cancelTask(task.id))}>
            Cancel
          </Button>
        ) : null}
        {mayRetry ? (
          <Button size="sm" busy={busy === "retry"} onClick={() => void run("retry", () => boardroomApi.retryTask(task.id))}>
            Retry
          </Button>
        ) : null}
      </div>

      {note ? (
        <p className={note.tone === "ok" ? styles.muted : styles.error} role="status">
          {note.text}
        </p>
      ) : null}

      {showPrompt ? (
        <textarea
          readOnly
          className={`${styles.textarea} ${styles.mono}`}
          value={task.prompt}
          aria-label="Full prompt"
          rows={10}
          onFocus={(e) => e.currentTarget.select()}
        />
      ) : null}

      {showManifest ? (
        <div>
          <p className={styles.muted}>
            Frozen when this task was created. Later edits to documents or the discussion do not change it.
          </p>
          {snapshot.isLoading ? <p className={styles.muted}>Loading…</p> : null}
          {snapshot.data ? (
            <ul className={styles.manifest}>
              {snapshot.data.manifest.documents.map((d) => (
                <li key={d.id}>
                  {d.title} v{d.version} — {d.reason}
                  {d.truncated ? " (cut for length)" : ""}
                </li>
              ))}
              {snapshot.data.manifest.documents.length === 0 ? <li>No knowledge-base documents</li> : null}
              <li>{snapshot.data.manifest.decisions.length} prior decision(s)</li>
              <li>
                {snapshot.data.manifest.messages.count} recent message(s)
                {snapshot.data.manifest.excludedAiMessages ? ", other AI answers withheld on purpose" : ""}
                {snapshot.data.manifest.opinionIds?.length
                  ? `, ${snapshot.data.manifest.opinionIds.length} AI answer(s) supplied in full`
                  : ""}
              </li>
              <li>
                {snapshot.data.manifest.characters.toLocaleString()} characters · fingerprint{" "}
                <span className={styles.mono}>{snapshot.data.content_hash.slice(0, 12)}</span>
              </li>
            </ul>
          ) : null}
        </div>
      ) : null}

      {problemOpen ? (
        <ProblemModal
          agentName={agent?.display_name ?? "this AI profile"}
          onClose={() => setProblemOpen(false)}
          onSend={(reason) => {
            setProblemOpen(false);
            void run("fail", () => boardroomApi.failTask(task.id, reason));
          }}
        />
      ) : null}

      {submitOpen && agent ? (
        <ResponseModal
          task={task}
          agent={agent}
          ownerName={ownerName}
          allowed={submit}
          priorTexts={priorTexts}
          onClose={() => setSubmitOpen(false)}
          onDone={() => {
            setSubmitOpen(false);
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

const PROBLEMS = [
  "I ran out of usage on my subscription",
  "The provider was unavailable",
  "The answer was unusable or off-topic",
  "Something else",
] as const;

/** The account owner says why a task could not be done. The reason is shown to the requester and recorded. */
function ProblemModal({ agentName, onClose, onSend }: { agentName: string; onClose: () => void; onSend: (reason: string) => void }) {
  const [kind, setKind] = useState<(typeof PROBLEMS)[number]>(PROBLEMS[0]);
  const [detail, setDetail] = useState("");
  const reason = detail.trim() ? `${kind}: ${detail.trim()}` : kind;
  const tooLong = reason.length > 500;
  return (
    <Modal
      open
      onClose={onClose}
      title={`Report a problem with ${agentName}’s task`}
      subtitle="The task is marked failed with your reason. It can be retried later."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" disabled={tooLong} onClick={() => onSend(reason)}>
            Mark as failed
          </Button>
        </>
      }
    >
      <div className={styles.field}>
        <label className={styles.field}>
          <span className={styles.label}>What happened</span>
          <select className={styles.select} value={kind} onChange={(e) => setKind(e.target.value as (typeof PROBLEMS)[number])}>
            {PROBLEMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Details (optional)</span>
          <textarea className={styles.textarea} rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} />
        </label>
        {tooLong ? <p className={styles.error}>That is longer than 500 characters.</p> : null}
      </div>
    </Modal>
  );
}

function ResponseModal({
  task,
  agent,
  ownerName,
  allowed,
  priorTexts,
  onClose,
  onDone,
}: {
  task: AgentTask;
  agent: Agent;
  ownerName: string;
  allowed: ReturnType<typeof canSubmitResponse>;
  priorTexts: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [text, setText] = useState(() => Storage.get<string>(draftKey(task.id), ""));
  const [verdict, setVerdict] = useState("comment");
  const [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const provider = agent.provider === "claude" ? "Claude" : "ChatGPT";
  const empty = text.trim().length === 0;
  const tooLong = text.length > MAX_RESPONSE;
  const duplicate = !empty && priorTexts.some((t) => t === text);
  const blocked = !allowed.ok || empty || tooLong || duplicate || !confirmed;

  function change(value: string) {
    setText(value);
    Storage.set(draftKey(task.id), value); // survives a reload or a dropped connection
  }

  async function send() {
    setBusy(true);
    setError("");
    try {
      await boardroomApi.submitResponse(task.id, text, task.proposal_id ? verdict : null);
      Storage.remove(draftKey(task.id));
      onDone();
    } catch (e) {
      // The pasted text stays in the box and in the saved draft.
      setError(friendlyErrorMessage(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Submit ${agent.display_name}’s response`}
      subtitle={`${MODES[task.mode].label} · account owner ${ownerName}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" disabled={blocked} busy={busy} onClick={() => void send()}>
            Publish to discussion
          </Button>
        </>
      }
    >
      <div className={styles.field}>
        <p className={styles.muted}>
          Paste the answer exactly as {provider} gave it. It is stored word for word, attributed to{" "}
          <strong>{agent.display_name}</strong> and to you as the person who submitted it.
        </p>
        {!allowed.ok ? <p className={styles.error}>{allowed.reason}</p> : null}
        <div className={styles.row}>
          <Button size="sm" variant={preview ? "ghost" : "secondary"} onClick={() => setPreview(false)}>
            Edit
          </Button>
          <Button size="sm" variant={preview ? "secondary" : "ghost"} onClick={() => setPreview(true)} disabled={empty}>
            Preview
          </Button>
          <span className={styles.meta}>
            {text.length.toLocaleString()} / {MAX_RESPONSE.toLocaleString()}
          </span>
        </div>
        {preview ? (
          <div className={styles.preview}>{renderMarkdownNodes(text)}</div>
        ) : (
          <textarea
            className={styles.textarea}
            rows={12}
            value={text}
            onChange={(e) => change(e.target.value)}
            aria-label={`${agent.display_name} response`}
            placeholder={`Paste ${provider}’s answer here`}
          />
        )}
        {tooLong ? <p className={styles.error}>That is longer than {MAX_RESPONSE.toLocaleString()} characters. Submit it in parts or trim it.</p> : null}
        {duplicate ? <p className={styles.error}>This exact text was already submitted for {agent.display_name} in this discussion.</p> : null}
        {task.proposal_id ? (
          <label className={styles.field}>
            <span className={styles.label}>Its verdict on the proposal</span>
            <select className={styles.select} value={verdict} onChange={(e) => setVerdict(e.target.value)}>
              <option value="support">Supports</option>
              <option value="concerns">Has concerns</option>
              <option value="oppose">Opposes</option>
              <option value="comment">Comment only</option>
            </select>
            <span className={styles.meta}>Record what the answer says; you are not rewriting it.</span>
          </label>
        ) : null}
        <label className={styles.row}>
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          <span>This is {provider}’s own answer, pasted unedited.</span>
        </label>
        {error ? (
          <p className={styles.error} role="alert">
            {error} Your text is still here.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
