import { Link } from "react-router";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/icons";
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
    title: "Find the gap",
    description:
      "Bring one wrong answer or a topic that keeps going wrong. Learnora works backwards to the missing idea.",
    outcome: "Leave with a short repair exercise",
    to: "/debugger",
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
    prompt: "I want a live challenge",
    title: "Challenge me out loud",
    description:
      "Defend an idea against follow-up questions and counterexamples. Voice is optional; typing works too.",
    outcome: "Leave knowing whether your reasoning holds up",
    to: "/sparring",
    icon: "mic",
  },
  {
    prompt: "I am preparing for an exam",
    title: "Practise the traps",
    description:
      "Analyse a past paper or practise the edge cases, hidden assumptions and wording traps that cost marks.",
    outcome: "Leave with the trap types to watch for",
    to: "/exam-detective",
    icon: "target",
  },
];

export function StudyLabView() {
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
