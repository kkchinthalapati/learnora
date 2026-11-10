import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { ButtonLink } from "../../components/ButtonLink";
import { CaptureBar } from "../../components/capture/CaptureBar";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { ListRow, ListRows } from "../../components/ListRow";
import { ProgressRing } from "../../components/ProgressRing";
import { SectionHeader } from "../../components/SectionHeader";
import { Skeleton } from "../../components/Skeleton";
import { useOptionalAuth } from "../../context/auth";
import { useTimer } from "../../context/timer";
import { useContinuity } from "../../hooks/useContinuity";
import { useExams } from "../../hooks/useExams";
import { useFlashcards, useFlashcardsDueCount } from "../../hooks/useFlashcards";
import { useFolders } from "../../hooks/useFolders";
import { useMaterials } from "../../hooks/useMaterials";
import { useMisconceptions } from "../../hooks/useMisconceptions";
import { isLoopSupported } from "../../api/misconceptions";
import {
  activityHref,
  examContext,
  planSession,
  resolveFocus,
  startRun,
} from "../../lib/adaptiveSession";
import { activePairs, loadPairState, nextDuePair, tellApartHref } from "../../lib/confusionPairs";
import { localDateStr } from "../../lib/date";
import { homeGreeting } from "../../lib/greeting";
import { homeSubjects, nextLessonLink, todayView } from "../../lib/homeToday";
import { learnPositionLabel, readLearnPosition } from "../../lib/learnPosition";
import { progressByLesson } from "../../lib/lessons";
import { needsRepair, retestsDue } from "../../lib/mistakeLoop";
import { daysUntil } from "../../lib/quizForecast";
import { MistakeLoopSection } from "../today/MistakeLoopSection";
import { LessonRows } from "../lesson/LessonRows";
import { SessionCompletePanel } from "../today/SessionCompletePanel";
import styles from "./home.module.css";

/* Home (DESIGN.md rule 0.1): the student's own space, read top to bottom as
 * a greeting, where they left off, what today holds, a box to add something,
 * then their subjects and lessons.
 *
 * "Today" is the way into the adaptive session (lib/adaptiveSession, the
 * engine behind /study): what it says and where Start goes are decided in
 * lib/homeToday from real rows only. Nothing here is a percentage or a
 * chart; history and the ledger in full live on Progress. */

const LESSON_LIMIT = 6;

