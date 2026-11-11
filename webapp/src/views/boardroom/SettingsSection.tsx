import { useState } from "react";
import { boardroomApi } from "../../api/boardroom";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { friendlyErrorMessage } from "../../lib/friendlyError";
import { useAudit, useBoardroomIdentity, useBoardroomRefresh, useFounderRequests, useWorkspaces } from "../../hooks/useBoardroom";
import { copyText, Field, formatTime, Titled, useNames } from "./shared";
import styles from "./boardroom.module.css";

const KINDS: { key: string; label: string }[] = [
  { key: "mention", label: "Someone mentioned me" },
  { key: "task_awaiting_owner", label: "An AI profile needs me to run a prompt" },
  { key: "response_submitted", label: "An AI response was submitted" },
  { key: "founder_decision_required", label: "A founder decision needs my vote" },
  { key: "proposal_approved", label: "A proposal was approved" },
  { key: "decision_final", label: "A decision was made" },
  { key: "task_assigned", label: "A task was assigned to me" },
  { key: "request_more", label: "A founder asked for another round or more evidence" },
  { key: "member_joined", label: "Someone joined" },
  { key: "governance_changed", label: "Founders changed, or decisions were paused or resumed" },
  { key: "task_failed", label: "An AI profile's task could not be completed" },
];

