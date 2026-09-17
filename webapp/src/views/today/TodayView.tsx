import { Link, useNavigate } from "react-router";
import { useTimer } from "../../context/timer";
import { useTrajectory } from "../../hooks/useTrajectory";
import { INTERVENTION_BLOCK_MINS } from "../../lib/trajectory";
import { TodayHero } from "./TodayHero";
import { SessionCompletePanel } from "./SessionCompletePanel";
import { TasksCard } from "../dashboard/TasksCard";
import { NextExamCard } from "../dashboard/NextExamCard";
import { RecentNotebooksShelf } from "../dashboard/RecentNotebooksShelf";
import { ResumeLearningCard } from "../dashboard/ResumeLearningCard";
import styles from "./today.module.css";
import { useCreateModal } from "../../context/createModal";

export function TodayView() {
  const navigate = useNavigate();
  const { openCreateModal } = useCreateModal();
  const { prepareFocus, completedFocus: completed, dismissCompletedFocus } = useTimer();
  const { exam, forecast, needsMaterial, isPending } = useTrajectory();

  return (
    <div className={styles.view}>
      <TodayHero
        exam={exam}
        forecast={forecast}
        needsMaterial={needsMaterial}
        isPending={isPending}
        onCreate={() => openCreateModal({ type: "material", outputs: { flashcards: true } })}
        onStart={(deckId, label) => {
          prepareFocus(INTERVENTION_BLOCK_MINS, label, undefined, deckId);
          void navigate("/timer");
        }}
      />
      {completed ? <SessionCompletePanel session={completed} onClose={dismissCompletedFocus} /> : null}
      <section className={styles.region} aria-labelledby="today-due"><h2 id="today-due" className={styles.regionTitle}>Due today</h2><TasksCard dueOnly /></section>
      <section className={styles.region} aria-labelledby="today-exam"><h2 id="today-exam" className={styles.regionTitle}>Next exam</h2><NextExamCard /></section>
      <section className={styles.region} aria-labelledby="today-continue"><h2 id="today-continue" className={styles.regionTitle}>Continue</h2><RecentNotebooksShelf /><ResumeLearningCard /></section>
      <p className={styles.footer}>Everything else — streaks, rings, peers, history — lives in <Link to="/analytics">Progress</Link> and the <Link to="/dashboard">full dashboard</Link>.</p>
    </div>
  );
}
