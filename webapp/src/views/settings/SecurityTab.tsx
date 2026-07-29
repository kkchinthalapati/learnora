import { useId, useState } from "react";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import {
  InlineFeedback,
  type FeedbackState,
} from "../../components/InlineFeedback";
import { useDialog } from "../../context/dialog";
import {
  useChangePassword,
  useSignOutOthers,
} from "../../hooks/useAuthActions";
import { scorePassword } from "./passwordStrength";
import settings from "./settings.module.css";
import styles from "./security.module.css";

/* Security tab — ports index.html:1071-1132 + js/main.js:1051-1138. */

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={styles.inputGroup}>
      <label htmlFor={id}>{label}</label>
      <div className={styles.passwordWrapper}>
        <input
          id={id}
          type={visible ? "text" : "password"}
          placeholder="Min 8 characters"
          autoComplete={autoComplete}
          minLength={8}
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

export function SecurityTab() {
  const { confirm } = useDialog();
  const changePassword = useChangePassword();
  const signOutOthers = useSignOutOthers();

  const newId = useId();
  const confirmId = useId();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordFeedback, setPasswordFeedback] =
    useState<FeedbackState | null>(null);
  const [sessionsFeedback, setSessionsFeedback] =
    useState<FeedbackState | null>(null);

  const strength = newPassword ? scorePassword(newPassword) : null;

  async function onChangePassword() {
    if (!newPassword || newPassword.length < 8) {
      setPasswordFeedback({
        kind: "error",
        message: "Password must be at least 8 characters.",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({
        kind: "error",
        message: "Passwords do not match.",
      });
      return;
    }
    try {
      await changePassword.mutateAsync(newPassword);
      setPasswordFeedback({
        kind: "success",
        message: "Password updated. Other sessions have been signed out.",
      });
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordFeedback({ kind: "error", message: (err as Error).message });
    }
  }

  async function onSignOutOthers() {
    const ok = await confirm(
      "This will sign you out of all other browsers and devices.",
      {
        title: "Sign out other sessions?",
        confirmText: "Sign Out Others",
        danger: true,
      },
    );
    if (!ok) return;
    try {
      await signOutOthers.mutateAsync();
      setSessionsFeedback({
        kind: "success",
        message: "All other sessions have been signed out.",
      });
    } catch (err) {
      setSessionsFeedback({ kind: "error", message: (err as Error).message });
    }
  }

  return (
    <>
      <section
        className={settings.card}
        aria-labelledby="settings-password-heading"
      >
        <div className={settings.cardHeader}>
          <span className={settings.cardIcon}>
            <Icon name="key" size={18} />
          </span>
          <div>
            <h3 id="settings-password-heading">Change Password</h3>
            <p>Update your account password</p>
          </div>
        </div>

        <PasswordField
          id={newId}
          label="New Password"
          value={newPassword}
          onChange={setNewPassword}
          autoComplete="new-password"
        />

        {strength && (
          <div
            className={`${styles.strengthContainer} ${styles[strength.level]}`}
          >
            <div className={styles.strengthBars} aria-hidden="true">
              <div className={styles.strengthSegment} />
              <div className={styles.strengthSegment} />
              <div className={styles.strengthSegment} />
              <div className={styles.strengthSegment} />
            </div>
            {/* The vanilla left the meter silent for screen readers; the bars
                are decorative and the text carries the same information, so
                it's announced politely as the user types. */}
            <span className={styles.strengthText} role="status">
              {strength.label}
            </span>
          </div>
        )}

        <div className={styles.inputGroupLast}>
          <PasswordField
            id={confirmId}
            label="Confirm New Password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
          />
        </div>

        <Button
          variant="primary"
          onClick={() => void onChangePassword()}
          disabled={changePassword.isPending}
        >
          {changePassword.isPending ? "Updating..." : "Update Password"}
        </Button>
        {passwordFeedback && <InlineFeedback {...passwordFeedback} />}
      </section>

      <section
        className={settings.card}
        aria-labelledby="settings-sessions-heading"
      >
        <div className={settings.cardHeader}>
          <span className={settings.cardIcon}>
            <Icon name="smartphone" size={18} />
          </span>
          <div>
            <h3 id="settings-sessions-heading">Sessions</h3>
            <p>Manage your active sessions</p>
          </div>
        </div>
        <div className={settings.field}>
          <div className={settings.fieldLabel}>
            <span className={settings.labelText}>Sign Out Other Sessions</span>
            <p className={settings.fieldDesc}>
              Sign out of all other browsers and devices
            </p>
          </div>
          <div className={settings.fieldAction}>
            <Button
              variant="warning"
              size="sm"
              onClick={() => void onSignOutOthers()}
              disabled={signOutOthers.isPending}
            >
              Sign Out Others
            </Button>
          </div>
        </div>
        {sessionsFeedback && <InlineFeedback {...sessionsFeedback} />}
      </section>
    </>
  );
}
