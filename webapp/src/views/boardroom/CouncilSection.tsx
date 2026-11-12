import { useState } from "react";
import { boardroomApi } from "../../api/boardroom";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Skeleton } from "../../components/Skeleton";
import { friendlyErrorMessage } from "../../lib/friendlyError";
import { MODES } from "../../lib/boardroom/prompt";
import { AVAILABILITY_LABEL, agentAvailability } from "../../lib/boardroom/workflow";
import { TASK_MODES, type Agent, type TaskMode } from "../../lib/boardroom/types";
import { useAgents, useBoardroomIdentity, useBoardroomRefresh, useTasks } from "../../hooks/useBoardroom";
import { Field, Titled, useNames } from "./shared";
import styles from "./boardroom.module.css";

export function CouncilSection({ ws }: { ws: string }) {
  const agents = useAgents(ws);
  const tasks = useTasks(ws).data ?? [];
  const { userId, members } = useBoardroomIdentity(ws);
  const names = useNames(members, agents.data ?? []);

  return (
    <div className={styles.main}>
      <Titled
        title="AI Council"
        sub="Four subscription profiles: a Claude and a ChatGPT for each founder. Each runs only on its owner’s own paid account."
      />
      <p className={styles.notice}>
        How this works: Learnora prepares a prompt, the account owner pastes it into their own Claude or ChatGPT, and pastes the answer back. Learnora never logs in to
        those services, never stores their passwords or cookies, and never calls their APIs.
      </p>
      {agents.isLoading ? <Skeleton height={200} /> : null}
      {agents.isError ? <p className={styles.error}>Couldn’t load the profiles.</p> : null}
      <div className={styles.grid}>
        {agents.data?.map((a) => (
          <AgentCard key={a.id} agent={a} ownerName={names.person(a.owner_id)} mine={a.owner_id === userId} availability={AVAILABILITY_LABEL[agentAvailability(a, tasks)]} />
        ))}
      </div>
    </div>
  );
}

function AgentCard({ agent, ownerName, mine, availability }: { agent: Agent; ownerName: string; mine: boolean; availability: string }) {
  const refresh = useBoardroomRefresh(agent.workspace_id);
  const [draft, setDraft] = useState(agent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(agent);
  const set = <K extends keyof Agent>(k: K, v: Agent[K]) => {
    setSaved(false);
    setDraft({ ...draft, [k]: v });
  };

  async function save() {
    setBusy(true);
    setError("");
    try {
      await boardroomApi.updateAgent(agent.id, {
        display_name: draft.display_name,
        native_url: draft.native_url,
        role: draft.role,
        instructions: draft.instructions,
        enabled: draft.enabled,
        context_format: draft.context_format,
        allowed_modes: draft.allowed_modes,
        may_review_proposals: draft.may_review_proposals,
        allow_proxy_submit: draft.allow_proxy_submit,
      });
      setSaved(true);
      refresh();
    } catch (e) {
      setError(friendlyErrorMessage(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={styles.card}>
      <div className={styles.rowBetween}>
        <h2 className={styles.cardTitle}>{agent.display_name}</h2>
        <Badge tone={agent.enabled ? "accent" : "neutral"}>{availability}</Badge>
      </div>
      <p className={styles.meta}>
        {agent.provider === "claude" ? "Claude" : "ChatGPT"} subscription of {ownerName}
        {mine ? " (you)" : ""} · opens {new URL(agent.native_url).host}
      </p>
      {!mine ? (
        <>
          <p className={styles.muted}>Role: {agent.role || "—"}</p>
          <p className={styles.muted}>Only {ownerName} can change this profile.</p>
        </>
      ) : (
        <div className={styles.field}>
          <label className={styles.row}>
            <input type="checkbox" checked={draft.enabled} onChange={(e) => set("enabled", e.target.checked)} />
            <span>Enabled (mentions can create tasks)</span>
          </label>
          <Field label="Display name">
            <input className={styles.input} value={draft.display_name} maxLength={60} onChange={(e) => set("display_name", e.target.value)} />
          </Field>
          <Field label="Role">
            <input className={styles.input} value={draft.role} maxLength={200} onChange={(e) => set("role", e.target.value)} />
          </Field>
          <Field label="Where to open it" hint="An https address. Opened in a new tab; nothing is sent there automatically.">
            <input className={styles.input} value={draft.native_url} onChange={(e) => set("native_url", e.target.value)} />
          </Field>
          <Field label="Custom instructions" hint="Added to every prompt for this profile. Do not put passwords or keys here.">
            <textarea className={styles.textarea} value={draft.instructions} maxLength={4000} onChange={(e) => set("instructions", e.target.value)} />
          </Field>
          <Field label="Context format">
            <select className={styles.select} value={draft.context_format} onChange={(e) => set("context_format", e.target.value as Agent["context_format"])}>
              <option value="markdown">Markdown</option>
              <option value="plain">Plain text</option>
              <option value="xml">XML tags</option>
            </select>
          </Field>
          <fieldset className={styles.field}>
            <legend className={styles.label}>Allowed tasks</legend>
            {TASK_MODES.map((m: TaskMode) => (
              <label key={m} className={styles.row}>
                <input
                  type="checkbox"
                  checked={draft.allowed_modes.includes(m)}
                  onChange={(e) => set("allowed_modes", e.target.checked ? [...draft.allowed_modes, m] : draft.allowed_modes.filter((x) => x !== m))}
                />
                <span>{MODES[m].label}</span>
              </label>
            ))}
          </fieldset>
          <label className={styles.row}>
            <input type="checkbox" checked={draft.may_review_proposals} onChange={(e) => set("may_review_proposals", e.target.checked)} />
            <span>May review proposals</span>
          </label>
          <label className={styles.row}>
            <input type="checkbox" checked={draft.allow_proxy_submit} onChange={(e) => set("allow_proxy_submit", e.target.checked)} />
            <span>Let another member paste this profile’s answers</span>
          </label>
          {error ? <p className={styles.error}>{error}</p> : null}
          <div className={styles.row}>
            <Button variant="primary" busy={busy} disabled={!dirty} onClick={() => void save()}>
              Save profile
            </Button>
            {saved ? <span className={styles.meta}>Saved.</span> : null}
          </div>
        </div>
      )}
    </article>
  );
}
