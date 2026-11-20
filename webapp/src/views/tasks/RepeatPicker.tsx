import {
  TASK_REPEATS,
  taskRepeatLabel,
  type TaskRepeat,
} from "../../lib/taskRepeat";
import styles from "./tasks.module.css";

/* How often a task repeats: one chip, for the add form and for each row.
 *
 * A native select rather than five chips or a custom popover. Rows are
 * already dense, and on a phone a select opens the system picker, which has
 * full-size targets and cannot overflow the row. Closed, it reads as the
 * current repeat ("🔁 Weekly"), so on a row it doubles as the badge that says
 * the task repeats at all. */

interface RepeatPickerProps {
  value: TaskRepeat | null;
  onChange: (repeat: TaskRepeat | null) => void;
  /** "pill" matches the add form's quick-due pills, "chip" a row's quick
   *  buttons. */
  variant: "pill" | "chip";
  "aria-label": string;
}

export function RepeatPicker({
  value,
  onChange,
  variant,
  "aria-label": ariaLabel,
}: RepeatPickerProps) {
  const classes = [
    styles.repeatSelect,
    variant === "pill" ? styles.repeatPill : styles.repeatChip,
    value ? styles.repeatOn : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <select
      className={classes}
      aria-label={ariaLabel}
      value={value ?? ""}
      /* On a row, a click anywhere else ticks the task off. */
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange((e.target.value || null) as TaskRepeat | null)}
    >
      <option value="">{value ? "Don't repeat" : "🔁 Repeat"}</option>
      {TASK_REPEATS.map((repeat) => (
        <option key={repeat} value={repeat}>
          🔁 {taskRepeatLabel(repeat)}
        </option>
      ))}
    </select>
  );
}
