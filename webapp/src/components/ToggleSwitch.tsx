import { useId } from "react";
import styles from "./ToggleSwitch.module.css";

/* The vanilla markup wraps the checkbox in a bare `<label class="toggle-switch">`
 * with no text (index.html:1670-1673), so the control reaches assistive tech
 * with no name at all. Here the visible field label is passed in and wired up
 * with aria-labelledby (or aria-label when the caller has no element to point
 * at), which is the one behavioural fix in this port. */

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** id of the element that labels this toggle. */
  labelledBy?: string;
  /** Used when there is no separate label element to reference. */
  label?: string;
  disabled?: boolean;
}

export function ToggleSwitch({
  checked,
  onChange,
  labelledBy,
  label,
  disabled,
}: ToggleSwitchProps) {
  const id = useId();
  return (
    <span className={styles.toggleSwitch}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={styles.toggleSlider} aria-hidden="true" />
    </span>
  );
}
