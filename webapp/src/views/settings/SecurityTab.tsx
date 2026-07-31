import { useId, useState } from "react";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import {
  InlineFeedback,
  type FeedbackState,
} from "../../components/InlineFeedback";
import {
  PasswordField,
  PasswordStrengthMeter,
} from "../../components/PasswordField";
import { useDialog } from "../../context/dialog";
import {
  useChangePassword,
  useSignOutOthers,
} from "../../hooks/useAuthActions";
import settings from "./settings.module.css";
import styles from "./security.module.css";

/* Security tab — ports index.html:1071-1132 + js/main.js:1051-1138.
 *
 * The password field and strength meter this tab introduced now live in
 * `components/PasswordField` so the auth views share one implementation
 * rather than a second copy of the same markup. */

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

        {/* The per-field `margin-bottom` the vanilla used moves to a gap on
            the stack, so the strength meter sits tight under the field it
            measures instead of a field's width apart from it. */}
        <div className={styles.passwordStack}>
          <div>
            <PasswordField
              id={newId}
              label="New Password"
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
            />
            <PasswordStrengthMeter password={newPassword} />
          </div>

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
