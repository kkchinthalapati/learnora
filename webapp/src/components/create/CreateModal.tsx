import { Modal } from "../Modal";
import type {
  CreateEntityType,
  OpenCreateModalOptions,
} from "../../context/createModal";
import { MaterialPanel } from "./MaterialPanel";
import { SubjectPanel } from "./SubjectPanel";
import { ExamPanel } from "./ExamPanel";
import { TaskPanel } from "./TaskPanel";
import styles from "./CreateModal.module.css";

interface CreateModalProps {
  options: OpenCreateModalOptions | null;
  onClose: () => void;
}

const TYPE_COPY: Record<CreateEntityType, { title: string; subtitle: string }> =
  {
    material: {
      title: "What do you want to learn?",
      subtitle:
        "Add one source, choose what helps, and see exactly what Learnora is doing.",
    },
    subject: {
      title: "Create a subject",
      subtitle: "Keep related materials, decks, and quizzes in one place.",
    },
    exam: {
      title: "Add an exam",
      subtitle:
        "Put an important date on your calendar and start the countdown.",
    },
    task: {
      title: "Add a task",
      subtitle: "Capture the next thing you need to get done.",
    },
  };

export function CreateModal({ options, onClose }: CreateModalProps) {
  const view = options?.type ?? "material";
  const title = options?.title ?? TYPE_COPY[view].title;

  return (
    <Modal
      open={options !== null}
      onClose={onClose}
      title={title}
      subtitle={TYPE_COPY[view].subtitle}
      contentClassName={view === "material" ? styles.wideModal : undefined}
    >
      {view === "material" ? (
        <MaterialPanel
          folderId={options?.folderId}
          materialId={options?.materialId}
          outputs={options?.outputs}
          onClose={onClose}
          onDone={options?.onDone}
        />
      ) : null}
      {view === "subject" ? (
        <SubjectPanel onClose={onClose} onDone={options?.onDone} />
      ) : null}
      {view === "exam" ? (
        <ExamPanel onClose={onClose} onDone={options?.onDone} />
      ) : null}
      {view === "task" ? (
        <TaskPanel onClose={onClose} onDone={options?.onDone} />
      ) : null}
    </Modal>
  );
}
