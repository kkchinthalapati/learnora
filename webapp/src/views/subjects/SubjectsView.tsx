import { useMemo } from "react";
import { Link } from "react-router";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ListRow, ListRows } from "../../components/ListRow";
import { PageHeader } from "../../components/PageHeader";
import { ProgressRing } from "../../components/ProgressRing";
import { SectionHeader } from "../../components/SectionHeader";
import { Skeleton } from "../../components/Skeleton";
import { useCreateModal } from "../../context/createModal";
import { formatMonthDay, parseLocalDate } from "../../lib/date";
import { progressLabel, progressValue } from "../../lib/lessons";
import {
  examCountdown,
  examWhen,
  examsForSubject,
  subjectProgress,
} from "../../lib/subjects";
import { LessonRows } from "../lesson/LessonRows";
import { useSubjectsData } from "./useSubjectsData";
import { WeekBlocks } from "./WeekBlocks";
import styles from "./subjects.module.css";

/* Subjects (webapp/DESIGN.md 0.1): every course you're studying, with its
 * lessons, its next exam and its share of the week. The planner used to be a
 * top-level section of its own; it lives here now — this week's blocks and
 * upcoming exams on this page, the full plan, availability and tasks one
 * link away. */
export function SubjectsView() {
  const { openCreateModal } = useCreateModal();
  const data = useSubjectsData();
  const { folders, lessons, progress, exams, today, weekBlocks: week } = data;

  const unfiled = useMemo(() => lessons.filter((m) => !m.folder_id), [lessons]);
  const upcomingExams = useMemo(
    () => exams.filter((e) => e.exam_date >= today).sort((a, b) => a.exam_date.localeCompare(b.exam_date)),
    [exams, today],
  );

  return (
    <div className={styles.page}>
      <PageHeader
        as="h1"
        title="Subjects"
        sub="Everything you're studying, and what's planned this week."
        actions={
          <Button variant="secondary" onClick={() => openCreateModal({ type: "subject" })}>
            New subject
          </Button>
        }
      />

      <section className={styles.section} aria-labelledby="subjects-list">
        <SectionHeader id="subjects-list" title="Your subjects" />
        {data.isPending ? (
          <div className={styles.skeletons} aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={72} radius="var(--r-lg)" label={i === 0 ? "Loading subjects" : undefined} />
            ))}
          </div>
        ) : data.isError ? (
          <EmptyState icon="alert-circle" title="Your subjects didn't load" message="Check your connection and try again.">
            <Button variant="secondary" onClick={data.retry}>
              Try again
            </Button>
          </EmptyState>
        ) : folders.length === 0 ? (
          <EmptyState
            icon="layers"
            title="No subjects yet"
            message="A subject keeps a course's lessons, exam date and plan together."
          >
            <Button variant="primary" onClick={() => openCreateModal({ type: "subject" })}>
              New subject
            </Button>
          </EmptyState>
        ) : (
          <ListRows label="Your subjects">
            {folders.map((f) => {
              const own = lessons.filter((m) => m.folder_id === f.id);
              const next = examsForSubject(exams, f, folders, today)[0];
              const p = subjectProgress(own, progress);
              return (
                <ListRow
                  key={f.id}
                  icon="layers"
                  tint={f.color}
                  title={f.name}
                  meta={[
                    `${own.length} ${own.length === 1 ? "lesson" : "lessons"}`,
                    next ? examCountdown(next, today) : "No exam date",
                  ].join(" · ")}
                  to={`/subjects/${encodeURIComponent(f.id)}`}
                  trailing={
                    <ProgressRing
                      value={progressValue(p)}
                      label={progressLabel(p)}
                      center={p.total ? String(p.practised) : undefined}
                    />
                  }
                />
              );
            })}
          </ListRows>
        )}
      </section>

      {unfiled.length > 0 ? (
        <section className={styles.section} aria-labelledby="subjects-unfiled">
          <SectionHeader id="subjects-unfiled" title="Not in a subject" />
          <LessonRows lessons={unfiled} progress={progress} folders={folders} showSubject={false} label="Lessons not in a subject" />
        </section>
      ) : null}

      <section className={styles.section} aria-labelledby="subjects-week">
        <SectionHeader
          id="subjects-week"
          title="This week"
          action={
            <Link to="/plan" className={styles.quietLink}>
              Open week plan
            </Link>
          }
        />
        {data.planPending ? (
          <Skeleton height={72} radius="var(--r-lg)" label="Loading this week's plan" />
        ) : week.length > 0 ? (
          <WeekBlocks blocks={week} today={today} showSubject />
        ) : (
          <p className={styles.quiet}>
            Nothing planned for the rest of this week. Add an exam or a task and Learnora fits it into your free time.
          </p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="subjects-exams">
        <SectionHeader
          id="subjects-exams"
          title="Exams"
          action={
            <button type="button" className={styles.quietLink} onClick={() => openCreateModal({ type: "exam" })}>
              Add exam
            </button>
          }
        />
        {upcomingExams.length > 0 ? (
          <ListRows label="Upcoming exams">
            {upcomingExams.map((e) => (
              <ListRow
                key={e.id}
                icon="calendar"
                title={e.exam_name}
                meta={`${formatMonthDay(parseLocalDate(e.exam_date))} · ${examWhen(e, today)}`}
                to={`/exams/${encodeURIComponent(String(e.id))}`}
              />
            ))}
          </ListRows>
        ) : (
          <p className={styles.quiet}>No exams coming up. Add one and the plan works back from it.</p>
        )}
      </section>

      <nav className={styles.more} aria-label="More in Subjects">
        <Link to="/tasks">Tasks</Link>
        <Link to="/my-week">Free time</Link>
        <Link to="/library/flashcards">All card sets</Link>
        <Link to="/library/quizzes">All quizzes</Link>
        <Link to="/library/notebooks">Notebooks</Link>
      </nav>
    </div>
  );
}
