import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ListRow, ListRows } from "../../components/ListRow";
import { PageHeader } from "../../components/PageHeader";
import { SectionHeader } from "../../components/SectionHeader";
import { Skeleton } from "../../components/Skeleton";
import { useCreateModal } from "../../context/createModal";
import { useOptionalTimer } from "../../context/timer";
import { useToast } from "../../context/toast";
import { useAllDecks } from "../../hooks/useDecks";
import { useAllDueFlashcards } from "../../hooks/useFlashcards";
import { useMisconceptions } from "../../hooks/useMisconceptions";
import { useNotebooks } from "../../hooks/useNotebooks";
import { useQuizzes } from "../../hooks/useQuizzes";
import { formatMonthDay, parseLocalDate } from "../../lib/date";
import { habitHref, habitSentence, habitsForStudent, habitsForSubject } from "../../lib/errorHabits";
import { mistakeTitle } from "../../lib/mistakeLoop";
import { useDocumentTitle } from "../../lib/routeTitle";
import { blocksForSubject, examCountdown, examsForSubject, examWhen } from "../../lib/subjects";
import { LessonRows } from "../lesson/LessonRows";
import { useLibraryActions } from "../library/useLibraryActions";
import { useSubjectsData } from "./useSubjectsData";
import { WeekBlocks } from "./WeekBlocks";
import styles from "./subjects.module.css";

/* One subject (webapp/DESIGN.md 0.1): its next exam, its share of this
 * week's plan, its lessons, and the mistakes recorded in it. Replaces the
 * folder workspace, which listed materials, notebooks, decks and quizzes as
 * four separate panels with their own buttons. */
