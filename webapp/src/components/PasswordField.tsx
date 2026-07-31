import { useState } from "react";
import { scorePassword } from "../lib/passwordStrength";
import styles from "./PasswordField.module.css";

/* The password input with its Show/Hide toggle, plus the strength meter that
 * sits under it.
 *
 * The vanilla had four copies of this pair of behaviours — signup, the in-page
 * reset form, reset-password.js and the settings tab — wired by two generic
 * binders (`bindPasswordToggles`, `bindStrengthMeter`) over duplicated markup.
 * Step 7 ported the settings copy into a component local to SecurityTab; the
 * auth views need the same thing, so it moves here rather than being written
 * a second time. */

export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder = "Min 8 characters",
  required = false,
  labelSuffix,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder?: string;
  required?: boolean;
  /* Renders beside the label — the login form puts "Forgot Password?" there
     (index.html:90-93). */
  labelSuffix?: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={styles.inputGroup}>
      {labelSuffix ? (
        <div className={styles.labelRow}>
          <label htmlFor={id}>{label}</label>
          {labelSuffix}
        </div>
      ) : (
        <label htmlFor={id}>{label}</label>
      )}
      <div className={styles.passwordWrapper}>
        <input
          id={id}
          type={visible ? "text" : "password"}
          placeholder={placeholder}
          autoComplete={autoComplete}
          minLength={8}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {/* tabIndex -1 matches the vanilla: the toggle is a convenience for
            pointer users, and leaving it in the tab order puts a control
            between the two password fields. */}
        <button
          type="button"
          className={styles.passwordToggle}
          tabIndex={-1}
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}

/* Renders nothing for an empty password, which is how the vanilla's
 * `containerEl.classList.add("hidden")` branch behaved. */
export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const strength = scorePassword(password);
  return (
    <div className={`${styles.strengthContainer} ${styles[strength.level]}`}>
      <div className={styles.strengthBars} aria-hidden="true">
        <div className={styles.strengthSegment} />
        <div className={styles.strengthSegment} />
        <div className={styles.strengthSegment} />
        <div className={styles.strengthSegment} />
      </div>
      {/* The vanilla left the meter silent for screen readers; the bars are
          decorative and the text carries the same information, so it's
          announced politely as the user types. */}
      <span className={styles.strengthText} role="status">
        {strength.label}
      </span>
    </div>
  );
}
