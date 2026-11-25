import { useState, type ReactNode } from "react";
import { NavLink, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { boardroomApi } from "../../api/boardroom";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Skeleton } from "../../components/Skeleton";
import { friendlyErrorMessage } from "../../lib/friendlyError";
import { isFlagOn } from "../../lib/flags";
import { useDocumentTitle } from "../../lib/routeTitle";
import { Storage } from "../../lib/storage";
import { decisionNeedsMyVote, TASK_OPEN } from "../../lib/boardroom/workflow";
import {
  brKeys,
  useActiveWorkspace,
  useBoardroomIdentity,
  useBoardroomRealtime,
  useDecisions,
  useNotifications,
  useTasks,
  useVotes,
  type RealtimeState,
} from "../../hooks/useBoardroom";
import { Field } from "./shared";
import { ActionsSection } from "./ActionsSection";
import { CouncilSection } from "./CouncilSection";
import { DecisionsSection } from "./DecisionsSection";
import { DiscussionsSection } from "./DiscussionsSection";
import { KnowledgeSection } from "./KnowledgeSection";
import { NotificationsSection } from "./NotificationsSection";
import { OverviewSection } from "./OverviewSection";
import { ProposalsSection } from "./ProposalsSection";
import { SettingsSection } from "./SettingsSection";
import { ThreadView } from "./ThreadView";
import styles from "./boardroom.module.css";

/* /boardroom — a private workspace for two founders and their AI subscription
 * profiles. Behind the `boardroom` flag: it is for the founders, not students,
 * and its migration is applied by hand (WAITINGONLEDGER.md). */

export function BoardroomView() {
  useDocumentTitle("Boardroom");
  if (!isFlagOn("boardroom")) {
    return (
      <div className={styles.shell} style={{ display: "block" }}>
        <EmptyState icon="lock" title="The Boardroom isn’t open" message="It is switched off for this browser." />
      </div>
    );
  }
  return <BoardroomApp />;
}

const WS_KEY = "learnora:boardroom:workspace";

function BoardroomApp() {
  const { workspace, isLoading, isError, error, refetch } = useActiveWorkspace();
  if (isLoading) {
    return (
      <div className={styles.shell} style={{ display: "block" }} aria-busy="true">
        <Skeleton label="Loading the Boardroom" height={240} />
      </div>
    );
  }
  if (isError) {
    return (
      <div className={styles.shell} style={{ display: "block" }}>
        <p className={styles.error} role="alert">
          {friendlyErrorMessage(error instanceof Error ? error.message : "Couldn’t reach the Boardroom.")}{" "}
          <Button size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </p>
      </div>
    );
  }
  if (!workspace) return <Onboarding />;
  Storage.set(WS_KEY, workspace.id);
  return <Shell ws={workspace.id} name={workspace.name} />;
}

