import { useState } from "react";
import { Modal } from "../Modal";
import { Icon } from "../Icon";
import type { IconName } from "../icons";
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

type CreateView = "home" | CreateEntityType;

const TYPE_COPY: Record<CreateEntityType, { title: string; subtitle: string }> =
  {
    material: {
      title: "Build study resources",
      subtitle:
        "Turn a source into clear notes, flashcards, or a practice quiz.",
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

const QUICK_CREATES: Array<{
  type: Exclude<CreateEntityType, "material">;
  icon: IconName;
  title: string;
  description: string;
}> = [
  {
    type: "task",
    icon: "list-checks",
    title: "Task",
    description: "Add a to-do and optional due date.",
  },
  {
    type: "subject",
    icon: "folder",
    title: "Subject",
    description: "Organise resources for a class or topic.",
  },
  {
    type: "exam",
    icon: "calendar",
    title: "Exam",
    description: "Save a date and track your preparation.",
  },
];

export function CreateModal({ options, onClose }: CreateModalProps) {
  const open = options !== null;
  const openedOn: CreateView = options?.type ?? "home";
  const [view, setView] = useState<CreateView>(openedOn);
  const cameFromHome = openedOn === "home";

  const title =
    view === "home"
      ? "Create something new"
      : options?.title && view === openedOn
        ? options.title
        : TYPE_COPY[view].title;
  const subtitle =
    view === "home"
      ? "Choose what you want to accomplish. Learnora will guide the rest."
      : TYPE_COPY[view].subtitle;
  const isWide = view === "home" || view === "material";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      contentClassName={isWide ? styles.wideModal : undefined}
    >
      {view === "home" ? (
        <div className={styles.hub}>
          <button
            type="button"
            className={styles.studyCard}
            onClick={() => setView("material")}
          >
            <span className={styles.heroIcon} aria-hidden="true">
              <Icon name="book-open" size={26} />
            </span>
            <span className={styles.studyCopy}>
              <span className={styles.eyebrow}>Most popular</span>
              <strong>Build study resources</strong>
              <span>
                Upload a document or recording, paste text, add a link, or start
                with a topic.
              </span>
              <span
                className={styles.outputPills}
                aria-label="Creates notes, flashcards, and quizzes"
              >
                <span>Notes</span>
                <span>Flashcards</span>
                <span>Quiz</span>
              </span>
            </span>
            <Icon name="chevron-down" size={20} className={styles.cardArrow} />
          </button>

          <div className={styles.divider}>
            <span>Or create a quick item</span>
          </div>

          <div className={styles.quickGrid}>
            {QUICK_CREATES.map((item) => (
              <button
                type="button"
                key={item.type}
                className={styles.quickCard}
                onClick={() => setView(item.type)}
              >
                <span className={styles.quickIcon} aria-hidden="true">
                  <Icon name={item.icon} size={21} />
                </span>
                <strong>{item.title}</strong>
                <span>{item.description}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {cameFromHome ? (
            <button
              type="button"
              className={styles.backLink}
              onClick={() => setView("home")}
            >
              <span aria-hidden="true">←</span> All create options
            </button>
          ) : null}

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
        </>
      )}
    </Modal>
  );
}
