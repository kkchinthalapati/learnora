import { Link, useParams } from "react-router";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { SectionHeader } from "../../components/SectionHeader";
import { Skeleton } from "../../components/Skeleton";
import { useClassMap, useTaughtClasses } from "../../hooks/useClasses";
import { classMapState, MIN_CELL, MIN_SHARING, shareOf } from "../../lib/classMap";
import { isFlagOn } from "../../lib/flags";
import { useDocumentTitle } from "../../lib/routeTitle";
import styles from "./classes.module.css";

/* /classes/:classId — a teacher's view of the mix-ups their class shares
 * (lib/classMap.ts). Counts only: no names, nothing a student wrote, nothing
 * until enough students share. Each mix-up comes with the catalogue's own
 * re-teach and check question, so the page answers "what do I re-teach
 * tomorrow?". */

export function ClassMapView() {
  const { classId = "" } = useParams<{ classId: string }>();
  const on = isFlagOn("classMap");
  const taught = useTaughtClasses(on);
  const cls = (taught.data ?? []).find((c) => c.id === classId) ?? null;
  const map = useClassMap(classId, on && !!cls);
  useDocumentTitle(cls ? cls.name : "Class");

  if (!on) {
    return (
      <div className={styles.page}>
        <EmptyState icon="users" title="Classes aren’t open yet" message="This is still being checked before anyone uses it." />
      </div>
    );
  }

  if (taught.isPending || (cls && map.isPending)) {
    return (
      <div className={styles.page} aria-busy="true">
        <Skeleton label="Loading the class" height={96} radius="var(--r-lg)" />
      </div>
    );
  }

  if (!cls) {
    return (
      <div className={styles.page}>
        <EmptyState icon="users" title="This isn’t one of your classes" message="Only the teacher who made a class can see its map.">
          <Link to="/classes">Back to classes</Link>
        </EmptyState>
      </div>
    );
  }

  if (map.isError || !map.data) {
    return (
      <div className={styles.page}>
        <PageHeader as="h1" title={cls.name} />
        <p className={styles.note} role="alert">
          The class map didn’t load. Check your connection and try again.
        </p>
      </div>
    );
  }

  const state = classMapState(map.data.counts, map.data.rows);
  const { joined } = map.data.counts;

  return (
    <div className={styles.page}>
      <Link to="/classes" className={styles.back}>
        ← Classes
      </Link>
      <PageHeader
        as="h1"
        title={cls.name}
        sub={`${joined} joined, ${state.sharing} sharing. Join code ${cls.join_code}.`}
      />

      {state.kind === "too-few" ? (
        <p className={styles.lead}>
          The map appears once at least {MIN_SHARING} students share. {state.needed === 1 ? "One more" : `${state.needed} more`}{" "}
          {state.needed === 1 ? "needs" : "need"} to turn sharing on.
        </p>
      ) : state.kind === "empty" ? (
        <p className={styles.lead}>
          No mix-up is shared by {MIN_CELL} or more of the students sharing yet.
        </p>
      ) : (
        <section className={styles.section} aria-labelledby="class-mixups">
          <SectionHeader id="class-mixups" title="Mix-ups your class shares" />
          <ul className={styles.mapList}>
            {state.entries.map(({ entry, students }) => (
              <li key={entry.id} className={styles.mapRow}>
                <div className={styles.mapHead}>
                  <h3 className={styles.mapConcept}>{entry.concept}</h3>
                  <span className={styles.count}>{shareOf(students, state.sharing)}</span>
                </div>
                <p className={styles.belief}>“{entry.belief}”</p>
                <details className={styles.reteach}>
                  <summary>Re-teach it in five minutes</summary>
                  <p>{entry.whyWrong}</p>
                  <p>{entry.remediation}</p>
                  <p className={styles.check}>
                    <strong>Check:</strong> {entry.check.question}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className={styles.help}>
        Counts only. You don’t see who holds a mix-up, or anything a student wrote. A mix-up held by fewer than{" "}
        {MIN_CELL} students isn’t shown, and nothing is shown until {MIN_SHARING} students share.
      </p>
    </div>
  );
}
