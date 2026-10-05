import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTimer } from "../../context/timer";
import { useOptionalAuth } from "../../context/auth";
import { useCreateModal } from "../../context/createModal";
import { useTrajectory } from "../../hooks/useTrajectory";
import { useFlashcards, useFlashcardsDueCount } from "../../hooks/useFlashcards";
import { useContinuity } from "../../hooks/useContinuity";
import { useRemoteSessionResume } from "../../hooks/useRemoteSessionResume";
import { useMisconceptions } from "../../hooks/useMisconceptions";
import { MistakeLoopSection } from "./MistakeLoopSection";
import { useQuizAttempts } from "../../hooks/useQuizzes";
import { useSessionsSince } from "../../hooks/useSessions";
import { useTasks } from "../../hooks/useTasks";
import { useThisWeekDeficit } from "../../hooks/usePlans";
import { dueCardsFrom } from "../review/srs";
import { INTERVENTION_BLOCK_MINS, isDeckTopicId } from "../../lib/trajectory";
import { useAllDecks } from "../../hooks/useDecks";
import { localDateStr } from "../../lib/date";
import { isFlagOn } from "../../lib/flags";
import {
  alsoWorthDoing,
  chooseTodayScenario,
  recentRoughTest,
} from "../../lib/todayPlan";
import { TodayHero } from "./TodayHero";
import { TodayRail } from "./TodayRail";
import { SessionCompletePanel } from "./SessionCompletePanel";
import text from "../../styles/text.module.css";
import styles from "./today.module.css";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** "Wed 30 Sep" — built from parts so no locale slips in "Sept" or a comma. */
function metaDate(d: Date): string {
  const part = (type: string) =>
    DATE_FORMAT.formatToParts(d).find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")}`;
}

/* Today answers one question — what should I do now? — with one button.
 * Headline and lead card (TodayHero), up to three rows of "also worth doing",
 * and a rail of context. Everything else the old Today stacked here (due
 * tasks, next exam, notebook shelf, resume card) folds into those three. */
