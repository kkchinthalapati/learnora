import { useEffect, useId, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { StepPlan } from "../../components/learning/StepPlan";
import { useMisconceptions } from "../../hooks/useMisconceptions";
import { useStudySession } from "../../hooks/useStudySession";
import {
  isSessionMode,
  MODE_LABELS,
  SESSION_MODES,
  sessionHref,
  type SessionMode,
} from "../../lib/sessionModes";
import { ExplainMode } from "./modes/ExplainMode";
import { SocraticMode } from "./modes/SocraticMode";
import { PracticeMode } from "./modes/PracticeMode";
import { TeachMode } from "./modes/TeachMode";
import { RecallMode } from "./modes/RecallMode";
import { FlagAnswer } from "./FlagAnswer";
import type { ModeProps } from "./modeTypes";
import text from "../../styles/text.module.css";
import styles from "./session.module.css";
import { useDocumentTitle } from "../../lib/routeTitle";
import { setActiveAiSession } from "../../api/ai";

const MODE_VIEWS: Record<SessionMode, (props: ModeProps) => React.JSX.Element> = {
  explain: ExplainMode,
  socratic: SocraticMode,
  practice: PracticeMode,
  teach: TeachMode,
  recall: RecallMode,
};

const MODE_GOALS: Record<SessionMode, string> = {
  explain: "understand it step by step",
  socratic: "reason it out yourself",
  practice: "solve problems on it",
  teach: "explain it to someone new",
  recall: "pull it back out of memory",
};

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

/* /study/:sessionId?mode=… — one screen for every way of studying. Focus
 * mode: no sidebar, a top bar with the objective and the mode control, the
 * plan on the left and the mode's own content in the centre. Everything
 * autosaves; "Save & leave" never asks. */
export function SessionView() {
  const { sessionId = "new" } = useParams<{ sessionId: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { all: misconceptions } = useMisconceptions();
  const ctl = useStudySession({ sessionId, params, misconceptions });
  const { session, savedAt, missing } = ctl;
  const [flagging, setFlagging] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  useDocumentTitle(
    session ? `${MODE_LABELS[session.mode]}: ${session.objective}` : null,
  );

  /* Every AI call while this session is open is billed to it once, so a
     free student can finish the session they started. */
  const activeId = session?.id ?? null;
  useEffect(() => {
    setActiveAiSession(activeId);
    return () => setActiveAiSession(null);
  }, [activeId]);
  const planId = useId();

  /* A new session gets its real URL as soon as it exists, so a reload or a
     shared link lands on the same session. */
  useEffect(() => {
    if (session && sessionId !== session.id) {
      void navigate(sessionHref(session.id, session.mode), { replace: true });
    }
  }, [session, sessionId, navigate]);

  /* The mode in the URL wins over the stored one — it is what the student
     (or an old /feynman or /viva link) asked for. */
  const urlMode = params.get("mode");
  useEffect(() => {
    if (session && isSessionMode(urlMode) && urlMode !== session.mode) {
      ctl.switchMode(urlMode);
    }
  }, [urlMode, session, ctl]);

  const setMode = (mode: SessionMode) => {
    if (!session) return;
    ctl.switchMode(mode);
    setFlagging(null);
    void navigate(sessionHref(session.id, mode), { replace: true });
  };

  const leave = () => {
    ctl.pause();
    void navigate("/");
  };

  if (missing) {
    return (
      <main className={styles.shell}>
        <div className={styles.setup}>
          <EmptyState
            title="That session isn't on this device."
            message="Sessions are saved in the browser you studied in. Start a new one here; nothing else was lost."
          >
            <Button variant="primary" onClick={() => void navigate("/study")}>
              Start a session
            </Button>
          </EmptyState>
        </div>
      </main>
    );
  }

  if (!session) {
    return <SessionSetup params={params} onBegin={(objective) => ctl.begin(objective)} />;
  }

  const Mode = MODE_VIEWS[session.mode];
  const source = session.sourceRefs[0];
  const stepLabel = session.plan[session.currentStep]?.label;

  const planPanel = (
    <aside
      id={planId}
      className={`${styles.plan} ${planOpen ? styles.planOpen : ""}`}
      aria-label="Session plan"
    >
      <div className={styles.planSection}>
        <span className={text.meta}>
          Plan{session.plan.length ? ` · ${session.plan.length} steps` : ""}
        </span>
        {session.plan.length ? (
          <StepPlan
            label={`Plan, ${session.plan.length} steps`}
            steps={session.plan}
            current={session.currentStep}
          />
        ) : (
          <p className={styles.caption}>The plan appears once the tutor has one.</p>
        )}
      </div>
      {session.watchingFor ? (
        <div className={styles.planSection}>
          <span className={text.meta}>Watching for</span>
          <p className={styles.watching}>
            {session.watchingFor.text}
            {session.watchingFor.seenAt
              ? ` You did this on ${new Date(session.watchingFor.seenAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}.`
              : ""}
          </p>
        </div>
      ) : null}
      <div className={styles.planFoot}>
        {source ? (
          <span>
            Grounded in:{" "}
            {source.href ? <Link to={source.href}>{source.title}</Link> : source.title}
          </span>
        ) : null}
        <span aria-live="polite">
          {savedAt ? `Autosaved ${TIME_FORMAT.format(savedAt)}` : "Saved as you go"}
        </span>
      </div>
    </aside>
  );

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <button
          type="button"
          className={styles.leave}
          onClick={leave}
          /* The visible label is hidden on phones; the X alone has no name. */
          aria-label="Save & leave"
        >
          <Icon name="x" size={18} />
          <span className={styles.leaveLabel}>Save & leave</span>
        </button>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>{session.objective}</h1>
          <span className={styles.goal}>
            Goal: {MODE_GOALS[session.mode]}
            {stepLabel ? ` · now: ${stepLabel}` : ""}
            {source ? ` · from ${source.title}` : ""}
          </span>
        </div>
        <div className={styles.topRight}>
          <Button
            variant="ghost"
            size="sm"
            className={styles.planToggle}
            aria-expanded={planOpen}
            aria-controls={planId}
            onClick={() => setPlanOpen((o) => !o)}
          >
            Plan
          </Button>
          <div className={styles.modes} role="group" aria-label="Mode">
            {SESSION_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                className={styles.modeBtn}
                aria-pressed={session.mode === mode}
                onClick={() => setMode(mode)}
              >
                {MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        </div>
      </header>
      <div className={styles.body}>
        {planPanel}
        <div className={styles.centre}>
          {flagging ? (
            <div className={styles.flagLayer}>
              <FlagAnswer
                answer={flagging}
                objective={session.objective}
                source={source?.title}
                onClose={() => setFlagging(null)}
              />
            </div>
          ) : null}
          <Mode
            key={session.mode}
            session={session}
            ctl={ctl}
            onFlag={setFlagging}
            onSwitchMode={setMode}
          />
        </div>
      </div>
    </main>
  );
}

/* /study/new with no topic yet: one question, then the session starts. */
function SessionSetup({
  params,
  onBegin,
}: {
  params: URLSearchParams;
  onBegin: (objective: string) => void;
}) {
  const [objective, setObjective] = useState("");
  const mode = params.get("mode");
  const label = isSessionMode(mode) ? MODE_LABELS[mode] : "Study";
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (objective.trim()) onBegin(objective.trim());
  };
  return (
    <main className={styles.shell}>
      <form className={styles.setup} onSubmit={submit}>
        <span className={text.meta}>{label} session</span>
        <h1 className={text.pageTitle}>What are you working on?</h1>
        <p className={styles.caption}>
          A topic, a question you got wrong, or a line from your notes.
        </p>
        <div className={styles.setupRow}>
          <input
            className={styles.setupInput}
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="e.g. How the proton gradient makes ATP"
            aria-label="What you're working on"
            autoFocus
          />
          <Button type="submit" variant="primary" size="lg" disabled={!objective.trim()}>
            Start
          </Button>
        </div>
        <Link to="/study" className={styles.caption}>
          Back to Study
        </Link>
      </form>
    </main>
  );
}