export function HomeView() {
  const now = useMemo(() => new Date(), []);
  const navigate = useNavigate();
  const auth = useOptionalAuth();
  const { resumeAction, snapshot } = useContinuity();
  const { completedFocus, dismissCompletedFocus } = useTimer();
  const materials = useMaterials();
  const folders = useFolders();
  const cards = useFlashcards();
  const due = useFlashcardsDueCount();
  const dueCount = due.data ?? 0;
  const { ranked: misconceptions, all: ledger, isPending: ledgerPending } = useMisconceptions();
  const exams = useExams();

  const progress = useMemo(() => progressByLesson(cards.data ?? []), [cards.data]);
  const today = localDateStr(now);

  /* An email's local part is not a name: with none saved, greet without one. */
  const name = ((auth?.user?.user_metadata?.full_name as string | undefined) ?? "").trim();

  const nextExam = useMemo(() => {
    const upcoming = (exams.data ?? [])
      .filter((e) => e.exam_date >= today)
      .sort((a, b) => a.exam_date.localeCompare(b.exam_date));
    return upcoming[0] ?? null;
  }, [exams.data, today]);
  const examDays = nextExam ? daysUntil(nextExam.exam_date, today) : null;

  /* What is due from the ledger: check-backs, repairs waiting to be read,
     and a pair of ideas due a side-by-side sort (one at a time). */
  const loop = isLoopSupported();
  const dueIdeas = useMemo(() => {
    if (!loop) return 0;
    const retests = retestsDue(misconceptions, now).length;
    const repairs = misconceptions.filter((m) => needsRepair(m) && (m.repairText || m.catalogueId)).length;
    return retests + repairs;
  }, [loop, misconceptions, now]);
  const duePair = useMemo(
    () => nextDuePair(activePairs(ledger), loadPairState(), now),
    [ledger, now],
  );
  const showRows = dueCount > 0 || dueIdeas > 0 || duePair !== null;

  /* The adaptive session, exactly as /study would start it. */
  const exam = useMemo(() => examContext(exams.data, folders.data), [exams.data, folders.data]);
  const focus = useMemo(() => resolveFocus({ ranked: misconceptions, exam }), [misconceptions, exam]);
  const plan = useMemo(
    () => (focus ? planSession({ focus, ranked: misconceptions, dueCards: dueCount, exam }) : []),
    [focus, misconceptions, dueCount, exam],
  );
  const startSession = () => {
    if (!focus || !plan[0]) return;
    const run = startRun(focus, plan[0]);
    void navigate(activityHref(plan[0], run.id));
  };

  const allLessons = useMemo(() => materials.data ?? [], [materials.data]);
  const lessons = allLessons.slice(0, LESSON_LIMIT);
  const subjects = useMemo(
    () =>
      homeSubjects({
        folders: folders.data ?? [],
        lessons: allLessons,
        progress,
        exams: exams.data ?? [],
        today,
      }),
    [folders.data, allLessons, progress, exams.data, today],
  );

  const todayLoading = due.isPending || ledgerPending || exams.isPending || materials.isPending;
  const view = todayView({
    dueCards: dueCount,
    dueIdeas: dueIdeas + (duePair ? 1 : 0),
    sessionTopic: focus && plan.length > 0 ? focus.topic : null,
    pairHref: duePair ? tellApartHref(duePair.pair.id) : null,
    hasResume: resumeAction !== null,
    nextLesson: nextLessonLink(allLessons, progress),
    hasLessons: allLessons.length > 0,
  });

  /* The continue row. A lesson says which subject it is in and which part
     of Learn the student reached on this device, when either is known. */
  const resumeLesson = resumeAction?.type === "material" ? (snapshot.lastOpenedMaterial ?? null) : null;
  const resumePosition = resumeLesson ? readLearnPosition(resumeLesson.id) : null;
  const resumeSubject = resumeLesson?.folderId
    ? ((folders.data ?? []).find((f) => f.id === resumeLesson.folderId)?.name ?? "")
    : "";
  const resumeMeta = resumeAction
    ? resumeLesson
      ? [resumeSubject, learnPositionLabel(resumePosition) || resumeAction.subtitle].filter(Boolean).join(" · ")
      : resumeAction.subtitle
    : "";
  const resumeRing =
    resumePosition?.state === "started"
      ? { value: (resumePosition.part - 1) / resumePosition.total, label: learnPositionLabel(resumePosition) }
      : resumePosition?.state === "finished"
        ? { value: 1, label: learnPositionLabel(resumePosition) }
        : resumeAction && resumeAction.progressPercentage !== null && resumeAction.progressPercentage > 0
          ? { value: resumeAction.progressPercentage / 100, label: `${resumeAction.progressPercentage}% through` }
          : { value: null, label: "Progress not measured" };

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <h1 className={styles.title}>{homeGreeting(name, now)}</h1>
        {nextExam && examDays !== null ? (
          <p className={styles.sub}>
            {nextExam.exam_name}{" "}
            {examDays === 0 ? "is today" : `is in ${examDays} ${examDays === 1 ? "day" : "days"}`}.
          </p>
        ) : null}
      </header>

      {resumeAction ? (
        <section className={styles.section} aria-labelledby="home-continue">
          <SectionHeader id="home-continue" title="Continue" />
          <Link to={resumeAction.targetUrl} className={styles.resume}>
            <ProgressRing size="sm" value={resumeRing.value} label={resumeRing.label} />
            <span className={styles.resumeText}>
              <span className={styles.resumeTitle}>{resumeAction.title}</span>
              {resumeMeta ? <span className={styles.resumeMeta}>{resumeMeta}</span> : null}
            </span>
            <span className={styles.resumeAction}>
              Continue
              <Icon name="chevron-down" size={14} className={styles.arrow} />
            </span>
          </Link>
        </section>
      ) : null}

      {completedFocus ? (
        <SessionCompletePanel session={completedFocus} onClose={dismissCompletedFocus} />
      ) : null}

      <section className={styles.section} aria-labelledby="home-today">
        <SectionHeader id="home-today" title="Today" />
        {todayLoading ? (
          <div aria-busy="true">
            <Skeleton height={28} width="70%" label="Loading today" />
          </div>
        ) : (
          <div className={styles.today}>
            <p className={styles.todayMessage}>{view.message}</p>
            <div className={styles.todayActions}>
              {view.action?.kind === "session" ? (
                <Button variant="primary" onClick={startSession}>
                  {view.action.label}
                </Button>
              ) : view.action?.kind === "link" ? (
                <ButtonLink variant="primary" to={view.action.to}>
                  {view.action.label}
                </ButtonLink>
              ) : null}
              {view.state !== "first" ? (
                <Link to="/study" className={styles.quietLink}>
                  {view.action?.kind === "session" ? "See the session first" : "Plan a study session"}
                </Link>
              ) : null}
            </div>
          </div>
        )}
        {showRows ? (
          <>
            {dueCount > 0 ? (
              <ListRows label="Cards due">
                <ListRow
                  icon="layers"
                  title={`${dueCount} ${dueCount === 1 ? "card" : "cards"} due`}
                  meta="Spaced review across all your lessons"
                  to="/review/daily-drill"
                />
              </ListRows>
            ) : null}
            {duePair ? (
              <ListRows label="Ideas you mix up">
                <ListRow
                  icon="list-checks"
                  title={`Tell ${duePair.pair.a.term.toLowerCase()} and ${duePair.pair.b.term.toLowerCase()} apart`}
                  meta={
                    duePair.kind === "named"
                      ? "You’ve mixed these two up. Two minutes, side by side"
                      : "You’ve slipped on both. Two minutes, side by side"
                  }
                  to={tellApartHref(duePair.pair.id)}
                />
              </ListRows>
            ) : null}
            <MistakeLoopSection misconceptions={misconceptions} now={now} bare />
          </>
        ) : null}
      </section>

      <section className={styles.section} aria-labelledby="home-add">
        <SectionHeader id="home-add" title="Learn something new" />
        <CaptureBar ruled={false} placeholder="Write a topic, or paste your notes or a link" />
      </section>

      {subjects.length > 0 ? (
        <section className={styles.section} aria-labelledby="home-subjects">
          <SectionHeader
            id="home-subjects"
            title="Your subjects"
            action={
              <Link to="/subjects" className={styles.quietLink}>
                All subjects
              </Link>
            }
          />
          <ListRows label="Your subjects">
            {subjects.map((s) => (
              <ListRow
                key={s.id}
                icon="layers"
                tint={s.color}
                title={s.name}
                meta={s.meta}
                to={`/subjects/${encodeURIComponent(s.id)}`}
              />
            ))}
          </ListRows>
        </section>
      ) : null}

      <section className={styles.section} aria-labelledby="home-lessons">
        <SectionHeader
          id="home-lessons"
          title="Recent lessons"
          action={
            lessons.length > 0 && subjects.length === 0 ? (
              <Link to="/subjects" className={styles.quietLink}>
                All subjects
              </Link>
            ) : null
          }
        />
        {materials.isPending ? (
          <div className={styles.skeletons} aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={72} radius="var(--r-lg)" label={i === 0 ? "Loading lessons" : undefined} />
            ))}
          </div>
        ) : materials.isError ? (
          <EmptyState icon="alert-circle" title="Your lessons didn't load" message="Check your connection and try again.">
            <button type="button" className={styles.quietLink} onClick={() => void materials.refetch()}>
              Try again
            </button>
          </EmptyState>
        ) : lessons.length === 0 ? (
          <EmptyState
            icon="book-open"
            title="No lessons yet"
            message="Add a file, a link, your notes or a topic above, and it becomes your first lesson."
          />
        ) : (
          <LessonRows lessons={lessons} progress={progress} folders={folders.data ?? []} />
        )}
      </section>
    </div>
  );
}
