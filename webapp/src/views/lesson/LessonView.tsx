import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ListRow, ListRows } from "../../components/ListRow";
import { PageHeader } from "../../components/PageHeader";
import { ProgressRing } from "../../components/ProgressRing";
import { Skeleton } from "../../components/Skeleton";
import { Tabs, TabPanel, useTabIds, type TabItem } from "../../components/Tabs";
import { useOptionalChat } from "../../context/chat";
import { useToast } from "../../context/toast";
import { useContinuity } from "../../hooks/useContinuity";
import { useAllDecks } from "../../hooks/useDecks";
import { useFlashcards } from "../../hooks/useFlashcards";
import { useFolders } from "../../hooks/useFolders";
import { useMaterial } from "../../hooks/useMaterials";
import { useMisconceptions } from "../../hooks/useMisconceptions";
import { useNotesByMaterial } from "../../hooks/useNotes";
import { useQuizAttempts, useQuizzes } from "../../hooks/useQuizzes";
import { useCreateStudyPackage } from "../../hooks/useStudyPackage";
import { summarizeStudyPackage } from "../../api/studyPackage";
import { formatRelativeTime } from "../../lib/date";
import {
  isPractised,
  lessonIdOfCard,
  lessonTitle,
  lessonTopic,
  progressLabel,
  progressValue,
} from "../../lib/lessons";
import { AiReply } from "../../components/chat/AiReply";
import { LearnPanel } from "./LearnPanel";
import { useDocumentTitle } from "../../lib/routeTitle";
import { mistakeTitle } from "../../lib/mistakeLoop";
import text from "../../styles/text.module.css";
import { isFlagOn } from "../../lib/flags";
import { cardifyNotes } from "../../lib/openui/cardify";
import styles from "./lesson.module.css";

/* A lesson (DESIGN.md rule 0.1): one thing you're learning, and everything
 * made from it in one place — its notes, cards, quiz, a tutor that knows
 * what it's about, and the mistakes recorded in its subject. Before this,
 * those were five lists in five Library tabs and you had to remember which
 * deck came from which upload.
 *
 * Learn is the first tab: everything else here tests or drills what the
 * student already knows, and Learn is where they're taught it first. */

type LessonTab = "learn" | "notes" | "cards" | "quiz" | "tutor" | "mistakes";
const TAB_VALUES: LessonTab[] = ["learn", "notes", "cards", "quiz", "tutor", "mistakes"];

