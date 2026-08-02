import { useState } from "react";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { useCreateModal } from "../../context/createModal";
import { useExams } from "../../hooks/useExams";
import { useFolders } from "../../hooks/useFolders";
import { useTasks } from "../../hooks/useTasks";
import { Storage } from "../../lib/storage";
import styles from "./dashboard.module.css";

const DISMISSED_KEY = "onboarding_dismissed";

type OnboardingBannerProps = {
  /* DashboardView owns the task-input ref (DashboardTasksWidget lives two
   * components away, via TasksCard), so focusing it is a callback rather
   * than a document.getElementById lookup into a sibling's DOM. */
  onFocusTaskInput: () => void;
};

/* One-time nudge for a brand-new account — ports js/main.js:2318-2354.
 * Reads the same three queries the rest of the dashboard already issues
 * (Folders/Tasks/Exams), so TanStack Query's cache means this costs no
 * extra request. */
export function OnboardingBanner({ onFocusTaskInput }: OnboardingBannerProps) {
  const [dismissed, setDismissed] = useState(() =>
    Storage.get(DISMISSED_KEY, false),
  );
  const { data: folders } = useFolders();
  const { data: tasks } = useTasks();
  const { data: exams } = useExams();
  const { openCreateModal } = useCreateModal();

  const loaded =
    folders !== undefined && tasks !== undefined && exams !== undefined;
  const hasData =
    (folders?.length ?? 0) > 0 ||
    (tasks?.length ?? 0) > 0 ||
    (exams?.length ?? 0) > 0;

  if (dismissed || !loaded || hasData) return null;

  return (
    <div className={styles.onboardingBanner}>
      <div className={styles.onboardingHead}>
        <div>
          <h3>👋 Welcome to Learnora!</h3>
          <p className={styles.sub}>
            Upload your first study material or add a task to get started —
            Learnora AI will build notes, flashcards, and quizzes from it.
          </p>
        </div>
        <button
          type="button"
          className={styles.dismissBtn}
          aria-label="Dismiss"
          onClick={() => {
            Storage.set(DISMISSED_KEY, true);
            setDismissed(true);
          }}
        >
          ✖
        </button>
      </div>
      <div className={styles.onboardingActions}>
        <Button variant="primary" onClick={() => openCreateModal()}>
          <Icon name="upload-cloud" size={15} /> Create study material
        </Button>
        <Button onClick={onFocusTaskInput}>
          <Icon name="list-checks" size={15} /> Add a task
        </Button>
      </div>
    </div>
  );
}
