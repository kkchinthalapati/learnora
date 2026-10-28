import { useId, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { SectionHeader } from "../../components/SectionHeader";
import { Skeleton } from "../../components/Skeleton";
import { ToggleSwitch } from "../../components/ToggleSwitch";
import { useClassActions, useMemberships, useTaughtClasses } from "../../hooks/useClasses";
import { isJoinCode, MIN_SHARING, normaliseJoinCode } from "../../lib/classMap";
import { isFlagOn } from "../../lib/flags";
import { useDocumentTitle } from "../../lib/routeTitle";
import styles from "./classes.module.css";

/* /classes — join a class as a student, or run one as a teacher
 * (lib/classMap.ts). Behind the `classMap` flag, off in production until a
 * privacy review. Joining and sharing are two separate choices, and the
 * sharing switch says exactly what a teacher can and can't see. */

export function ClassesView() {
  useDocumentTitle("Classes");
  const on = isFlagOn("classMap");
  if (!on) {
    return (
      <div className={styles.page}>
        <EmptyState icon="users" title="Classes aren’t open yet" message="This is still being checked before anyone uses it." />
      </div>
    );
  }
  return (
    <div className={styles.page}>
      <PageHeader
        as="h1"
        title="Classes"
        sub="Join your teacher’s class, or run one and see which mix-ups your class shares."
      />
      <Memberships />
      <Taught />
    </div>
  );
}

function Memberships() {
  const memberships = useMemberships();
  const { join, setShare, leave } = useClassActions();
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const shareHelp = useId();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const c = normaliseJoinCode(code);
    if (!isJoinCode(c)) return setNote("A class code is 8 letters and numbers.");
    setNote("");
    try {
      const joined = await join.mutateAsync(c);
      setNote(joined ? `You’ve joined ${joined.class_name}. Sharing is off until you turn it on.` : "No class has that code.");
      if (joined) setCode("");
    } catch {
      setNote("That didn’t work just now. Try again.");
    }
  }

  return (
    <section className={styles.section} aria-labelledby="classes-in">
      <SectionHeader id="classes-in" title="Classes you’re in" />
      <form className={styles.inline} onSubmit={submit}>
        <label htmlFor="class-code" className={styles.srOnly}>
          Class code
        </label>
        <input
          id="class-code"
          className={styles.input}
          value={code}
          placeholder="Class code"
          autoComplete="off"
          onChange={(e) => setCode(e.target.value)}
        />
        <Button type="submit" variant="secondary" busy={join.isPending}>
          Join
        </Button>
      </form>
      <p className={styles.note} role="status">
        {note}
      </p>

      <p id={shareHelp} className={styles.help}>
        Sharing lets your teacher see how many students in the class have each common mix-up. They never see your
        name, anything you wrote, or anything at all until at least {MIN_SHARING} students share. You can turn it off
        any time.
      </p>

      {memberships.isPending ? (
        <Skeleton label="Loading your classes" height={56} radius="var(--r-lg)" />
      ) : memberships.isError ? (
        <p className={styles.note} role="alert">
          Your classes didn’t load. Check your connection and try again.
        </p>
      ) : (memberships.data ?? []).length === 0 ? null : (
        <ul className={styles.list} aria-label="Classes you’re in">
          {(memberships.data ?? []).map((m) => {
            const labelId = `share-${m.class_id}`;
            return (
              <li key={m.class_id} className={styles.row}>
                <span className={styles.rowTitle}>{m.class_name}</span>
                <span className={styles.toggle}>
                  <span id={labelId} className={styles.toggleLabel}>
                    Share my mistakes
                  </span>
                  <ToggleSwitch
                    checked={m.share_mistakes}
                    labelledBy={labelId}
                    onChange={(share) => setShare.mutate({ classId: m.class_id, share })}
                  />
                </span>
                <Button variant="ghost" size="sm" onClick={() => leave.mutate(m.class_id)} aria-describedby={shareHelp}>
                  Leave
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Taught() {
  const taught = useTaughtClasses();
  const { create, remove } = useClassActions();
  const [name, setName] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await create.mutateAsync(name);
      setName("");
    } catch {
      /* The list stays as it was; the button is ready to try again. */
    }
  }

  return (
    <section className={styles.section} aria-labelledby="classes-taught">
      <SectionHeader id="classes-taught" title="Classes you teach" />
      <form className={styles.inline} onSubmit={submit}>
        <label htmlFor="class-name" className={styles.srOnly}>
          Class name
        </label>
        <input
          id="class-name"
          className={styles.input}
          value={name}
          maxLength={80}
          placeholder="Class name, e.g. 10B Biology"
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" variant="secondary" busy={create.isPending}>
          Create class
        </Button>
      </form>
      {create.isError ? (
        <p className={styles.note} role="alert">
          That class wasn’t created. Try again.
        </p>
      ) : null}

      {taught.isPending ? (
        <Skeleton label="Loading the classes you teach" height={56} radius="var(--r-lg)" />
      ) : (taught.data ?? []).length === 0 ? null : (
        <ul className={styles.list} aria-label="Classes you teach">
          {(taught.data ?? []).map((c) => (
            <li key={c.id} className={styles.row}>
              <span className={styles.rowTitle}>
                <Link to={`/classes/${encodeURIComponent(c.id)}`}>{c.name}</Link>
              </span>
              <span className={styles.code}>
                Code <strong>{c.join_code}</strong>
              </span>
              <Button variant="ghost" size="sm" onClick={() => remove.mutate(c.id)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