export function LessonView() {
  const { materialId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") as LessonTab | null;
  const tab: LessonTab = tabParam && TAB_VALUES.includes(tabParam) ? tabParam : "learn";
  const setTab = (next: LessonTab) =>
    setSearchParams(next === "learn" ? {} : { tab: next }, { replace: true });
  const idBase = useTabIds();
  const navigate = useNavigate();

  const material = useMaterial(materialId);
  const folders = useFolders();
  const cards = useFlashcards();
  const decks = useAllDecks();
  const quizzes = useQuizzes();
  const attempts = useQuizAttempts();
  const notes = useNotesByMaterial(materialId);
  const { ranked: misconceptions } = useMisconceptions();
  const { recordMaterial } = useContinuity();

  const m = material.data ?? null;
  const subject = m?.folder_id ? (folders.data ?? []).find((f) => f.id === m.folder_id) ?? null : null;
  const title = m ? lessonTitle(m) : "";
  useDocumentTitle(m ? title : null);

  /* "Jump back in" on Home points at the last lesson opened. */
  useEffect(() => {
    if (m) recordMaterial({ id: m.id, title: lessonTitle(m), folderId: m.folder_id });
    // Once per lesson, not on every refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.id]);

  const lessonCards = useMemo(
    () => (cards.data ?? []).filter((c) => lessonIdOfCard(c) === materialId),
    [cards.data, materialId],
  );
  const progress = {
    total: lessonCards.length,
    practised: lessonCards.filter(isPractised).length,
  };
  const lessonDecks = useMemo(() => {
    const byDeck = new Map<string, { total: number; due: number }>();
    const today = new Date().toISOString().slice(0, 10);
    for (const c of lessonCards) {
      if (!c.deck_id) continue;
      const entry = byDeck.get(c.deck_id) ?? { total: 0, due: 0 };
      entry.total += 1;
      if (!c.next_review_date || c.next_review_date.slice(0, 10) <= today) entry.due += 1;
      byDeck.set(c.deck_id, entry);
    }
    return (decks.data ?? [])
      .filter((d) => byDeck.has(d.id))
      .map((d) => ({ deck: d, ...byDeck.get(d.id)! }));
  }, [lessonCards, decks.data]);
  const lessonQuizzes = useMemo(
    () => (quizzes.data ?? []).filter((q) => q.material_id === materialId),
    [quizzes.data, materialId],
  );
  const latestScore = useMemo(() => {
    const out = new Map<string, { score: number; total: number }>();
    const sorted = [...(attempts.data ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const a of sorted) out.set(a.quiz_id, { score: a.score, total: a.total });
    return out;
  }, [attempts.data]);
  const subjectMistakes = useMemo(
    () =>
      subject
        ? misconceptions.filter(
            (x) => x.status !== "resolved" && x.subject.trim().toLowerCase() === subject.name.trim().toLowerCase(),
          )
        : [],
    [misconceptions, subject],
  );
  const dueTotal = lessonDecks.reduce((n, d) => n + d.due, 0);

  if (material.isPending) {
    return (
      <div className={styles.page} aria-busy="true">
        <Skeleton height={44} width="60%" label="Loading lesson" />
        <Skeleton height={20} width="40%" />
        <Skeleton height={240} radius="var(--r-lg)" />
      </div>
    );
  }
  if (!m) {
    return (
      <div className={styles.page}>
        <PageHeader
          as="h1"
          title="This lesson isn't here"
          sub="It may have been deleted, or the link is from another account."
          actions={
            <Link to="/" className={styles.quietLink}>
              Go home
            </Link>
          }
        />
      </div>
    );
  }

  const tabs: ReadonlyArray<TabItem<LessonTab>> = [
    { value: "learn", label: "Learn" },
    { value: "notes", label: "Notes" },
    { value: "cards", label: "Cards", count: dueTotal || undefined },
    { value: "quiz", label: "Quiz" },
    { value: "tutor", label: "Tutor" },
    { value: "mistakes", label: "Mistakes", count: subjectMistakes.length || undefined },
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        as="h1"
        title={title}
        sub={
          <span className={styles.meta}>
            {subject ? (
              <Link to={`/subjects/${encodeURIComponent(subject.id)}`} className={styles.subjectLink}>
                {subject.name}
              </Link>
            ) : (
              "No subject"
            )}
            <span aria-hidden="true"> · </span>
            added {formatRelativeTime(m.created_at)}
          </span>
        }
        actions={
          <div className={styles.headerActions}>
            <ProgressRing value={progressValue(progress)} label={progressLabel(progress)} center={progress.total ? String(progress.practised) : undefined} />
            <Button
              variant="primary"
              onClick={() =>
                void navigate(
                  `/study?topic=${encodeURIComponent(lessonTopic(m, notes.data?.[0]?.markdown_content))}`,
                )
              }
            >
              Start session
            </Button>
          </div>
        }
      />

      <Tabs items={tabs} value={tab} onChange={setTab} label="Parts of this lesson" idBase={idBase} />

      <TabPanel idBase={idBase} value={tab}>
        {tab === "learn" ? (
          <LearnPanel
            materialId={m.id}
            lesson={lessonTopic(m, notes.data?.[0]?.markdown_content)}
            subject={subject?.name ?? null}
            markdown={notes.data?.[0]?.markdown_content ?? ""}
            loading={notes.isPending}
            onOpenTab={setTab}
          />
        ) : tab === "notes" ? (
          <NotesPanel
            materialId={m.id}
            markdown={notes.data?.[0]?.markdown_content ?? ""}
            hasEdited={Boolean(notes.data?.[0]?.html_content)}
            loading={notes.isPending}
          />
        ) : tab === "cards" ? (
          <CardsPanel materialId={m.id} rows={lessonDecks} loading={cards.isPending || decks.isPending} />
        ) : tab === "quiz" ? (
          <QuizPanel
            materialId={m.id}
            quizzes={lessonQuizzes}
            latest={latestScore}
            loading={quizzes.isPending}
          />
        ) : tab === "tutor" ? (
          <TutorPanel title={title} />
        ) : (
          <MistakesPanel subjectName={subject?.name ?? null} rows={subjectMistakes} />
        )}
      </TabPanel>
    </div>
  );
}

function NotesPanel({
  materialId,
  markdown,
  hasEdited,
  loading,
}: {
  materialId: string;
  markdown: string;
  hasEdited: boolean;
  loading: boolean;
}) {
  if (loading) return <Skeleton height={200} radius="var(--r-lg)" label="Loading notes" />;
  if (!markdown.trim()) {
    return (
      <EmptyState
        icon="file-text"
        title={hasEdited ? "Your notes are in the editor" : "No notes yet"}
        message={
          hasEdited
            ? "Open them to read or keep writing."
            : "Notes appear here once they've been written from this lesson."
        }
      >
        <Link to={`/notes/${encodeURIComponent(materialId)}`} className={styles.quietLink}>
          Open the notes editor
        </Link>
      </EmptyState>
    );
  }
  return (
    <div className={styles.notes}>
      <div className={styles.panelBar}>
        <Link to={`/notes/${encodeURIComponent(materialId)}`} className={styles.quietLink}>
          Edit notes
        </Link>
      </div>
      <article className={`${text.prose} ${styles.prose}`}>
        <AiReply text={isFlagOn("openUi") ? cardifyNotes(markdown) : markdown} notes />
      </article>
    </div>
  );
}

/* "Make cards" / "Make a quiz" from a lesson that has none: the same
   pipeline the capture box uses, reading the lesson's own notes. */
function useMakeFromLesson(materialId: string) {
  const create = useCreateStudyPackage();
  const { showToast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const make = async (output: "flashcards" | "quiz") => {
    setError(null);
    try {
      const result = await create.mutateAsync({
        source: { kind: "material", materialId },
        outputs: { notes: false, flashcards: output === "flashcards", quiz: output === "quiz" },
      });
      const summary = summarizeStudyPackage(result);
      if (summary) showToast(summary);
      else setError(result.failures[0]?.message ?? "Nothing could be made this time. Try again in a moment.");
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "Something went wrong. Try again.");
    }
  };
  return { make, busy: create.isPending, error };
}

function CardsPanel({
  materialId,
  rows,
  loading,
}: {
  materialId: string;
  rows: Array<{ deck: { id: string; title: string }; total: number; due: number }>;
  loading: boolean;
}) {
  const { make, busy, error } = useMakeFromLesson(materialId);
  if (loading) return <Skeleton height={72} radius="var(--r-lg)" label="Loading cards" />;
  if (rows.length === 0) {
    return (
      <EmptyState icon="layers" title="No cards yet" message="Make a set of cards from this lesson's notes.">
        <Button variant="primary" busy={busy} onClick={() => void make("flashcards")}>
          {busy ? "Making cards" : "Make cards"}
        </Button>
        {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      </EmptyState>
    );
  }
  return (
    <ListRows label="Card sets">
      {rows.map(({ deck, total, due }) => (
        <ListRow
          key={deck.id}
          icon="layers"
          title={deck.title}
          meta={`${total} ${total === 1 ? "card" : "cards"}${due ? ` · ${due} due` : " · none due"}`}
          to={`/review/${encodeURIComponent(deck.id)}`}
          trailing={
            <Link to={`/decks/${encodeURIComponent(deck.id)}`} className={styles.quietLink}>
              Edit
            </Link>
          }
        />
      ))}
    </ListRows>
  );
}

function QuizPanel({
  materialId,
  quizzes,
  latest,
  loading,
}: {
  materialId: string;
  quizzes: Array<{ id: string; title: string; created_at: string }>;
  latest: Map<string, { score: number; total: number }>;
  loading: boolean;
}) {
  const { make, busy, error } = useMakeFromLesson(materialId);
  if (loading) return <Skeleton height={72} radius="var(--r-lg)" label="Loading quizzes" />;
  if (quizzes.length === 0) {
    return (
      <EmptyState icon="check-square" title="No quiz yet" message="Make a quiz from this lesson to see what's stuck.">
        <Button variant="primary" busy={busy} onClick={() => void make("quiz")}>
          {busy ? "Making a quiz" : "Make a quiz"}
        </Button>
        {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      </EmptyState>
    );
  }
  return (
    <ListRows label="Quizzes">
      {quizzes.map((q) => {
        const last = latest.get(q.id);
        return (
          <ListRow
            key={q.id}
            icon="check-square"
            title={q.title}
            meta={last ? `Last score ${last.score} of ${last.total}` : "Not taken yet"}
            to={`/quiz/${encodeURIComponent(q.id)}`}
            trailing={
              last ? (
                <ProgressRing
                  value={last.total ? last.score / last.total : null}
                  label={`Last score ${last.score} of ${last.total}`}
                  center={String(last.score)}
                />
              ) : undefined
            }
          />
        );
      })}
    </ListRows>
  );
}

function TutorPanel({ title }: { title: string }) {
  const chat = useOptionalChat();
  const prompts = [
    `Explain the main idea of "${title}" simply.`,
    `Ask me three questions to check I understand "${title}".`,
    `What do students usually get wrong about "${title}"?`,
  ];
  if (!chat) {
    return <EmptyState icon="sparkles" message="The tutor isn't available here." />;
  }
  return (
    <div className={styles.tutor}>
      <p className={styles.tutorLead}>Ask the tutor about this lesson. Pick a start, or write your own.</p>
      <ul className={styles.prompts}>
        {prompts.map((p) => (
          <li key={p}>
            <button type="button" className={styles.prompt} onClick={() => chat.compose(p)}>
              {p}
            </button>
          </li>
        ))}
      </ul>
      <Button variant="secondary" onClick={() => chat.open()}>
        Open the tutor
      </Button>
    </div>
  );
}

function MistakesPanel({
  subjectName,
  rows,
}: {
  subjectName: string | null;
  rows: Array<{ id: string; concept: string; summary: string; timesObserved: number } & Parameters<typeof mistakeTitle>[0]>;
}) {
  if (!subjectName) {
    return (
      <EmptyState
        icon="target"
        title="No subject for this lesson"
        message="Mistakes are tracked by subject. Put this lesson in a subject to see them here."
      />
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="check-circle"
        title={`Nothing to fix in ${subjectName}`}
        message="Mistakes from your quizzes and sessions in this subject will show up here."
      />
    );
  }
  return (
    <>
      <p className={styles.scopeNote}>Open mistakes in {subjectName}, most important first.</p>
      <ListRows label={`Mistakes in ${subjectName}`}>
        {rows.slice(0, 10).map((x) => (
          <ListRow
            key={x.id}
            icon="target"
            title={mistakeTitle(x)}
            meta={`Seen ${x.timesObserved} ${x.timesObserved === 1 ? "time" : "times"}`}
            chevron={false}
          />
        ))}
      </ListRows>
    </>
  );
}