export function TodayView() {
  const navigate = useNavigate();
  const auth = useOptionalAuth();
  const { openCreateModal } = useCreateModal();
  const {
    prepareFocus,
    start,
    state: timerState,
    completedFocus: completed,
    dismissCompletedFocus,
  } = useTimer();
  const { exam, forecast, needsMaterial, isPending } = useTrajectory();
  const { snapshot } = useContinuity();
  const { ranked: misconceptions } = useMisconceptions();
  const attempts = useQuizAttempts();
  const tasks = useTasks();
  const sessions = useSessionsSince(7);
  const dueCount = useFlashcardsDueCount();
  /* Behind on this week's plan → a "Rebalance" row (read-only; the plan
     page previews and applies). */
  const planDeficit = useThisWeekDeficit();
  const [shortOnTime, setShortOnTime] = useState(false);

  const now = useMemo(() => new Date(), []);
  const today = localDateStr(now);
  const firstName =
    (auth?.user?.user_metadata?.full_name as string | undefined)
      ?.trim()
      .split(/\s+/)[0] || undefined;

  /* How many cards the top topic's deck owes right now. `useTrajectory` has
     already fetched the cards, so this is a cache read. */
  const cards = useFlashcards();
  const decks = useAllDecks();
  const topDeckId = forecast?.interventions[0]?.topicId;
  const topDeckDue = useMemo(
    () =>
      topDeckId
        ? dueCardsFrom((cards.data ?? []).filter((c) => c.deck_id === topDeckId))
            .length
        : 0,
    [cards.data, topDeckId],
  );
  const totalDue = dueCount.data ?? 0;

  const session =
    snapshot.lastStudySession && snapshot.lastStudySession.status !== "done"
      ? snapshot.lastStudySession
      : null;
  useRemoteSessionResume(Boolean(session));
  const rough = useMemo(
    () => recentRoughTest(attempts.data ?? [], misconceptions, now),
    [attempts.data, misconceptions, now],
  );

  const scenario = chooseTodayScenario({
    now,
    shortOnTime,
    session,
    attempts: attempts.data ?? [],
    misconceptions,
    hasExam: Boolean(exam),
    needsMaterial: needsMaterial || (Boolean(exam) && !forecast),
    forecast,
    dueCards: totalDue,
    tasks: tasks.data ?? [],
  });

  const rows = alsoWorthDoing({
    dueCards: totalDue,
    forecast,
    tasks: tasks.data ?? [],
    today,
    exclude: scenario === "short" ? ["cards", "fading"] : [],
    planBehindMins: planDeficit?.isBehind ? planDeficit.totalMissedMinutes : 0,
  });

  const studiedDates = useMemo(() => {
    const dates = new Set<string>();
    for (const s of sessions.data ?? []) {
      dates.add(localDateStr(new Date(s.started_at ?? s.created_at)));
    }
    for (const a of attempts.data ?? []) {
      dates.add(localDateStr(new Date(a.created_at)));
    }
    return dates;
  }, [sessions.data, attempts.data]);

  const daysToExam = forecast?.daysRemaining;

  return (
    <div className={styles.page}>
      <div className={styles.main}>
        <p className={text.meta}>
          {metaDate(now)}
          {exam && daysToExam !== undefined
            ? ` · ${exam.exam_name} in ${daysToExam} ${daysToExam === 1 ? "day" : "days"}`
            : ""}
        </p>
        <TodayHero
          exam={exam}
          forecast={forecast}
          needsMaterial={needsMaterial}
          isPending={isPending}
          dueCards={topDeckDue}
          totalDue={totalDue}
          firstName={firstName}
          session={session}
          rough={rough}
          shortOnTime={shortOnTime}
          onShortOnTime={setShortOnTime}
          now={now}
          onCreate={() =>
            openCreateModal({ type: "material", outputs: { flashcards: true } })
          }
          onStart={(topicId, label, minutes = INTERVENTION_BLOCK_MINS) => {
            /* The block's subject comes from its deck. It was left out, so a
               block on a Biology deck was saved with no subject and never
               counted toward Biology's study time (4 of 6 production
               sessions in September had none). A quiz-only topic has no
               deck to pass. */
            const deckId = isDeckTopicId(topicId) ? topicId : undefined;
            const folderId = deckId
              ? (decks.data ?? []).find((d) => d.id === deckId)?.folder_id ?? null
              : null;
            prepareFocus(minutes, label, folderId, deckId);
            /* The button says "Start"; landing on a stopped clock and needing
               a second Start was the gap this screen exists to close. */
            if (!timerState.isRunning) start();
            void navigate("/timer");
          }}
        />
        <MistakeLoopSection misconceptions={misconceptions} now={now} />
        {completed ? (
          <SessionCompletePanel session={completed} onClose={dismissCompletedFocus} />
        ) : null}
        {!isPending && rows.length > 0 ? (
          <section aria-labelledby="today-also">
            <h2 id="today-also" className={styles.sectionTitle}>
              Also worth doing today
            </h2>
            <ul className={styles.rows}>
              {rows.map((row) => (
                <li key={row.id} className={styles.row}>
                  <span className={styles.dot} data-kind={row.kind} aria-hidden="true" />
                  <span className={styles.rowLabel}>
                    {row.kind === "recall" ? (
                      <span className={styles.srOnly}>Memory: </span>
                    ) : null}
                    {row.label}
                  </span>
                  <span className={styles.rowEstimate}>{row.estimate}</span>
                  <Link
                    to={row.to}
                    className={styles.rowAction}
                    aria-label={`${row.action}: ${row.label}`}
                  >
                    {row.action}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
      {!isPending ? (
        <TodayRail
          exam={exam}
          topics={forecast?.topics ?? []}
          studiedDates={studiedDates}
          showWeek={isFlagOn("weeklyGoal")}
          now={now}
        />
      ) : null}
    </div>
  );
}
