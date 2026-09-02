import { useId, useRef, useState } from "react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { PageHeader } from "../../components/PageHeader";
import { ProGate } from "../../components/ProGate";
import { useToast } from "../../context/toast";
import { useLifeContext } from "../../hooks/useLifeContext";
import { useStudySchedule } from "../../hooks/useStudySchedule";
import { importIcsForRange } from "../../lib/icsImport";
import {
  CHRONOTYPES,
  COMMITMENT_KINDS,
  WEEKDAY_SHORT,
  WEEK_ORDER,
  commitmentKindLabel,
  createCommitment,
  formatClock,
  formatDuration,
  toMinutes,
  type Commitment,
  type CommitmentKind,
  type Weekday,
} from "../../lib/lifeContext";
import { localDateStr, parseLocalDate } from "../../lib/date";
import styles from "./myWeek.module.css";

/* "My week" — where a student tells Learnora about their life.
 *
 * This is the only screen in the app that asks about something other than
 * studying, and that is the point. Ten minutes here is what turns every plan
 * the app makes from a suggestion into a schedule.
 *
 * It is built to be finishable. Every field has a working default, nothing is
 * required, and the preview at the bottom updates as they type — so a student
 * who fills in one lecture and stops still gets a better day than before, and
 * can see that they did. A setup screen that has to be completed to be worth
 * anything is a setup screen that gets abandoned. */

const CAPACITY_STEPS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 300, 360];

function nextCapacity(current: number, direction: 1 | -1): number {
  const index = CAPACITY_STEPS.findIndex((s) => s >= current);
  const at = index === -1 ? CAPACITY_STEPS.length - 1 : index;
  return CAPACITY_STEPS[
    Math.max(0, Math.min(CAPACITY_STEPS.length - 1, at + direction))
  ];
}

interface CapacityStepperProps {
  label: string;
  /** Used to build distinct button names — two identical "More" buttons on one
   *  screen are indistinguishable to anyone navigating by voice or by label. */
  noun: string;
  value: number;
  onChange: (next: number) => void;
}

function CapacityStepper({
  label,
  noun,
  value,
  onChange,
}: CapacityStepperProps) {
  return (
    <div className={styles.stepper}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.stepperControls}>
        <Button
          variant="secondary"
          size="sm"
          aria-label={`Less ${noun} study`}
          disabled={value <= CAPACITY_STEPS[0]}
          onClick={() => onChange(nextCapacity(value, -1))}
        >
          &minus;
        </Button>
        <strong className={styles.stepperValue} aria-live="polite">
          {formatDuration(value)}
        </strong>
        <Button
          variant="secondary"
          size="sm"
          aria-label={`More ${noun} study`}
          disabled={value >= CAPACITY_STEPS[CAPACITY_STEPS.length - 1]}
          onClick={() => onChange(nextCapacity(value, 1))}
        >
          +
        </Button>
      </div>
    </div>
  );
}

interface CommitmentRowProps {
  commitment: Commitment;
  onChange: (next: Commitment) => void;
  onRemove: () => void;
}

