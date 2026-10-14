import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useTimer } from "../../context/timer";
import { useOptionalAuth } from "../../context/auth";
import { useCreateModal } from "../../context/createModal";
import { useTrajectory } from "../../hooks/useTrajectory";
import {
  useFlashcards,
  useFlashcardsDueCount,
} from "../../hooks/useFlashcards";
import { useContinuity } from "../../hooks/useContinuity";
import { useRemoteSessionResume } from "../../hooks/useRemoteSessionResume";
import { useMisconceptions } from "../../hooks/useMisconceptions";
import { MistakeLoopSection } from "./MistakeLoopSection";
import { nextCheckBack } from "../../lib/checkBack";
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
import { Skeleton } from "../../components/Skeleton";
import styles from "./today.module.css";

/** Away this long, Today greets you back instead of saying good morning. */
export const WELCOME_BACK_DAYS = 7;

/** "Morning, Maya." / "Welcome back, Priya." — the 1c greeting. */
export function greetingFor(
  now: Date,
  firstName?: string,
  welcomeBack = false,
): string {
  const hour = now.getHours();
  const word = welcomeBack
    ? "Welcome back"
    : hour < 12
      ? "Morning"
      : hour < 18
        ? "Afternoon"
        : "Evening";
  return firstName ? `${word}, ${firstName}.` : `${word}.`;
}

/* Today answers one question — what should I do now? — with one button
 * (design 1c). A greeting, one next-step card (TodayHero), the mistake loop,
 * and a rail of what comes later. Readiness lives on Progress, not here. */
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
  const { ranked: misconceptions, isPending: mistakesPending } =
    useMisconceptions();
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
        ? dueCardsFrom(
            (cards.data ?? []).filter((c) => c.deck_id === topDeckId),
          ).length
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
  const checkBack = useMemo(() => nextCheckBack(misconceptions, now), [misconceptions, now]);

  /* Back after a break: something studied before, nothing in the last week.
     Greets the student back with no catching up — never an overdue count. */
  const welcomeBack = useMemo(() => {
    if (sessions.isPending || attempts.isPending) return false;
    if ((sessions.data ?? []).length > 0) return false;
    const cutoff = now.getTime() - WELCOME_BACK_DAYS * 86_400_000;
    const times = [
      ...(attempts.data ?? []).map((a) => new Date(a.created_at).getTime()),
      ...(snapshot.lastStudySession?.lastActiveAt
        ? [new Date(snapshot.lastStudySession.lastActiveAt).getTime()]
        : []),
    ];
    return times.length > 0 && times.every((t) => t < cutoff);
  }, [
    sessions.isPending,
    sessions.data,
    attempts.isPending,
    attempts.data,
    snapshot,
    now,
  ]);

  return (
    <div className={styles.page}>
      <div className={styles.main}>
        <header className={styles.greetingBlock}>
          {exam && daysToExam !== undefined ? (
            <span className={styles.examPill}>
              {exam.exam_name} in {daysToExam}{" "}
              {daysToExam === 1 ? "day" : "days"}
            </span>
          ) : null}
          <h1 className={styles.greeting}>
            {greetingFor(now, firstName, welcomeBack)}
          </h1>
          {welcomeBack ? (
            <p className={styles.greetingSub}>No catching up needed.</p>
          ) : null}
        </header>
        <TodayHero
          exam={exam}
          forecast={forecast}
          needsMaterial={needsMaterial}
          isPending={isPending}
          dueCards={topDeckDue}
          totalDue={totalDue}
          session={session}
          checkBack={checkBack}
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
              ? ((decks.data ?? []).find((d) => d.id === deckId)?.folder_id ??
                null)
              : null;
            prepareFocus(minutes, label, folderId, deckId);
            /* The button says "Start"; landing on a stopped clock and needing
               a second Start was the gap this screen exists to close. */
            if (!timerState.isRunning) start();
            void navigate("/timer");
          }}
        />
        <MistakeLoopSection
          misconceptions={misconceptions}
          now={now}
          leadId={checkBack?.id}
        />
        {completed ? (
          <SessionCompletePanel
            session={completed}
            onClose={dismissCompletedFocus}
          />
        ) : null}
      </div>
      {isPending ? (
        <div className={styles.rail} aria-hidden="true">
          <Skeleton height={121} radius="var(--radius-md)" />
        </div>
      ) : (
        <TodayRail
          rows={rows}
          hasMistakes={mistakesPending || misconceptions.length > 0}
          studiedDates={studiedDates}
          showWeek={isFlagOn("weeklyGoal")}
          now={now}
        />
      )}
    </div>
  );
}
