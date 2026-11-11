import { useId } from "react";
import { ToggleSwitch } from "../ToggleSwitch";
import type {
  ChatSources,
  NotesScope,
  PageContext,
} from "../../lib/chatSources";
import styles from "./chatSources.module.css";

/* The source list in the Ask panel's settings (lib/chatSources.ts): which
   notes the tutor may read, and whether it may search the web. */
export function ChatSourcesPanel({
  sources,
  onChange,
  context,
  folders,
  hasNotes,
  webAllowed,
}: {
  sources: ChatSources;
  onChange: (next: ChatSources) => void;
  context: PageContext;
  folders: Array<{ id: string; name: string }>;
  /** False once the library has loaded empty. */
  hasNotes: boolean;
  webAllowed: boolean;
}) {
  const name = useId();
  const webId = useId();

  const whereLabel =
    context.kind === "lesson"
      ? "This lesson only"
      : context.kind === "subject"
        ? "This subject only"
        : "Where I am";
  const whereHint =
    context.kind === "lesson"
      ? "Answers come from the lesson you're in."
      : context.kind === "subject"
        ? "Answers come from this subject's lessons."
        : "Inside a lesson, just that lesson. Elsewhere, all your notes.";

  const options: Array<{ id: NotesScope; label: string; hint: string }> = [
    { id: "context", label: whereLabel, hint: whereHint },
    { id: "all", label: "All my notes", hint: "Every lesson you've added." },
    {
      id: "subjects",
      label: "Pick subjects",
      hint: "Only the subjects you tick.",
    },
    { id: "off", label: "Don't use my notes", hint: "General knowledge only." },
  ];

  const toggleSubject = (id: string) =>
    onChange({
      ...sources,
      notes: "subjects",
      subjectIds: sources.subjectIds.includes(id)
        ? sources.subjectIds.filter((x) => x !== id)
        : [...sources.subjectIds, id],
    });

  return (
    <div className={styles.panel}>
      {!hasNotes ? (
        <p className={styles.note}>
          You haven't added any notes yet, so answers come from general
          knowledge. Add a lesson and the tutor will use it.
        </p>
      ) : (
        <fieldset className={styles.group}>
          <legend className={styles.legend}>Your notes</legend>
          {options.map((o) => (
            <label
              key={o.id}
              className={styles.option}
              data-checked={sources.notes === o.id || undefined}
            >
              <input
                type="radio"
                name={name}
                checked={sources.notes === o.id}
                onChange={() => onChange({ ...sources, notes: o.id })}
              />
              <span className={styles.optionText}>
                <span className={styles.optionLabel}>{o.label}</span>
                <span className={styles.optionHint}>{o.hint}</span>
              </span>
            </label>
          ))}
          {sources.notes === "subjects" ? (
            folders.length ? (
              <div
                className={styles.subjects}
                role="group"
                aria-label="Subjects the tutor may use"
              >
                {folders.map((f) => (
                  <label key={f.id} className={styles.subject}>
                    <input
                      type="checkbox"
                      checked={sources.subjectIds.includes(f.id)}
                      onChange={() => toggleSubject(f.id)}
                    />
                    <span>{f.name}</span>
                  </label>
                ))}
                {sources.subjectIds.length === 0 ? (
                  <p className={styles.note}>
                    Tick at least one, or answers won't use your notes.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className={styles.note}>You don't have any subjects yet.</p>
            )
          ) : null}
        </fieldset>
      )}

      <div className={styles.webRow}>
        <span className={styles.optionText}>
          <span className={styles.optionLabel} id={webId}>
            Search the web
          </span>
          <span className={styles.optionHint}>
            {webAllowed
              ? "Looks things up when your notes don't cover the question. Off by default."
              : "Turned off in Settings › Preferences › Live web intelligence."}
          </span>
        </span>
        <ToggleSwitch
          labelledBy={webId}
          checked={sources.web && webAllowed}
          disabled={!webAllowed}
          onChange={(web) => onChange({ ...sources, web })}
        />
      </div>
    </div>
  );
}