function Onboarding() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState("Learnora Boardroom");
  const [me, setMe] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function go() {
    setBusy(true);
    setError("");
    try {
      if (mode === "create") await boardroomApi.createWorkspace(name.trim(), me.trim());
      else await boardroomApi.joinWorkspace(code.trim(), me.trim());
      await qc.invalidateQueries({ queryKey: brKeys.workspaces });
    } catch (e) {
      setError(friendlyErrorMessage(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.shell} style={{ display: "block", maxWidth: 560 }}>
      <div className={styles.main}>
        <h1 className={styles.h1}>Boardroom</h1>
        <p className={styles.sub}>
          A private place for the founders and their Claude and ChatGPT subscriptions to discuss, challenge each other and decide. Create the workspace, then
          give the other founder its invite code.
        </p>
        <div className={styles.row} role="tablist">
          <Button variant={mode === "create" ? "primary" : "secondary"} role="tab" aria-selected={mode === "create"} onClick={() => setMode("create")}>
            Create a workspace
          </Button>
          <Button variant={mode === "join" ? "primary" : "secondary"} role="tab" aria-selected={mode === "join"} onClick={() => setMode("join")}>
            Join with a code
          </Button>
        </div>
        <div className={styles.card}>
          {mode === "create" ? (
            <Field label="Workspace name">
              <input className={styles.input} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </Field>
          ) : (
            <Field label="Invite code">
              <input className={styles.input} value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" />
            </Field>
          )}
          <Field label="Your name in the Boardroom" hint="Used to name your AI profiles, for example “Claude (Nirav)”.">
            <input className={styles.input} value={me} maxLength={40} onChange={(e) => setMe(e.target.value)} />
          </Field>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <Button variant="primary" busy={busy} disabled={me.trim() === "" || (mode === "create" ? name.trim() === "" : code.trim() === "")} onClick={() => void go()}>
            {mode === "create" ? "Create workspace" : "Join workspace"}
          </Button>
        </div>
      </div>
    </div>
  );
}

const SECTIONS: { path: string; label: string }[] = [
  { path: "", label: "Overview" },
  { path: "discussions", label: "Discussions" },
  { path: "council", label: "AI Council" },
  { path: "knowledge", label: "Knowledge base" },
  { path: "proposals", label: "Proposals" },
  { path: "decisions", label: "Decisions" },
  { path: "actions", label: "Action centre" },
  { path: "notifications", label: "Notifications" },
  { path: "settings", label: "Settings" },
];

function Shell({ ws, name }: { ws: string; name: string }) {
  const { section = "", threadId } = useParams();
  const [live, setLive] = useState<RealtimeState>("connecting");
  useBoardroomRealtime(ws, setLive);
  const { userId, isFounder } = useBoardroomIdentity(ws);
  const tasks = useTasks(ws).data ?? [];
  const decisions = useDecisions(ws).data ?? [];
  const votes = useVotes(ws).data ?? [];
  const notifications = useNotifications(ws).data ?? [];

  const counts: Record<string, number> = {
    discussions: tasks.filter((t) => TASK_OPEN.has(t.status) && t.owner_id === userId).length,
    decisions: decisions.filter((d) =>
      decisionNeedsMyVote(d, votes.find((v) => v.decision_id === d.id && v.user_id === userId)?.vote, isFounder),
    ).length,
    notifications: notifications.filter((n) => !n.read_at).length,
  };

  let body: ReactNode;
  if (threadId) body = <ThreadView ws={ws} threadId={threadId} />;
  else if (section === "") body = <OverviewSection ws={ws} />;
  else if (section === "discussions") body = <DiscussionsSection ws={ws} />;
  else if (section === "council") body = <CouncilSection ws={ws} />;
  else if (section === "knowledge") body = <KnowledgeSection ws={ws} />;
  else if (section === "proposals") body = <ProposalsSection ws={ws} />;
  else if (section === "decisions") body = <DecisionsSection ws={ws} />;
  else if (section === "actions") body = <ActionsSection ws={ws} />;
  else if (section === "notifications") body = <NotificationsSection ws={ws} />;
  else if (section === "settings") body = <SettingsSection ws={ws} />;
  else body = <EmptyState icon="compass" title="No such section" message="Pick one from the list." />;

  return (
    <div className={styles.shell}>
      <nav className={styles.rail} aria-label="Boardroom sections">
        <h2 className={styles.railTitle}>Boardroom</h2>
        <p className={styles.railSub}>{name}</p>
        {SECTIONS.map((s) => (
          <NavLink
            key={s.path}
            to={s.path ? `/boardroom/${s.path}` : "/boardroom"}
            end={s.path === ""}
            className={({ isActive }) => `${styles.navLink} ${isActive || (s.path === "discussions" && !!threadId) ? styles.navLinkActive : ""}`}
          >
            <span>{s.label}</span>
            {counts[s.path] > 0 ? (
              <span className={styles.count} aria-label={`${counts[s.path]} need you`}>
                {counts[s.path]}
              </span>
            ) : null}
          </NavLink>
        ))}
        <p className={styles.live} role="status">
          <span className={`${styles.dot} ${live === "live" ? styles.dotLive : live === "offline" ? styles.dotOff : ""}`} aria-hidden="true" />
          {live === "live" ? "Live updates on" : live === "offline" ? "Offline: reconnecting. Refresh if it persists." : "Connecting…"}
        </p>
      </nav>
      <div className={styles.main}>{body}</div>
    </div>
  );
}

export default BoardroomView;