export function SettingsSection({ ws }: { ws: string }) {
  const { userId, me, isFounder, members } = useBoardroomIdentity(ws);
  const workspaces = useWorkspaces();
  const refresh = useBoardroomRefresh(ws);
  const audit = useAudit(ws);
  const requests = useFounderRequests(ws).data ?? [];
  const [confirmingStepDown, setConfirmingStepDown] = useState(false);
  const names = useNames(members, []);
  const [code, setCode] = useState<string | null>(null);
  const [name, setName] = useState(me?.display_name ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const workspace = workspaces.data?.find((w) => w.id === ws);
  const founders = members.filter((m) => m.role === "founder");
  const restricted = workspace?.governance_restricted ?? founders.length < 2;

  async function run(fn: () => Promise<unknown>, ok = "") {
    setError("");
    setNote("");
    try {
      await fn();
      setNote(ok);
      refresh();
    } catch (e) {
      setError(friendlyErrorMessage(e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <div className={styles.main}>
      <Titled title="Settings" sub={workspace ? workspace.name : undefined} />
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {note ? <p className={styles.muted} role="status">{note}</p> : null}

      <div className={styles.grid}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Members</h2>
          {restricted ? (
            <p className={styles.error} role="status" data-testid="governance-restricted">
              Decisions are paused: this workspace has fewer than two active founders, so no decision can become final until a
              second founder is added.
            </p>
          ) : null}
          <ul className={styles.list}>
            {members.map((m) => {
              const pending = requests.find((r) => r.candidate_id === m.user_id);
              return (
                <li key={m.user_id} className={styles.rowBetween}>
                  <span>
                    {m.display_name}
                    {m.user_id === userId ? " (you)" : ""}
                  </span>
                  <span className={styles.row}>
                    <Badge>{m.role}</Badge>
                    {/* The database enforces all of this. A member becomes a founder only when EVERY founder
                        approves; a founder can step down themselves; nobody can demote another founder. */}
                    {isFounder && m.role === "member" && !pending ? (
                      <Button size="sm" onClick={() => void run(() => boardroomApi.requestFounder(ws, m.user_id), "Founder request sent. Every founder has to approve it.")}>
                        Ask to make founder
                      </Button>
                    ) : null}
                    {pending ? <span className={styles.meta}>founder request pending</span> : null}
                    {isFounder && m.role === "founder" && m.user_id === userId && !confirmingStepDown ? (
                      <Button size="sm" onClick={() => setConfirmingStepDown(true)}>
                        Step down as founder
                      </Button>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
          {confirmingStepDown ? (
            <div role="alertdialog" aria-label="Confirm stepping down" className={styles.field}>
              <p>
                Step down as a founder? You will stop voting on decisions.
                {founders.length <= 2 ? " With fewer than two founders, no decision can become final until another founder is approved." : ""}{" "}
                You can only become a founder again if every founder approves.
              </p>
              <div className={styles.row}>
                <Button
                  variant="primary"
                  onClick={() => {
                    setConfirmingStepDown(false);
                    void run(() => boardroomApi.stepDown(ws, userId ?? ""), "You are no longer a founder.");
                  }}
                >
                  Yes, step down
                </Button>
                <Button variant="ghost" onClick={() => setConfirmingStepDown(false)}>
                  Keep being a founder
                </Button>
              </div>
            </div>
          ) : null}
          {requests.length > 0 ? (
            <div className={styles.field}>
              <h3 className={styles.label}>Founder requests</h3>
              <ul className={styles.list}>
                {requests.map((r) => {
                  const approved = founders.filter((f) => r.approvals.includes(f.user_id));
                  return (
                    <li key={r.id} className={styles.rowBetween} data-testid="founder-request">
                      <span>
                        {names.person(r.candidate_id)}: approved by {approved.map((f) => f.display_name).join(", ") || "no one"} ({approved.length} of {founders.length} founders)
                      </span>
                      {isFounder ? (
                        <span className={styles.row}>
                          {!r.approvals.includes(userId ?? "") ? (
                            <Button size="sm" variant="primary" onClick={() => void run(() => boardroomApi.approveFounder(r.id), "Approved.")}>
                              Approve
                            </Button>
                          ) : null}
                          <Button size="sm" variant="ghost" onClick={() => void run(() => boardroomApi.closeFounderRequest(r.id), "Request declined.")}>
                            Decline
                          </Button>
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          <p className={styles.muted}>
            Founders vote on decisions. A decision is final only when every founder agrees, and it needs at least two founders.
            Making a member a founder needs every founder to approve. A founder can step down but cannot be removed by another founder.
          </p>
          <p className={styles.muted}>
            Founders are counted as accounts, not people: the Boardroom cannot tell whether two accounts belong to one person. Only
            accounts the project owner has enabled can use it.
          </p>
        </section>

        {isFounder ? (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Invite the other founder</h2>
            <p className={styles.muted}>Share this code privately. Anyone who has it can join this workspace as a member. Rotate it after use.</p>
            {code ? (
              <p className={styles.mono} data-testid="invite-code">
                {code}
              </p>
            ) : null}
            <div className={styles.row}>
              <Button onClick={() => void run(async () => setCode(await boardroomApi.inviteCode(ws)))}>Show code</Button>
              {code ? (
                <Button
                  onClick={async () => {
                    setNote((await copyText(code)) ? "Code copied." : "Couldn’t copy. Select it above and copy it.");
                  }}
                >
                  Copy
                </Button>
              ) : null}
              <Button onClick={() => void run(async () => setCode(await boardroomApi.rotateCode(ws)), "A new code is active. The old one no longer works.")}>Rotate code</Button>
            </div>
          </section>
        ) : null}

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Your name here</h2>
          <Field label="Display name" hint="Shown in AI profile names such as “Claude (Nirav)”. Existing profile names do not change automatically; rename them in AI Council.">
            <input className={styles.input} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button disabled={name.trim() === "" || name === me?.display_name} onClick={() => void run(() => boardroomApi.updateMe(ws, { display_name: name.trim() }), "Saved.")}>
            Save name
          </Button>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Notifications</h2>
          <p className={styles.muted}>In-app only. No email or push is sent from the Boardroom.</p>
          {KINDS.map((k) => {
            const muted = me?.muted_kinds.includes(k.key) ?? false;
            return (
              <label key={k.key} className={styles.row}>
                <input
                  type="checkbox"
                  checked={!muted}
                  onChange={(e) =>
                    void run(() =>
                      boardroomApi.updateMe(ws, {
                        muted_kinds: e.target.checked ? (me?.muted_kinds ?? []).filter((x) => x !== k.key) : [...(me?.muted_kinds ?? []), k.key],
                      }),
                    )
                  }
                />
                <span>{k.label}</span>
              </label>
            );
          })}
        </section>
      </div>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Audit log</h2>
        <p className={styles.muted}>Who did what, kept by the database. Read-only.</p>
        <ul className={styles.list}>
          {audit.data?.map((a) => (
            <li key={a.id} className={styles.meta}>
              {formatTime(a.created_at)} · {names.person(a.actor_id)} · {a.action.replace(/_/g, " ")} ({a.entity_type.replace(/_/g, " ")})
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
