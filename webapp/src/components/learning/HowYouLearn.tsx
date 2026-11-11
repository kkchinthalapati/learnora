/* "How you learn": the student's own account of how they learn, with presets
 * to start from. One editor, in two places: its own onboarding step, and
 * Settings > Study. Controlled: the caller decides when to save.
 *
 * What it holds and how the AI uses it: lib/learnerProfile.ts. */

import { useId } from "react";
import { Icon } from "../Icon";
import { LearnerStylePicker } from "./LearnerStylePicker";
import { STEERS } from "../../lib/learnerSignals";
import { togglePref, type LearnerProfile } from "../../lib/learnerProfile";
import { INTERESTS_MAX, LEARNING_NOTES_MAX } from "../../lib/studyProfile";
import styles from "./adapt.module.css";

/* Sentences a student can add to their description with one tap, then edit.
   Things that change how to teach someone and that the five styles don't
   cover. */
export const NOTE_STARTERS = [
  "I lose focus after about 15 minutes, so keep things in short chunks.",
  "I need to know why something works before I can remember how.",
  "I remember things better when I explain them back in my own words.",
  "Big walls of text put me off. Break it up.",
  "I get anxious about tests, so build my confidence before the hard questions.",
  "English isn't my first language, so keep the wording simple.",
  "I like a challenge. Don't hold back on the harder ideas.",
  "Mnemonics and memory tricks really help me.",
] as const;

export function HowYouLearn({
  value,
  onChange,
  onTextBlur,
  disabled = false,
  where,
}: {
  value: LearnerProfile;
  onChange: (next: LearnerProfile) => void;
  /** Called when a text field loses focus: a good moment to save. */
  onTextBlur?: () => void;
  disabled?: boolean;
  /** Onboarding says where to change it later; Settings doesn't need to. */
  where: "onboarding" | "settings";
}) {
  const id = useId();
  const set = (patch: Partial<LearnerProfile>) => onChange({ ...value, ...patch });
  const addStarter = (line: string) => {
    const notes = value.notes.trim();
    if (notes.includes(line)) return;
    set({ notes: (notes ? `${notes} ${line}` : line).slice(0, LEARNING_NOTES_MAX) });
    onTextBlur?.();
  };

  return (
    <div className={styles.howYouLearn}>
      <div className={styles.group}>
        <label className={styles.describeLabel} htmlFor={`${id}-notes`}>
          Describe how you learn
        </label>
        <p className={styles.note} id={`${id}-notes-hint`}>
          In your own words, as much detail as you like: what helps things click, what loses you, how you like
          to be taught, anything a good tutor should know about you.
        </p>
        <textarea
          id={`${id}-notes`}
          className={`${styles.text} ${styles.describe}`}
          rows={7}
          maxLength={LEARNING_NOTES_MAX}
          disabled={disabled}
          aria-describedby={`${id}-notes-hint ${id}-privacy`}
          placeholder={"e.g. I'm a visual person. I need to see how the pieces fit together before the details make sense. Long paragraphs lose me, but I'm fine with hard ideas if they're broken into steps. I remember things best when I try a question first and get it wrong."}
          value={value.notes}
          onChange={(e) => set({ notes: e.target.value })}
          onBlur={onTextBlur}
        />
        <p className={styles.count}>
          {value.notes.length} / {LEARNING_NOTES_MAX}
        </p>
        <p className={styles.note} id={`${id}-starters`}>
          Not sure where to start? Tap a line to add it, then make it yours.
        </p>
        <div className={styles.chips} role="group" aria-labelledby={`${id}-starters`}>
          {NOTE_STARTERS.map((line) => (
            <button
              key={line}
              type="button"
              className={styles.starter}
              disabled={disabled || value.notes.includes(line)}
              onClick={() => addStarter(line)}
            >
              <Icon name="plus" size={12} />
              {line}
            </button>
          ))}
        </div>
      </div>

      <fieldset className={styles.group}>
        <legend className={styles.label}>Quick picks: what helps you most</legend>
        <LearnerStylePicker
          compact
          value={value.style}
          disabled={disabled}
          onPick={(style) => set({ style })}
        />
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.label}>Always…</legend>
        <div className={styles.chips}>
          {STEERS.map((s) => {
            const on = value.prefs.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                className={styles.chip}
                aria-pressed={on}
                disabled={disabled}
                onClick={() => set({ prefs: togglePref(value.prefs, s.id) })}
              >
                {on ? <Icon name="check" size={14} /> : null}
                {s.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className={styles.group}>
        <label className={styles.label} htmlFor={`${id}-interests`}>
          What you're into
        </label>
        <p className={styles.note}>We'll use these for examples where they fit, like a football match to explain momentum.</p>
        <input
          id={`${id}-interests`}
          className={styles.text}
          maxLength={INTERESTS_MAX}
          disabled={disabled}
          placeholder="e.g. football, Minecraft, baking, K-pop"
          value={value.interests}
          onChange={(e) => set({ interests: e.target.value })}
          onBlur={onTextBlur}
        />
      </div>

      <p className={styles.note} id={`${id}-privacy`}>
        This is sent to Learnora's AI with your lessons, notes and podcasts so it can teach the way you learn. Please
        don't include names or other personal details.
        {where === "onboarding" ? " You can change any of it later in Settings → Study → How you learn." : ""}
      </p>
    </div>
  );
}
