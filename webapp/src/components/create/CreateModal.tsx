import { useState } from "react";
import { Modal } from "../Modal";
import { CaptureBar } from "../capture/CaptureBar";
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
      subtitle: "Keep related lessons, card sets, and quizzes in one place.",
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

/* "What do you want to learn?" opens on the capture bar: one field for a
   file, photo, link, notes, topic or recording. The full panel (a quiz, a
   subject, card counts) is behind "More options", and is where a caller
   lands that already names a saved material or asks for a quiz. */
const CAPTURE_SUBTITLE =
  "Bring what you're studying. Learnora makes notes and cards from it, then remembers what you get wrong.";

export function CreateModal({ options, onClose }: CreateModalProps) {
  const view = options?.type ?? "material";
  const title = options?.title ?? TYPE_COPY[view].title;
  /* Keyed to the open: `options` is a fresh object each time, so reopening
     starts on the capture bar again. */
  const [advancedFor, setAdvancedFor] =
    useState<OpenCreateModalOptions | null>(null);
  const capture =
    view === "material" &&
    !options?.materialId &&
    !options?.outputs?.quiz &&
    advancedFor !== options;

  return (
    <Modal
      open={options !== null}
      onClose={onClose}
      title={title}
      subtitle={capture ? CAPTURE_SUBTITLE : TYPE_COPY[view].subtitle}
      contentClassName={view === "material" ? styles.wideModal : undefined}
    >
      {capture ? (
        <CaptureBar
          folderId={options?.folderId ?? null}
          outputs={options?.outputs}
          autoFocus
          onMoreOptions={() => setAdvancedFor(options)}
          onDone={() => {
            options?.onDone?.();
            onClose();
          }}
        />
      ) : null}
      {view === "material" && !capture ? (
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
