import { useState } from "react";
import { Modal } from "../Modal";
import type {
  CreateEntityType,
  OpenCreateModalOptions,
} from "../../context/createModal";
import { MaterialPanel } from "./MaterialPanel";
import { SubjectPanel } from "./SubjectPanel";
import { ExamPanel } from "./ExamPanel";
import { TaskPanel } from "./TaskPanel";
import shared from "./formShared.module.css";

interface CreateModalProps {
  options: OpenCreateModalOptions | null;
  onClose: () => void;
}

const TYPE_LABELS: Record<CreateEntityType, string> = {
  material: "Material",
  subject: "Subject",
  exam: "Exam",
  task: "Task",
};

const TYPE_COPY: Record<CreateEntityType, { title: string; subtitle: string }> =
  {
    material: {
      title: "Create study material",
      subtitle: "Turn anything into notes, flashcards, and quizzes.",
    },
    subject: {
      title: "New subject",
      subtitle: "A folder to keep its materials, decks, and quizzes together.",
    },
    exam: {
      title: "New exam",
      subtitle: "Add it to your calendar and we'll count down to the day.",
    },
    task: {
      title: "New task",
      subtitle: "Add something to your to-do list.",
    },
  };

const TYPE_ORDER: CreateEntityType[] = ["material", "subject", "exam", "task"];

/* The one creation entry point every "+" affordance in the app opens
 * (archive/REACT_MIGRATION.md Step 6) — a deliberate consolidation, not a straight
 * port: the vanilla app never had a single dialog spanning these four
 * entities (see the ledger's Step 6 note for why). Each panel owns its own
 * form state and submit logic; this shell only owns which panel is showing. */
export function CreateModal({ options, onClose }: CreateModalProps) {
  const open = options !== null;
  const openedOn = options?.type ?? "material";
  const [type, setType] = useState<CreateEntityType>(openedOn);
  const { title: defaultTitle, subtitle } = TYPE_COPY[type];
  /* A caller-supplied heading describes the form it opened on. Switching
     panels leaves that form, so the heading goes back to describing whatever
     is now on screen rather than mislabelling it. */
  const title =
    options?.title && type === openedOn ? options.title : defaultTitle;

  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle}>
      <div className={shared.inputGroup}>
        <label id="create-type-label">What are you creating?</label>
        <div
          className={shared.segmented}
          role="radiogroup"
          aria-labelledby="create-type-label"
        >
          {TYPE_ORDER.map((t) => (
            <label key={t} className={shared.segmentedOption}>
              <input
                type="radio"
                name="create-type"
                value={t}
                checked={type === t}
                onChange={() => setType(t)}
              />
              <span>{TYPE_LABELS[t]}</span>
            </label>
          ))}
        </div>
      </div>

      {type === "material" ? (
        <MaterialPanel
          folderId={options?.folderId}
          materialId={options?.materialId}
          outputs={options?.outputs}
          onClose={onClose}
          onDone={options?.onDone}
        />
      ) : null}
      {type === "subject" ? (
        <SubjectPanel onClose={onClose} onDone={options?.onDone} />
      ) : null}
      {type === "exam" ? (
        <ExamPanel onClose={onClose} onDone={options?.onDone} />
      ) : null}
      {type === "task" ? (
        <TaskPanel onClose={onClose} onDone={options?.onDone} />
      ) : null}
    </Modal>
  );
}
