import { useMemo } from "react";
import { Link } from "react-router";
import { CaptureBar } from "../../components/capture/CaptureBar";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { ListRow, ListRows } from "../../components/ListRow";
import { ProgressRing } from "../../components/ProgressRing";
import { SectionHeader } from "../../components/SectionHeader";
import { Skeleton } from "../../components/Skeleton";
import { useTimer } from "../../context/timer";
import { useContinuity } from "../../hooks/useContinuity";
import { useExams } from "../../hooks/useExams";
import { useFlashcards, useFlashcardsDueCount } from "../../hooks/useFlashcards";
import { useFolders } from "../../hooks/useFolders";
import { useMaterials } from "../../hooks/useMaterials";
import { useMisconceptions } from "../../hooks/useMisconceptions";
import { isLoopSupported } from "../../api/misconceptions";
import { localDateStr } from "../../lib/date";
import { progressByLesson } from "../../lib/lessons";
import { needsRepair, retestsDue } from "../../lib/mistakeLoop";
import { daysUntil } from "../../lib/quizForecast";
import { MistakeLoopSection } from "../today/MistakeLoopSection";
import { LessonRows } from "../lesson/LessonRows";
import { SessionCompletePanel } from "../today/SessionCompletePanel";
import { TypingHeading } from "./TypingHeading";
import styles from "./home.module.css";

/* Home (DESIGN.md rule 0.1). One question and one box to add something, then
 * where you left off, then what to fix before your exam, then your lessons.
 * Nothing else: the week plan lives with its subject, the timer in the top
 * bar, history in Progress. */

const LESSON_LIMIT = 8;

export function HomeView() {
  const now = useMemo(() => new Date(), []);
  const { resumeAction } = useContinuity();
  const { completedFocus, dismissCompletedFocus } = useTimer();
  const materials = useMaterials();
  const folders = useFolders();
  const cards = useFlashcards();
  const { data: dueCount = 0 } = useFlashcardsDueCount();
  const { ranked: misconceptions } = useMisconceptions();
  const exams = useExams();

  const progress = useMemo(() => progressByLesson(cards.data ?? []), [cards.data]);

  const today = localDateStr(now);
  const nextExam = useMemo(() => {
    const upcoming = (exams.data ?? [])
      .filter((e) => e.exam_date >= today)
      .sort((a, b) => a.exam_date.localeCompare(b.exam_date));
    return upcoming[0] ?? null;
  }, [exams.data, today]);
  const examDays = nextExam ? daysUntil(nextExam.exam_date, today) : null;

  const hasMistakes =
    isLoopSupported() &&
    (retestsDue(misconceptions, now).length > 0 ||
      misconceptions.some((m) => needsRepair(m) && (m.repairText || m.catalogueId)));
  const showFix = dueCount > 0 || hasMistakes;

  const lessons = (materials.data ?? []).slice(0, LESSON_LIMIT);

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="home-title">
        <TypingHeading id="home-title" />
        <CaptureBar
          size="lg"
          ruled={false}
          placeholder="Write a topic, or paste your notes or a link"
        />
        {resumeAction ? (
          <Link to={resumeAction.targetUrl} className={styles.resume}>
            <ProgressRing
              size="sm"
              value={
                resumeAction.progressPercentage !== null && resumeAction.progressPercentage > 0
                  ? resumeAction.progressPercentage / 100
                  : null
              }
              label={
                resumeAction.progressPercentage === null
                  ? "Progress not measured"
                  : `${resumeAction.progressPercentage}% through`
              }
            />
            <span className={styles.resumeTitle}>{resumeAction.title}</span>
            {resumeAction.subtitle ? (
              <span className={styles.resumeMeta}>{resumeAction.subtitle}</span>
            ) : null}
            <span className={styles.resumeAction}>
              Jump back in
              <Icon name="chevron-down" size={14} className={styles.arrow} />
            </span>
          </Link>
        ) : null}
      </section>

      {completedFocus ? (
        <SessionCompletePanel session={completedFocus} onClose={dismissCompletedFocus} />
      ) : null}

      {showFix ? (
        <section className={styles.section} aria-labelledby="home-fix">
          <SectionHeader
            id="home-fix"
            title="Fix these"
            action={
              nextExam && examDays !== null ? (
                <span className={styles.exam}>
                  {nextExam.exam_name}{" "}
                  {examDays === 0 ? "is today" : `in ${examDays} ${examDays === 1 ? "day" : "days"}`}
                </span>
              ) : null
            }
          />
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
          <MistakeLoopSection misconceptions={misconceptions} now={now} bare />
        </section>
      ) : null}

      <section className={styles.section} aria-labelledby="home-lessons">
        <SectionHeader
          id="home-lessons"
          title="Lessons"
          action={
            lessons.length > 0 ? (
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
