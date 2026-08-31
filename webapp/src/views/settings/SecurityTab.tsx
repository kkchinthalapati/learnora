import { useId, useState } from "react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
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
import { validateNewPassword } from "../../lib/passwordStrength";
import settings from "./settings.module.css";
import styles from "./security.module.css";

export function SecurityTab() {
  const { confirm } = useDialog();
  const changePassword = useChangePassword();
  const signOutOthers = useSignOutOthers();

  const currentId = useId();
  const newId = useId();
  const confirmId = useId();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordFeedback, setPasswordFeedback] =
    useState<FeedbackState | null>(null);
  const [sessionsFeedback, setSessionsFeedback] =
    useState<FeedbackState | null>(null);

  async function onChangePassword() {
    const invalid = validateNewPassword(newPassword, confirmPassword);
    if (invalid) {
      setPasswordFeedback({ kind: "error", message: invalid.message });
      return;
    }
    if (!currentPassword) {
      setPasswordFeedback({
        kind: "error",
        message: "Please enter your current password.",
      });
      return;
    }
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      setPasswordFeedback({
        kind: "success",
        message: "Password updated. Other sessions have been signed out.",
      });
      setCurrentPassword("");
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
      <Card
        as="section"
        variant="elevated"
        radius="lg"
        padding="lg"
        className={settings.card}
        aria-labelledby="settings-password-heading"
      >
        <div className={settings.cardHeader}>
          <span className={settings.cardIcon}>
            <Icon name="key" size={18} />
          </span>
          <div>
            <h3 id="settings-password-heading">Change Password</h3>
            <p>Confirm your current password, then set a new one.</p>
          </div>
        </div>

        <div className={styles.passwordStack}>
          <PasswordField
            id={currentId}
            label="Current Password"
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
            /* The default "Min 8 characters" is advice for choosing a new
               password, which this field is not. */
            placeholder="Enter your current password"
          />

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
      </Card>

      <Card
        as="section"
        variant="elevated"
        radius="lg"
        padding="lg"
        className={settings.card}
        aria-labelledby="settings-sessions-heading"
      >
        <div className={settings.cardHeader}>
          <span className={settings.cardIcon}>
            <Icon name="smartphone" size={18} />
          </span>
          <div>
            <h3 id="settings-sessions-heading">Sessions</h3>
            <p>Control sign-in sessions on other devices.</p>
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
      </Card>
    </>
  );
}
