import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import {
  InlineFeedback,
  type FeedbackState,
} from "../../components/InlineFeedback";
import { useDialog } from "../../context/dialog";
import { useToast } from "../../context/toast";
import { useAuth } from "../../context/auth";
import { useDeleteAccount } from "../../hooks/useAuthActions";
import { useWipeData } from "../../hooks/useDataAdmin";
import styles from "./settings.module.css";

/* Danger Zone tab — ports index.html:1642-1673 + js/main.js:1140-1170.
 *
 * The wipe flow is carried over exactly. Account deletion is not: the vanilla
 * asked "are you sure?" twice, which mostly teaches people to click through
 * both. The second step is now a password, which is the only part of this
 * flow a passer-by at an unlocked laptop cannot complete — and re-auth before
 * an irreversible action is the standard Supabase itself applies to changing
 * an email. Three adaptations:
 *
 *  - Wipe: the vanilla called `DataAdmin.wipe()`, which reloaded the whole
 *    page to clear the now-stale views (js/api.js). Here every view reads
 *    through TanStack Query, so invalidating the cache repaints them without
 *    throwing the session away.
 *  - Delete account: the vanilla reloaded so the app would fall back to the
 *    sign-in screen. `signOut()` reaches the same place through the auth
 *    state change AuthProvider is already listening to. */

export function DangerTab() {
  const { confirm, promptText } = useDialog();
  const { showToast } = useToast();
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  const wipeData = useWipeData();
  const deleteAccount = useDeleteAccount();
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  async function onWipe() {
    const ok = await confirm(
      "This permanently deletes all your tasks, study logs, exams, weekly plans, quizzes, and saved timer presets from the cloud and this device. Folders, materials, notes, and flashcards are not affected. This cannot be undone.",
      {
        title: "Wipe all data?",
        confirmText: "Delete everything",
        danger: true,
      },
    );
    if (!ok) return;
    try {
      await wipeData.mutateAsync();
      await queryClient.invalidateQueries();
      setFeedback(null);
      showToast("All study data has been wiped.");
    } catch (err) {
      setFeedback({ kind: "error", message: (err as Error).message });
    }
  }

  async function onDeleteAccount() {
    const ok = await confirm(
      "This will permanently delete your account and all data. This action is IRREVERSIBLE.",
      {
        title: "Delete your account?",
        confirmText: "Yes, delete my account",
        danger: true,
      },
    );
    if (!ok) return;

    /* Re-authentication, not a second "are you sure?". The old flow asked the
       same question twice, which trains people to click through both; a
       password is the only step here that a passer-by at an unlocked laptop
       cannot complete. Cancelling the prompt returns null and aborts. */
    const password = await promptText(
      "Enter your password to confirm. This deletes your account and every piece of data in it, permanently.",
      {
        title: "Confirm your password",
        confirmText: "Delete forever",
        cancelText: "Keep my account",
        placeholder: "Your password",
        inputType: "password",
        danger: true,
      },
    );
    if (password === null) return;

    try {
      await deleteAccount.mutateAsync(password);
      await signOut();
    } catch (err) {
      setFeedback({ kind: "error", message: (err as Error).message });
    }
  }

  return (
    <Card
      as="section"
      variant="elevated"
      radius="lg"
      padding="lg"
      className={`${styles.card} ${styles.dangerCard}`}
      aria-labelledby="settings-danger-heading"
    >
      <div className={styles.cardHeader}>
        <span className={styles.cardIcon}>
          <Icon name="alert-triangle" size={18} />
        </span>
        <div>
          <h3 id="settings-danger-heading">Danger Zone</h3>
          <p>Irreversible and destructive actions</p>
        </div>
      </div>

      <div className={styles.dangerItem}>
        <div className={styles.dangerItemInfo}>
          <h4>Wipe All Data</h4>
          <p>
            Permanently delete all tasks, study logs, exams, weekly plans,
            quizzes, and saved timer presets from the cloud and this device.
            Folders, uploaded materials, notes, and flashcards are not affected.
            Your account will remain active.
          </p>
        </div>
        <Button
          variant="danger"
          size="sm"
          onClick={() => void onWipe()}
          disabled={wipeData.isPending}
        >
          <Icon name="trash" size={16} />
          {wipeData.isPending ? "Wiping..." : "Wipe Data"}
        </Button>
      </div>

      <div className={styles.dangerItem}>
        <div className={styles.dangerItemInfo}>
          <h4>Delete Account</h4>
          <p>
            Permanently delete your account and all associated data. This action
            cannot be undone.
          </p>
        </div>
        <Button
          variant="danger"
          size="sm"
          onClick={() => void onDeleteAccount()}
          disabled={deleteAccount.isPending}
        >
          <Icon name="alert-triangle" size={16} />
          {deleteAccount.isPending ? "Deleting..." : "Delete Account"}
        </Button>
      </div>

      {feedback && <InlineFeedback {...feedback} />}
    </Card>
  );
}
