import { Link, useNavigate } from "react-router";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/icons";
import { useMisconceptions } from "../../hooks/useMisconceptions";
import { CognitiveBridge } from "../../lib/cognitiveBridge";
import type { Misconception } from "../../lib/misconceptions";
import styles from "./studyLab.module.css";

interface StudyRoute {
  prompt: string;
  title: string;
  description: string;
  outcome: string;
  to: string;
  icon: IconName;
}

const STUDY_ROUTES: StudyRoute[] = [
  {
    prompt: "I got something wrong",
    title: "Step-by-Step Solver",
    description:
      "Bring one wrong answer or a tricky topic. Learnora works backwards to solve where you got stuck.",
    outcome: "Leave with the exact missing step fixed",
    to: "/solver",
    icon: "bug",
  },
  {
    prompt: "I think I understand it",
    title: "Prove it by teaching",
    description:
      "Explain the topic in your own words to a deliberately confused student. Their questions expose what you skipped.",
    outcome: "Leave with the gaps in your explanation",
    to: "/feynman",
    icon: "award",
  },
  {
    prompt: "I want oral test practice",
    title: "Viva / Test Practice",
    description:
      "Practise viva questions and defend your answers out loud or by typing.",
    outcome: "Leave confident for your oral exam or viva",
    to: "/viva",
    icon: "mic",
  },
];

/* Which route suits a diagnosis.
 *
 * Not a ranking of the tools — a mapping from what the ledger knows to the
 * kind of practice that actually addresses it. A belief seen once is a
 * hypothesis, so it goes to the Debugger to be traced. One that has survived
 * being corrected is not a knowledge gap, it is an explanation the student
 * believes and cannot yet defend, which is exactly what teaching it to a
 * confused apprentice exposes. */
function routeFor(m: Misconception): {
  to: string;
  action: "debug_stack" | "teach_apprentice";
  why: string;
} {
  return m.timesObserved > 1
    ? {
        to: "/feynman",
        action: "teach_apprentice",
        why: "It has come back after being corrected, so the fastest way through is to try teaching it.",
      }
    : {
        to: "/debugger",
        action: "debug_stack",
        why: "Work backwards from it to the idea underneath.",
      };
}

export function StudyLabView() {
  const navigate = useNavigate();
  const { ranked } = useMisconceptions();

  /* The one row worth interrupting the menu for. Showing three would recreate
     the choice this page exists to remove, and showing a list of everything a
     student has ever got wrong reads as a telling-off rather than a next
     step — the same bar MisconceptionLedgerCard applies. */
  const top = ranked[0];
  const suggested = top ? routeFor(top) : null;

  const startSuggested = () => {
    if (!top || !suggested) return;
    CognitiveBridge.setPayload({
      subject: top.subject,
      topic: top.concept,
      concept: top.concept,
      sourceTool: "notes",
      evidencePrompt: top.summary,
      misconceptions: [top.summary].filter(Boolean),
      severity: top.severity,
      suggestedAction: suggested.action,
    });
    void navigate(suggested.to);
  };

  return (
    <div className={styles.view}>
      <header className={styles.hero}>
        <span className={styles.eyebrow}>Study Lab</span>
        <h1>What do you need help with?</h1>
        <p>
          Start with the problem you have, not the name of a tool. Each route
          gives you a different kind of practice.
        </p>
      </header>

      {/* The page asked a question this app can often answer itself. Four
          equally-weighted doors is the right layout for a student with no
          history; for one whose work has already been diagnosed, offering the
          menu and nothing else throws away the diagnosis. Absent entirely
          when the ledger is empty, which is every new account. */}
      {top && suggested ? (
        <aside className={styles.suggestion} aria-labelledby="lab-suggestion">
          <div>
            <span className={styles.eyebrow}>
              Based on your work{top.subject ? ` in ${top.subject}` : ""}
            </span>
            <h2 id="lab-suggestion">{top.concept}</h2>
            <p>
              {top.summary || "This keeps coming up in your work."}{" "}
              {suggested.why}
              {top.timesObserved > 1
                ? ` Seen ${top.timesObserved} times so far.`
                : ""}
            </p>
          </div>
          <button
            type="button"
            className={styles.secondaryLink}
            onClick={startSuggested}
          >
            Start on this →
          </button>
        </aside>
      ) : null}

      <section className={styles.routeGrid} aria-label="Choose a study method">
        {STUDY_ROUTES.map((route) => (
          <Link key={route.to} to={route.to} className={styles.routeCard}>
            <span className={styles.icon} aria-hidden="true">
              <Icon name={route.icon} size={20} />
            </span>
            <span className={styles.prompt}>{route.prompt}</span>
            <h2>{route.title}</h2>
            <p>{route.description}</p>
            <span className={styles.outcome}>{route.outcome}</span>
            <span className={styles.open}>Start this exercise →</span>
          </Link>
        ))}
      </section>

      <aside className={styles.examChoice} aria-labelledby="exam-choice-title">
        <div>
          <span className={styles.eyebrow}>Already know the exam?</span>
          <h2 id="exam-choice-title">Run a personal exam stress test</h2>
          <p>
            Use your saved exam or subject, choose the trap types, and answer a
            timed set. This is practice; Exam Trap Practice is where you first
            learn and analyse the patterns.
          </p>
        </div>
        <Link to="/premortem" className={styles.secondaryLink}>
          Set up a stress test →
        </Link>
      </aside>
    </div>
  );
}
