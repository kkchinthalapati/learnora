import { useState } from "react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { useCreateModal } from "../../context/createModal";
import { useExams } from "../../hooks/useExams";
import { useFolders } from "../../hooks/useFolders";
import { useTasks } from "../../hooks/useTasks";
import { Storage } from "../../lib/storage";
import styles from "./dashboard.module.css";

const DISMISSED_KEY = "onboarding_dismissed";

type OnboardingBannerProps = {
  onFocusTaskInput: () => void;
};

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
    <Card variant="elevated" padding="none" className={styles.onboardingBanner}>
      <div className={styles.onboardingHead}>
        <div>
          <h3>Welcome to Learnora</h3>
          <p className={styles.sub}>
            Upload your first study material or add a task to get started.
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
          <Icon name="x" size={18} />
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
    </Card>
  );
}
