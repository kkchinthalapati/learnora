import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
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
 * Both confirmation flows are carried over exactly, including the account
 * deletion's deliberate double prompt. Two adaptations:
 *
 *  - Wipe: the vanilla called `DataAdmin.wipe()`, which reloaded the whole
 *    page to clear the now-stale views (js/api.js). Here every view reads
 *    through TanStack Query, so invalidating the cache repaints them without
 *    throwing the session away.
 *  - Delete account: the vanilla reloaded so the app would fall back to the
 *    sign-in screen. `signOut()` reaches the same place through the auth
 *    state change AuthProvider is already listening to. */

export function DangerTab() {
  const { confirm } = useDialog();
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

    const doubleOk = await confirm("Last chance — are you absolutely sure?", {
      title: "Final confirmation",
      confirmText: "Delete forever",
      danger: true,
    });
    if (!doubleOk) return;

    try {
      await deleteAccount.mutateAsync();
      await signOut();
    } catch (err) {
      setFeedback({ kind: "error", message: (err as Error).message });
    }
  }

  return (
    <section
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
    </section>
  );
}