export function SubjectView() {
  const { folderId = "" } = useParams();
  const navigate = useNavigate();
  const { openCreateModal } = useCreateModal();
  const timer = useOptionalTimer();
  const { showToast } = useToast();
  const { rename, removeFolder } = useLibraryActions();
  const data = useSubjectsData();
  const decks = useAllDecks();
  const quizzes = useQuizzes();
  const dueCards = useAllDueFlashcards(200);
  const { notebooks } = useNotebooks();
  const { forSubject, all: ledger } = useMisconceptions();

  const { folders, lessons: allLessons, progress, exams, today, weekBlocks } = data;
  const folder = folders.find((f) => f.id === folderId) ?? null;
  useDocumentTitle(folder?.name ?? null);

  const lessons = useMemo(() => allLessons.filter((m) => m.folder_id === folderId), [allLessons, folderId]);
  const nextExams = useMemo(
    () => (folder ? examsForSubject(exams, folder, folders, today) : []),
    [exams, folder, folders, today],
  );
  const week = useMemo(() => (folder ? blocksForSubject(weekBlocks, folder) : []), [weekBlocks, folder]);
  const mistakes = useMemo(
    () => (folder ? forSubject(folder.name).filter((m) => m.status !== "resolved") : []),
    [folder, forSubject],
  );
  /* The same kind of mistake as in another subject (lib/errorHabits.ts). */
  const habits = useMemo(
    () => (folder ? habitsForSubject(habitsForStudent(ledger), folder.name) : []),
    [folder, ledger],
  );
  const folderDecks = useMemo(() => (decks.data ?? []).filter((d) => d.folder_id === folderId), [decks.data, folderId]);
  const due = useMemo(() => {
    const ids = new Set(folderDecks.map((d) => d.id));
    return (dueCards.data ?? []).filter((c) => c.deck_id && ids.has(c.deck_id));
  }, [dueCards.data, folderDecks]);
  /* Card sets and quizzes filed in this subject but not made from one of its
     lessons — a deck exported from a Teach session, a quiz on a topic. */
  const looseQuizzes = useMemo(
    () => (quizzes.data ?? []).filter((q) => q.folder_id === folderId && !q.material_id),
    [quizzes.data, folderId],
  );
  const folderNotebooks = useMemo(
    () => notebooks.filter((nb) => nb.folderId === folderId),
    [notebooks, folderId],
  );

  if (data.isPending) {
    return (
      <div className={styles.page} aria-busy="true">
        <Skeleton height={44} width="40%" label="Loading subject" />
        <Skeleton height={200} radius="var(--r-lg)" />
      </div>
    );
  }
  if (!folder) {
    return (
      <div className={styles.page}>
        <PageHeader
          as="h1"
          title="This subject isn't here"
          sub="It may have been deleted, or the link is from another account."
          actions={
            <Link to="/subjects" className={styles.quietLink}>
              All subjects
            </Link>
          }
        />
      </div>
    );
  }

  const next = nextExams[0] ?? null;
  const startFocus = () => {
    timer?.prepareFocus(25, folder.name, folder.id);
    showToast(`25-minute focus ready for ${folder.name}.`);
    void navigate("/timer");
  };

  return (
    <div className={styles.page}>
      <PageHeader
        as="h1"
        title={folder.name}
        sub={
          <span className={styles.meta}>
            {lessons.length} {lessons.length === 1 ? "lesson" : "lessons"}
            {" · "}
            {next ? examCountdown(next, today) : "No exam date"}
          </span>
        }
        actions={
          <div className={styles.headerActions}>
            {timer ? (
              <Button variant="secondary" onClick={startFocus}>
                Focus 25 min
              </Button>
            ) : null}
            <Button
              variant="primary"
              onClick={() => void navigate(`/study?topic=${encodeURIComponent(folder.name)}`)}
            >
              Start session
            </Button>
          </div>
        }
      />

      <section className={styles.section} aria-labelledby="subject-exam">
        <SectionHeader
          id="subject-exam"
          title="Exam"
          action={
            <button type="button" className={styles.quietLink} onClick={() => openCreateModal({ type: "exam" })}>
              Add exam
            </button>
          }
        />
        {nextExams.length > 0 ? (
          <ListRows label={`Exams in ${folder.name}`}>
            {nextExams.map((e) => (
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
          <p className={styles.quiet}>No exam date for {folder.name}. Add one and the plan works back from it.</p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="subject-week">
        <SectionHeader
          id="subject-week"
          title="This week"
          action={
            <Link to="/plan" className={styles.quietLink}>
              Open week plan
            </Link>
          }
        />
        {week.length > 0 ? (
          <WeekBlocks blocks={week} today={today} showSubject={false} />
        ) : (
          <p className={styles.quiet}>Nothing planned for {folder.name} for the rest of this week.</p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="subject-lessons">
        <SectionHeader
          id="subject-lessons"
          title="Lessons"
          action={
            <button
              type="button"
              className={styles.quietLink}
              onClick={() => openCreateModal({ folderId: folder.id, type: "material" })}
            >
              Add a lesson
            </button>
          }
        />
        {due.length > 0 ? (
          <div className={styles.dueRow}>
            <ListRows label="Cards due">
              <ListRow
                icon="layers"
                title={`${due.length} ${due.length === 1 ? "card" : "cards"} due`}
                meta={`Review what's due in ${folder.name}`}
                to={`/review/${encodeURIComponent(due[0].deck_id as string)}`}
              />
            </ListRows>
          </div>
        ) : null}
        {lessons.length > 0 ? (
          <LessonRows lessons={lessons} progress={progress} folders={folders} showSubject={false} label={`Lessons in ${folder.name}`} />
        ) : (
          <EmptyState
            icon="book-open"
            title="No lessons yet"
            message={`Add a file, link, your notes or a topic and it becomes a lesson in ${folder.name}.`}
          >
            <Button variant="primary" onClick={() => openCreateModal({ folderId: folder.id, type: "material" })}>
              Add a lesson
            </Button>
          </EmptyState>
        )}
      </section>

      {mistakes.length + habits.length > 0 ? (
        <section className={styles.section} aria-labelledby="subject-mistakes">
          <SectionHeader id="subject-mistakes" title="Mistakes" />
          <ListRows label={`Mistakes in ${folder.name}`}>
            {mistakes.slice(0, 5).map((m) => (
              <ListRow
                key={m.id}
                icon="target"
                title={mistakeTitle(m)}
                meta={`Seen ${m.timesObserved} ${m.timesObserved === 1 ? "time" : "times"}`}
                chevron={false}
              />
            ))}
            {habits.map((h) => (
              <ListRow
                key={h.habit.slug}
                icon="target"
                title={h.habit.name}
                meta={habitSentence(h)}
                to={habitHref(h.habit)}
              />
            ))}
          </ListRows>
        </section>
      ) : null}

      {folderDecks.length + looseQuizzes.length + folderNotebooks.length > 0 ? (
        <section className={styles.section} aria-labelledby="subject-more">
          <SectionHeader id="subject-more" title="Also in this subject" />
          <ListRows label={`Also in ${folder.name}`}>
            {folderDecks.map((d) => (
              <ListRow key={d.id} icon="layers" title={d.title} meta="Card set" to={`/review/${encodeURIComponent(d.id)}`} />
            ))}
            {looseQuizzes.map((q) => (
              <ListRow key={q.id} icon="check-square" title={q.title} meta="Quiz" to={`/quiz/${encodeURIComponent(q.id)}`} />
            ))}
            {folderNotebooks.map((nb) => (
              <ListRow key={nb.id} icon="book-open" title={nb.title} meta="Notebook" to={`/notebooks/${encodeURIComponent(nb.id)}`} />
            ))}
          </ListRows>
        </section>
      ) : null}

      <div className={styles.more}>
        <button type="button" className={styles.quietLink} onClick={() => void rename(folder.id, folder.name)}>
          Rename subject
        </button>
        <button
          type="button"
          className={`${styles.quietLink} ${styles.danger}`}
          onClick={() =>
            void removeFolder(folder.id, folder.name).then((gone) => {
              if (gone) void navigate("/subjects");
            })
          }
        >
          Delete subject
        </button>
      </div>
    </div>
  );
}