function CommitmentRow({ commitment, onChange, onRemove }: CommitmentRowProps) {
  const labelId = useId();
  const invalid =
    (toMinutes(commitment.end) ?? 0) <= (toMinutes(commitment.start) ?? 0);

  const toggleDay = (day: Weekday) => {
    onChange({
      ...commitment,
      days: commitment.days.includes(day)
        ? commitment.days.filter((d) => d !== day)
        : [...commitment.days, day].sort((a, b) => a - b),
    });
  };

  return (
    <li className={styles.commitmentRow}>
      <div className={styles.commitmentTop}>
        <input
          id={labelId}
          className={styles.textInput}
          value={commitment.label}
          placeholder="Chemistry lecture"
          aria-label="What is it"
          onChange={(e) => onChange({ ...commitment, label: e.target.value })}
        />
        <select
          className={styles.select}
          value={commitment.kind}
          aria-label="Kind of commitment"
          onChange={(e) =>
            onChange({ ...commitment, kind: e.target.value as CommitmentKind })
          }
        >
          {COMMITMENT_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <IconButton
          aria-label={`Remove ${commitment.label.trim() || "commitment"}`}
          onClick={onRemove}
        >
          <Icon name="trash" size={16} />
        </IconButton>
      </div>

      <div className={styles.commitmentBottom}>
        <div
          className={styles.dayToggles}
          role="group"
          aria-label="Days it happens"
        >
          {WEEK_ORDER.map((day) => {
            const on = commitment.days.includes(day);
            return (
              <button
                key={day}
                type="button"
                className={`${styles.dayToggle} ${on ? styles.dayToggleOn : ""}`}
                aria-pressed={on}
                onClick={() => toggleDay(day)}
              >
                {WEEKDAY_SHORT[day]}
              </button>
            );
          })}
        </div>
        <div className={styles.timeRange}>
          <input
            type="time"
            className={styles.timeInput}
            value={commitment.start}
            aria-label="Start time"
            onChange={(e) => onChange({ ...commitment, start: e.target.value })}
          />
          <span aria-hidden="true">→</span>
          <input
            type="time"
            className={styles.timeInput}
            value={commitment.end}
            aria-label="End time"
            onChange={(e) => onChange({ ...commitment, end: e.target.value })}
          />
        </div>
      </div>

      {invalid ? (
        /* Said here rather than swallowed on save: `normalizeLifeContext`
           silently drops a commitment whose end does not follow its start, and
           a row that vanishes on reload with no explanation is worse than one
           that says what is wrong while the student is looking at it. */
        <p className={styles.rowError} role="alert">
          The end time needs to come after the start. For a night shift, add it
          as two commitments either side of midnight.
        </p>
      ) : null}
      {commitment.days.length === 0 ? (
        <p className={styles.rowHint}>Pick the days this happens on.</p>
      ) : null}
    </li>
  );
}

export function MyWeekView() {
  const { context, update } = useLifeContext();
  const { showToast } = useToast();
  const schedule = useStudySchedule();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState("");
  const [importing, setImporting] = useState(false);

  const setCommitments = (commitments: Commitment[]) => update({ commitments });

  const addCommitment = () => {
    update({
      commitments: [
        ...context.commitments,
        createCommitment({ days: [1, 2, 3, 4, 5] }),
      ],
    });
  };

  const toggleProtectedDay = (day: Weekday) => {
    update({
      protectedDays: context.protectedDays.includes(day)
        ? context.protectedDays.filter((d) => d !== day)
        : [...context.protectedDays, day].sort((a, b) => a - b),
    });
  };

  /* One path for both the file picker and the paste box: whatever the student
     gets their hands on — a downloaded .ics, or the text behind a subscription
     URL — becomes the same string. We parse it before storing so a file that
     turns out to hold nothing usable says so instead of silently succeeding. */
  const acceptIcs = (text: string, label: string) => {
    const today = localDateStr();
    const result = importIcsForRange(text, today, 28);
    if (result.sourceEventCount === 0) {
      showToast(
        "That file has no calendar events in it. Export an .ics from your calendar app and try again.",
      );
      return;
    }
    update({
      importedIcs: text,
      importedLabel: label,
      importedAt: new Date().toISOString(),
    });
    showToast(
      `Imported ${result.sourceEventCount} event${result.sourceEventCount === 1 ? "" : "s"} — your schedule now works around them.`,
    );
    setPasted("");
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    try {
      acceptIcs(await file.text(), file.name);
    } catch {
      showToast("That file could not be read.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const clearImport = () => {
    update({ importedIcs: null, importedLabel: null, importedAt: null });
    showToast(
      "Calendar removed. Nothing from it was ever sent to our servers.",
    );
  };

  const preview = schedule.days;

  return (
    <div className={styles.view}>
      {/* No <h1> here: the shell's Header renders the page's one heading from
          lib/sectionLabel.ts. PageHeader's title names what is below it rather
          than repeating the route's name, the same as FriendsView. */}
      <PageHeader
        eyebrow="Life sync"
        title="The week you actually have"
        sub="Tell Learnora when your life happens and it will schedule your studying around it — in the hours your head actually works."
      />

      {/* --- 1. The shape of a day ------------------------------------ */}
      <Card as="section" variant="panel" className={styles.section}>
        <h2 className={styles.sectionTitle}>When you&rsquo;re awake</h2>
        <p className={styles.sectionCopy}>
          Nothing is ever scheduled outside these hours.
        </p>
        <div className={styles.fieldRow}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Wake up</span>
            <input
              type="time"
              className={styles.timeInput}
              value={context.wakeTime}
              onChange={(e) => update({ wakeTime: e.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Wind down</span>
            <input
              type="time"
              className={styles.timeInput}
              value={context.sleepTime}
              onChange={(e) => update({ sleepTime: e.target.value })}
            />
          </label>
        </div>

        <h3 className={styles.subTitle}>When your head works</h3>
        <p className={styles.sectionCopy}>
          The hardest work gets your best hours. Everything mechanical gets the
          rest, which is what keeps the good hours free.
        </p>
        <div
          className={styles.choiceGrid}
          role="radiogroup"
          aria-label="Chronotype"
        >
          {CHRONOTYPES.map((c) => {
            const on = context.chronotype === c.value;
            return (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={on}
                className={`${styles.choice} ${on ? styles.choiceOn : ""}`}
                onClick={() => update({ chronotype: c.value })}
              >
                <span className={styles.choiceLabel}>{c.label}</span>
                <span className={styles.choiceHint}>{c.hint}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* --- 2. Honest capacity --------------------------------------- */}
      <Card as="section" variant="panel" className={styles.section}>
        <h2 className={styles.sectionTitle}>How much you&rsquo;ll really do</h2>
        <p className={styles.sectionCopy}>
          Be honest rather than ambitious. A day you finish is worth three you
          abandon, and this is the number that decides which one you get.
        </p>
        <div className={styles.fieldRow}>
          <CapacityStepper
            label="On a weekday"
            noun="weekday"
            value={context.weekdayCapacityMins}
            onChange={(weekdayCapacityMins) => update({ weekdayCapacityMins })}
          />
          <CapacityStepper
            label="At the weekend"
            noun="weekend"
            value={context.weekendCapacityMins}
            onChange={(weekendCapacityMins) => update({ weekendCapacityMins })}
          />
        </div>

        <h3 className={styles.subTitle}>Days that are yours</h3>
        <p className={styles.sectionCopy}>
          Nothing gets scheduled on these. Taking a day off on purpose is how a
          streak survives a bad week.
        </p>
        <div className={styles.dayToggles} role="group" aria-label="Days off">
          {WEEK_ORDER.map((day) => {
            const on = context.protectedDays.includes(day);
            return (
              <button
                key={day}
                type="button"
                className={`${styles.dayToggle} ${on ? styles.dayToggleOn : ""}`}
                aria-pressed={on}
                onClick={() => toggleProtectedDay(day)}
              >
                {WEEKDAY_SHORT[day]}
              </button>
            );
          })}
        </div>
      </Card>

      {/* --- 3. Commitments ------------------------------------------- */}
      <Card as="section" variant="panel" className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>
              What&rsquo;s already in your week
            </h2>
            <p className={styles.sectionCopy}>
              Lectures, shifts, training, the things you show up to. Study gets
              placed around them, with a {formatDuration(context.bufferMins)}{" "}
              gap either side.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={addCommitment}>
            <Icon name="plus" size={14} /> Add
          </Button>
        </div>

        {context.commitments.length === 0 ? (
          <p className={styles.empty}>
            Nothing yet. Add one thing you do every week — the schedule gets
            better the moment you do.
          </p>
        ) : (
          <ul className={styles.commitmentList}>
            {context.commitments.map((c, i) => (
              <CommitmentRow
                key={c.id}
                commitment={c}
                onChange={(next) =>
                  setCommitments(
                    context.commitments.map((x, j) => (j === i ? next : x)),
                  )
                }
                onRemove={() =>
                  setCommitments(context.commitments.filter((_, j) => j !== i))
                }
              />
            ))}
          </ul>
        )}
      </Card>

      {/* --- 4. Calendar import --------------------------------------- */}
      <Card as="section" variant="panel" className={styles.section}>
        <h2 className={styles.sectionTitle}>Import your calendar</h2>
        <p className={styles.sectionCopy}>
          Faster than typing a timetable. Export an <code>.ics</code> from
          Google Calendar, Apple Calendar, Outlook or your university timetable
          and drop it in — recurring lectures and one-off appointments both come
          through.
        </p>
        <p className={styles.privacy}>
          <Icon name="lock" size={13} /> It stays on this device. Learnora reads
          it in your browser to find your free hours and never uploads it.
        </p>

        {context.importedIcs ? (
          <div className={styles.importedRow}>
            <div>
              <strong className={styles.importedName}>
                {context.importedLabel || "Imported calendar"}
              </strong>
              <span className={styles.importedMeta}>
                {schedule.calendar.length} event
                {schedule.calendar.length === 1 ? "" : "s"} in the next week
                {context.importedAt
                  ? ` · added ${new Date(context.importedAt).toLocaleDateString()}`
                  : ""}
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={clearImport}>
              Remove
            </Button>
          </div>
        ) : null}

        <ProGate feature="calendarImport" loadingHeight={110}>
          <div className={styles.importActions}>
            <input
              ref={fileRef}
              type="file"
              accept=".ics,text/calendar"
              className={styles.fileInput}
              aria-label="Choose a calendar file"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={importing}
              onClick={() => fileRef.current?.click()}
            >
              <Icon name="upload-cloud" size={14} />
              {importing
                ? "Reading…"
                : context.importedIcs
                  ? "Replace file"
                  : "Choose .ics file"}
            </Button>
          </div>

          <details className={styles.paste}>
            <summary>Or paste calendar text</summary>
            <p className={styles.sectionCopy}>
              If your timetable is published as a subscription link, open it in
              a browser tab and paste what you see here.
            </p>
            <textarea
              className={styles.textarea}
              rows={4}
              value={pasted}
              placeholder="BEGIN:VCALENDAR…"
              aria-label="Calendar text"
              onChange={(e) => setPasted(e.target.value)}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={!pasted.trim()}
              onClick={() => acceptIcs(pasted, "Pasted calendar")}
            >
              Import pasted text
            </Button>
          </details>
        </ProGate>
      </Card>

      {/* --- 5. Live preview ------------------------------------------ */}
      <Card as="section" variant="panel" className={styles.section}>
        <h2 className={styles.sectionTitle}>What your next week looks like</h2>
        <p className={styles.sectionCopy}>
          Built from everything above plus what you already have due. It updates
          as you type.
        </p>
        <ul className={styles.previewList}>
          {preview.map((day) => {
            const blocks = schedule.blocks.filter((b) => b.date === day.date);
            const date = parseLocalDate(day.date);
            return (
              <li key={day.date} className={styles.previewDay}>
                <div className={styles.previewHead}>
                  <span className={styles.previewName}>
                    {date.toLocaleDateString(undefined, {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  <span className={styles.previewMeta}>
                    {day.protectedDay
                      ? "Yours"
                      : blocks.length === 0
                        ? "Nothing scheduled"
                        : `${formatDuration(
                            blocks.reduce(
                              (s, b) => s + (b.endMin - b.startMin),
                              0,
                            ),
                          )} across ${blocks.length} block${blocks.length === 1 ? "" : "s"}`}
                  </span>
                </div>
                {day.busy.length > 0 ? (
                  <p className={styles.previewBusy}>
                    {day.busy
                      .map((b) => `${b.label} ${formatClock(b.startMin)}`)
                      .join(" · ")}
                  </p>
                ) : null}
                {blocks.length > 0 ? (
                  <ul className={styles.previewBlocks}>
                    {blocks.map((b) => (
                      <li key={b.id} className={styles.previewBlock}>
                        <span className={styles.previewTime}>
                          {formatClock(b.startMin)}
                        </span>
                        <span className={styles.previewLabel}>{b.label}</span>
                        <span className={styles.previewDuration}>
                          {formatDuration(b.endMin - b.startMin)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>

        {schedule.unplaced.length > 0 ? (
          <p className={styles.shortfall} role="status">
            <Icon name="alert-triangle" size={14} />
            <span>
              {formatDuration(
                schedule.unplaced.reduce((s, u) => s + u.remainingMins, 0),
              )}{" "}
              of work doesn&rsquo;t fit in the week you&rsquo;ve described —
              starting with {schedule.unplaced[0].demand.label}. That is worth
              knowing now rather than on Sunday night.
            </span>
          </p>
        ) : null}
      </Card>

      <p className={styles.footNote}>
        Commitment kinds matter more than they look: a{" "}
        {commitmentKindLabel("work").toLowerCase()} or{" "}
        {commitmentKindLabel("sport").toLowerCase()} leaves you flat for an hour
        afterwards, so Learnora puts recall practice there instead of new
        material.
      </p>
    </div>
  );
}
