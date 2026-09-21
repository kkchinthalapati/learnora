import { Link, useNavigate } from "react-router";
import { useTimer } from "../../context/timer";
import { useTrajectory } from "../../hooks/useTrajectory";
import { useFlashcards } from "../../hooks/useFlashcards";
import { dueCardsFrom } from "../review/srs";
import { INTERVENTION_BLOCK_MINS } from "../../lib/trajectory";
import { TodayHero } from "./TodayHero";
import { SessionCompletePanel } from "./SessionCompletePanel";
import { TasksCard } from "../dashboard/TasksCard";
import { NextExamCard } from "../dashboard/NextExamCard";
import { RecentNotebooksShelf } from "../dashboard/RecentNotebooksShelf";
import { ResumeLearningCard } from "../dashboard/ResumeLearningCard";
import styles from "./today.module.css";
import { useCreateModal } from "../../context/createModal";
import { useMemo } from "react";

export function TodayView() {
  const navigate = useNavigate();
  const { openCreateModal } = useCreateModal();
  const { prepareFocus, completedFocus: completed, dismissCompletedFocus } = useTimer();
  const { exam, forecast, needsMaterial, isPending } = useTrajectory();

  /* How many cards the top topic's deck actually owes the student right now.
     The hero needs it to tell "keep this from fading" apart from "there is
     nothing to review"; `useTrajectory` has already fetched the same query,
     so this is a cache read rather than a second round trip. */
  const cards = useFlashcards();
  const topDeckId = forecast?.interventions[0]?.topicId;
  const dueCards = useMemo(
    () =>
      topDeckId
        ? dueCardsFrom((cards.data ?? []).filter((c) => c.deck_id === topDeckId)).length
        : 0,
    [cards.data, topDeckId],
  );

  return (
    <div className={styles.view}>
      <TodayHero
        exam={exam}
        forecast={forecast}
        needsMaterial={needsMaterial}
        isPending={isPending}
        dueCards={dueCards}
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
