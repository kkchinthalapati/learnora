import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import { useNavigate } from "react-router";
import { useFolders, useAddFolder } from "../../hooks/useFolders";
import { useMaterials } from "../../hooks/useMaterials";
import { useQuizDraft } from "../../hooks/useQuizDraft";
import { Storage } from "../../lib/storage";
import { MATERIAL_DRAFT_KEY } from "../../lib/draftKeys";
import { useCreateStudyPackage } from "../../hooks/useStudyPackage";
import { useDialog } from "../../context/dialog";
import { useSettings } from "../../context/settings";
import { useToast } from "../../context/toast";
import {
  CREATE_DEFAULTS,
  MAX_UPLOAD_BYTES,
  summarizeStudyPackage,
  studyPackageDestination,
  type StageFailure,
  type StudySource,
} from "../../api/studyPackage";
import { AI_PERSONA_QUIZ_HOST } from "../../lib/settings";
import type { Folder } from "../../api/types";
import type { IconName } from "../icons";
import styles from "./MaterialPanel.module.css";
import { Button } from "../Button";
import { Icon } from "../Icon";

export interface MaterialPanelProps {
  folderId?: string | null;
  materialId?: string;
  outputs?: { flashcards?: boolean; quiz?: boolean; notes?: boolean };
  onClose: () => void;
  onDone?: () => void;
}

type SourceKind = StudySource["kind"];
type Difficulty = typeof CREATE_DEFAULTS.difficulty;

const FOLDER_COLORS = ["#4A90E2", "#E24A4A", "#4AE283", "#E2A84A", "#9B4AE2"];
const PERSONALITY_DESC: Record<string, string> = {
  "Friendly Tutor": "Patient and supportive, with step-by-step explanations.",
  "Strict Coach": "Direct and challenging, with a focus on improvement.",
  "Sarcastic Buddy": "Casual and playful, with light humour.",
  "Academic Professor": "Formal, precise, and textbook-style.",
};

const SOURCE_TABS: Array<{
  kind: SourceKind;
  label: string;
  accessibleLabel?: string;
  icon: IconName;
}> = [
  {
    kind: "file",
    label: "Upload",
    accessibleLabel: "Upload Document / PDF",
    icon: "upload-cloud",
  },
  {
    kind: "text",
    label: "Paste text",
    accessibleLabel: "Paste Text / Notes",
    icon: "file-text",
  },
  {
    kind: "topic",
    label: "Topic",
    icon: "brain",
  },
  {
    kind: "link",
    label: "Link",
    accessibleLabel: "Web Link",
    icon: "link",
  },
  {
    kind: "material",
    label: "From Learnora",
    accessibleLabel: "Saved Material",
    icon: "folder",
  },
];

interface MaterialDraft {
  text: string;
  link: string;
  topic: string;
  titleOverride: string;
}

export function MaterialPanel({
  folderId: initialFolderId,
  materialId: initialMaterialId,
  outputs,
  onClose,
  onDone,
}: MaterialPanelProps) {
  const { settings } = useSettings();

  const [restoredDraft] = useState<MaterialDraft | null>(() =>
    Storage.get<MaterialDraft>(MATERIAL_DRAFT_KEY),
  );

  const [source, setSource] = useState<SourceKind>(() => {
    if (initialMaterialId) return "material";
    if (restoredDraft?.text) return "text";
    if (restoredDraft?.topic) return "topic";
    if (restoredDraft?.link) return "link";
    return "file";
  });

  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [text, setText] = useState(restoredDraft?.text ?? "");
  const [link, setLink] = useState(restoredDraft?.link ?? "");
  const [materialId, setMaterialId] = useState(initialMaterialId ?? "");
  const [topic, setTopic] = useState(restoredDraft?.topic ?? "");

  // Outputs: 1-tap toggles
  const [wantFlashcards, setWantFlashcards] = useState(
    outputs?.flashcards !== undefined ? outputs.flashcards : true,
  );
  const [wantQuiz, setWantQuiz] = useState(
    outputs?.quiz !== undefined ? outputs.quiz : false,
  );
  const [wantNotes, setWantNotes] = useState(
    outputs?.notes !== undefined ? outputs.notes : true,
  );

  const [folderId, setFolderId] = useState(initialFolderId ?? "");
  const [titleOverride, setTitleOverride] = useState(
    restoredDraft?.titleOverride ?? "",
  );
  const [cardCount, setCardCount] = useState(CREATE_DEFAULTS.cardCount);
  const [questionCount, setQuestionCount] = useState(
    CREATE_DEFAULTS.questionCount,
  );
  const [difficulty, setDifficulty] = useState<Difficulty>(
    CREATE_DEFAULTS.difficulty,
  );
  const [personality, setPersonality] = useState(
    AI_PERSONA_QUIZ_HOST[settings.aiPersona],
  );

  const [error, setError] = useState<string | null>(null);
  const [stageFailures, setStageFailures] = useState<StageFailure[]>([]);
  const [createdMaterialId, setCreatedMaterialId] = useState<string | null>(
    initialMaterialId ?? null,
  );
  const [progress, setProgress] = useState<string | null>(null);
  const [extraFolder, setExtraFolder] = useState<Folder | null>(null);

  const worthKeeping =
    text.trim().length > 0 ||
    topic.trim().length > 0 ||
    titleOverride.trim().length > 0;
  const { clear: clearDraft } = useQuizDraft<MaterialDraft>(
    MATERIAL_DRAFT_KEY,
    { text, link, topic, titleOverride },
    { enabled: worthKeeping, warnOnUnload: worthKeeping },
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const materialSelectRef = useRef<HTMLSelectElement>(null);
  const topicRef = useRef<HTMLInputElement>(null);
  const folderSelectRef = useRef<HTMLSelectElement>(null);
  const flashcardsRef = useRef<HTMLInputElement>(null);

  const foldersQuery = useFolders();
  const materialsQuery = useMaterials();
  const addFolder = useAddFolder();
  const create = useCreateStudyPackage();
  const { promptText } = useDialog();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const fetchedFolders = foldersQuery.data ?? [];
  const folders =
    extraFolder &&
    !fetchedFolders.some((folder) => folder.id === extraFolder.id)
      ? [...fetchedFolders, extraFolder]
      : fetchedFolders;
  const savedMaterials = materialsQuery.data ?? [];
  const hasSavedMaterials = savedMaterials.length > 0;
  const isNewMaterial =
    source === "file" || source === "text" || source === "link";

  const didDefaultFolder = useRef(false);
  useEffect(() => {
    const loaded = foldersQuery.data;
    if (didDefaultFolder.current || !loaded || loaded.length === 0) return;
    didDefaultFolder.current = true;
    if (!initialFolderId) setFolderId(loaded[0].id);
  }, [foldersQuery.data, initialFolderId]);

  const chooseSource = (kind: SourceKind) => {
    setSource(kind);
    setError(null);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length) {
      setFile(event.dataTransfer.files[0]);
      setError(null);
    }
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    setError(null);
  };

  const handleNewFolder = async () => {
    const name = await promptText(
      "Give it a name so it's easy to find later.",
      {
        title: "New subject",
        placeholder: "e.g. CS101, Biology",
        confirmText: "Create subject",
      },
    );
    if (!name) return;
    const color =
      FOLDER_COLORS[Math.floor(Math.random() * FOLDER_COLORS.length)];
    try {
      const created = await addFolder.mutateAsync({ name, color });
      setExtraFolder(created);
      setFolderId(created.id);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : "Couldn’t create that subject. Please try again.",
      );
    }
  };

  const validateSource = (): { message: string; focus: () => void } | null => {
    if (source === "file") {
      if (!file) {
        return {
          message: "Choose a file to create from.",
          focus: () => fileInputRef.current?.focus(),
        };
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        const mb = (file.size / (1024 * 1024)).toFixed(1);
        return {
          message: `That file is ${mb}MB. The limit is 10MB.`,
          focus: () => fileInputRef.current?.focus(),
        };
      }
    }

    if (source === "text" && text.trim().length < 50) {
      return {
        message:
          "That text is a bit short to study from. Add at least a paragraph.",
        focus: () => textareaRef.current?.focus(),
      };
    }

    if (source === "link") {
      const raw = link.trim();
      let parsed: URL;
      try {
        parsed = new URL(raw);
      } catch {
        return {
          message: "That doesn't look like a link.",
          focus: () => linkRef.current?.focus(),
        };
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return {
          message: "Links have to start with http:// or https://.",
          focus: () => linkRef.current?.focus(),
        };
      }
    }

    if (source === "material" && !materialId) {
      return {
        message: "Choose which saved material to build from.",
        focus: () => materialSelectRef.current?.focus(),
      };
    }

    if (source === "topic" && !topic.trim()) {
      return {
        message: "Enter a topic to create from.",
        focus: () => topicRef.current?.focus(),
      };
    }
    return null;
  };

  const buildSource = (): StudySource => {
    if (source === "file") return { kind: "file", file };
    if (source === "text") return { kind: "text", text };
    if (source === "link") return { kind: "link", url: link };
    if (source === "material") return { kind: "material", materialId };
    return { kind: "topic", topic };
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (create.isPending) return;

    if (!wantFlashcards && !wantQuiz && !wantNotes) {
      setError("Pick at least one thing to create.");
      flashcardsRef.current?.focus();
      return;
    }

    const sourceProblem = validateSource();
    if (sourceProblem) {
      setError(sourceProblem.message);
      sourceProblem.focus();
      return;
    }

    if (source !== "topic" && !folderId) {
      setError("Choose a subject to save this into, or create one.");
      folderSelectRef.current?.focus();
      return;
    }

    setError(null);
    setStageFailures([]);
    setProgress("Getting started…");

    try {
      const sourceToUse =
        createdMaterialId && isNewMaterial
          ? { kind: "material" as const, materialId: createdMaterialId }
          : buildSource();

      const result = await create.mutateAsync({
        source: sourceToUse,
        folderId: source === "topic" ? null : folderId || null,
        title: titleOverride,
        outputs: {
          flashcards: wantFlashcards,
          quiz: wantQuiz,
          notes: wantNotes,
        },
        options: { cardCount, questionCount, difficulty, personality },
        onProgress: setProgress,
      });

      if (result.material) {
        clearDraft();
        setCreatedMaterialId(result.material.id);
      }

      if (result.failures.length > 0) {
        setStageFailures(result.failures);
      }

      const summary = summarizeStudyPackage(result);
      if (!summary) {
        setError(
          result.failures[0]?.message ??
            "Nothing could be generated this time. Please try again in a moment.",
        );
        return;
      }

      showToast(summary);
      const refusal = result.failures.find((failure) => failure.refused);
      if (refusal) showToast(refusal.message, { error: true });
      onDone?.();
      onClose();
      const destination = studyPackageDestination(result);
      if (destination) void navigate(destination);
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setProgress(null);
    }
  };

  const handleRetryFailedStages = async () => {
    if (create.isPending) return;
    setError(null);
    setProgress("Retrying failed stages…");

    try {
      const failedNotes = stageFailures.some((f) => f.stage === "notes");
      const failedFlashcards = stageFailures.some(
        (f) => f.stage === "flashcards",
      );
      const failedQuiz = stageFailures.some((f) => f.stage === "quiz");

      const retryFlashcards =
        failedNotes || stageFailures.length === 0
          ? wantFlashcards
          : failedFlashcards;
      const retryQuiz =
        failedNotes || stageFailures.length === 0 ? wantQuiz : failedQuiz;

      const sourceToUse = createdMaterialId
        ? { kind: "material" as const, materialId: createdMaterialId }
        : buildSource();

      const result = await create.mutateAsync({
        source: sourceToUse,
        folderId: source === "topic" ? null : folderId || null,
        title: titleOverride,
        outputs: {
          flashcards: retryFlashcards,
          quiz: retryQuiz,
          notes: wantNotes,
        },
        options: { cardCount, questionCount, difficulty, personality },
        onProgress: setProgress,
      });

      if (result.material) {
        clearDraft();
        setCreatedMaterialId(result.material.id);
      }

      if (result.failures.length > 0) {
        setStageFailures(result.failures);
      } else {
        setStageFailures([]);
      }

      const summary = summarizeStudyPackage(result);
      if (!summary) {
        setError(
          result.failures[0]?.message ??
            "Retry failed. Please check your options and try again.",
        );
        return;
      }

      showToast(summary);
      const refusal = result.failures.find((failure) => failure.refused);
      if (refusal) showToast(refusal.message, { error: true });
      onDone?.();
      onClose();
      const destination = studyPackageDestination(result);
      if (destination) void navigate(destination);
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : "Retry failed. Please try again.",
      );
    } finally {
      setProgress(null);
    }
  };

  const visibleTabs = SOURCE_TABS.filter(
    (tab) =>
      tab.kind !== "material" ||
      Boolean(initialMaterialId) ||
      hasSavedMaterials,
  );

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      noValidate
      className={styles.panel}
    >
      {/* Step 1: Provide Source */}
      <section
        className={styles.section}
        aria-labelledby="source-section-heading"
      >
        <div className={styles.sectionHeader}>
          <h3
            id="source-section-heading"
            className={styles.sectionTitle}
            aria-label="1. Provide Source"
          >
            Start with one source
          </h3>
          <span className={styles.sectionHint}>
            Your source keeps the result grounded
          </span>
        </div>

        <div
          className={styles.sourceTabs}
          role="tablist"
          aria-label="Source formats"
        >
          {visibleTabs.map((tab) => (
            <button
              key={tab.kind}
              type="button"
              role="tab"
              aria-label={tab.accessibleLabel}
              aria-selected={source === tab.kind}
              className={`${styles.sourceTab} ${source === tab.kind ? styles.sourceTabActive : ""}`}
              onClick={() => chooseSource(tab.kind)}
            >
              <span className={styles.tabIcon} aria-hidden="true">
                <Icon name={tab.icon} size={17} />
              </span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className={styles.sourceInputContainer}>
          {source === "file" ? (
            <div
              className={`${styles.dropzone} ${isDragging ? styles.dragging : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              aria-label="Upload document or recording"
            >
              <input
                ref={fileInputRef}
                type="file"
                className={styles.srOnly}
                accept=".pdf,.doc,.docx,.txt,.mp3,.mp4,.wav,.m4a,.aac,.ogg"
                onChange={handleFileInputChange}
              />
              <span className={styles.dropzoneIcon} aria-hidden="true">
                <Icon name={file ? "check" : "upload-cloud"} size={26} />
              </span>
              {file ? (
                <div className={styles.fileSelected}>
                  <strong>{file.name}</strong>
                  <span>
                    {`${Math.max(0.1, file.size / (1024 * 1024)).toFixed(1)}MB selected`}
                  </span>
                </div>
              ) : (
                <div className={styles.dropzonePrompt}>
                  <strong>Drop a file here, or browse</strong>
                  <span>PDF, Word, text, audio, or video · up to 10MB</span>
                </div>
              )}
              <label
                className={styles.fileButton}
                onClick={(e) => e.stopPropagation()}
              >
                {file ? "Replace file" : "Browse files"}
                <input
                  className={styles.srOnly}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.mp3,.mp4,.wav,.m4a,.aac,.ogg"
                  onChange={handleFileInputChange}
                />
              </label>
            </div>
          ) : null}

          {source === "text" ? (
            <div>
              <label htmlFor="material-text" className={styles.fieldLabel}>
                Paste your notes or text
              </label>
              <textarea
                ref={textareaRef}
                id="material-text"
                className={styles.textarea}
                rows={6}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setError(null);
                }}
                placeholder="Paste lecture notes, study guide, or transcript text here…"
                autoFocus
              />
              <p className={styles.fieldHint}>
                At least one paragraph works best.
              </p>
            </div>
          ) : null}

          {source === "topic" ? (
            <div>
              <label htmlFor="material-topic" className={styles.fieldLabel}>
                Topic
              </label>
              <input
                ref={topicRef}
                id="material-topic"
                className={styles.input}
                type="text"
                value={topic}
                onChange={(e) => {
                  setTopic(e.target.value);
                  setError(null);
                }}
                placeholder="e.g. Ionic bonding, French Revolution, Quantum physics…"
                autoFocus
              />
              <p className={styles.infoNote}>
                <Icon name="help-circle" size={16} />
                No source attached. AI may use general knowledge and can be
                wrong.
              </p>
            </div>
          ) : null}

          {source === "link" ? (
            <div>
              <label htmlFor="material-link" className={styles.fieldLabel}>
                Web or YouTube link
              </label>
              <input
                ref={linkRef}
                id="material-link"
                className={styles.input}
                type="url"
                value={link}
                onChange={(e) => {
                  setLink(e.target.value);
                  setError(null);
                }}
                placeholder="https://youtube.com/watch?v=…"
                autoFocus
              />
              <p className={styles.infoNote}>
                <Icon name="help-circle" size={16} />
                YouTube links use the video's title and topic, not its full
                transcript. For spoken content, upload the audio or video file
                instead.
              </p>
            </div>
          ) : null}

          {source === "material" ? (
            <div>
              <label htmlFor="material-select" className={styles.fieldLabel}>
                Saved material
              </label>
              <select
                ref={materialSelectRef}
                id="material-select"
                className={styles.select}
                value={materialId}
                onChange={(e) => {
                  setMaterialId(e.target.value);
                  setError(null);
                }}
                autoFocus
              >
                <option value="" disabled>
                  {materialsQuery.isLoading
                    ? "Loading your materials…"
                    : "Choose a material…"}
                </option>
                {savedMaterials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
              <p className={styles.fieldHint}>Nothing is uploaded again.</p>
            </div>
          ) : null}
        </div>
      </section>

      {/* Step 2: Choose Outputs */}
      <section
        className={styles.section}
        aria-labelledby="outputs-section-heading"
      >
        <div className={styles.sectionHeader}>
          <h3 id="outputs-section-heading" className={styles.sectionTitle}>
            Choose your study kit
          </h3>
          <span className={styles.sectionHint}>Pick one or more</span>
        </div>

        <div className={styles.outputGrid}>
          {/* Flashcards */}
          <label
            className={`${styles.outputCard} ${wantFlashcards ? styles.outputCardActive : ""}`}
          >
            <input
              ref={flashcardsRef}
              type="checkbox"
              checked={wantFlashcards}
              onChange={(e) => {
                setWantFlashcards(e.target.checked);
                setError(null);
              }}
              className={styles.srOnly}
            />
            <div className={styles.outputCardHeader}>
              <span className={styles.outputIcon} aria-hidden="true">
                <Icon name="layers" size={20} />
              </span>
              <span className={styles.checkboxVisual} aria-hidden="true">
                {wantFlashcards && <Icon name="check" size={13} />}
              </span>
            </div>
            <div className={styles.outputCopy}>
              <strong>Flashcards</strong>
              <span>Active Recall Decks</span>
            </div>
          </label>

          {/* Practice Quiz */}
          <label
            className={`${styles.outputCard} ${wantQuiz ? styles.outputCardActive : ""}`}
          >
            <input
              type="checkbox"
              checked={wantQuiz}
              onChange={(e) => {
                setWantQuiz(e.target.checked);
                setError(null);
              }}
              className={styles.srOnly}
            />
            <div className={styles.outputCardHeader}>
              <span className={styles.outputIcon} aria-hidden="true">
                <Icon name="help-circle" size={20} />
              </span>
              <span className={styles.checkboxVisual} aria-hidden="true">
                {wantQuiz && <Icon name="check" size={13} />}
              </span>
            </div>
            <div className={styles.outputCopy}>
              <strong>Practice Quiz</strong>
              <span>Multiple Choice & Conceptual Questions</span>
            </div>
          </label>

          {/* Summary Notes */}
          <label
            className={`${styles.outputCard} ${wantNotes ? styles.outputCardActive : ""}`}
          >
            <input
              type="checkbox"
              checked={wantNotes}
              onChange={(e) => {
                setWantNotes(e.target.checked);
                setError(null);
              }}
              className={styles.srOnly}
            />
            <div className={styles.outputCardHeader}>
              <span className={styles.outputIcon} aria-hidden="true">
                <Icon name="file-text" size={20} />
              </span>
              <span className={styles.checkboxVisual} aria-hidden="true">
                {wantNotes && <Icon name="check" size={13} />}
              </span>
            </div>
            <div className={styles.outputCopy}>
              <strong>Summary Notes</strong>
              <span>Crisp Revision Notes</span>
            </div>
          </label>
        </div>
      </section>

      {/* Destination Subject */}
      {source !== "topic" ? (
        <div className={styles.destinationRow}>
          <label htmlFor="material-folder" className={styles.fieldLabel}>
            Subject
          </label>
          <div className={styles.selectWithButton}>
            <select
              ref={folderSelectRef}
              id="material-folder"
              className={styles.select}
              value={folderId}
              onChange={(e) => {
                setFolderId(e.target.value);
                setError(null);
              }}
            >
              <option value="" disabled>
                {folders.length ? "Choose a subject…" : "No subjects yet"}
              </option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void handleNewFolder()}
              className={styles.newFolderBtn}
            >
              <Icon name="plus" size={14} /> New subject
            </Button>
          </div>
          {!foldersQuery.isLoading && folders.length === 0 ? (
            <p className={styles.infoNote}>
              <Icon name="folder" size={16} />
              Create a subject first so this resource has a home.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Expandable Fine-tune Settings */}
      <details className={styles.advancedDetails}>
        <summary className={styles.advancedSummary}>
          <span>Fine-tune generation</span>
          <Icon name="chevron-down" size={16} />
        </summary>
        <div className={styles.advancedBody}>
          <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
            <label htmlFor="material-title" className={styles.fieldLabel}>
              Title <span className={styles.fieldHint}>(optional)</span>
            </label>
            <input
              id="material-title"
              className={styles.input}
              type="text"
              value={titleOverride}
              onChange={(e) => setTitleOverride(e.target.value)}
              placeholder="Auto-generated if left blank"
            />
          </div>

          {wantFlashcards ? (
            <div className={styles.formGroup}>
              <label
                htmlFor="material-card-count"
                className={styles.fieldLabel}
              >
                Flashcards: {cardCount}
              </label>
              <input
                id="material-card-count"
                type="range"
                min={5}
                max={30}
                step={1}
                value={cardCount}
                onChange={(e) => setCardCount(Number(e.target.value))}
                className={styles.rangeInput}
              />
            </div>
          ) : null}

          {wantQuiz ? (
            <>
              <div className={styles.formGroup}>
                <label
                  htmlFor="material-question-count"
                  className={styles.fieldLabel}
                >
                  Quiz questions: {questionCount}
                </label>
                <input
                  id="material-question-count"
                  type="range"
                  min={5}
                  max={20}
                  step={1}
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Number(e.target.value))}
                  className={styles.rangeInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label
                  id="material-difficulty-label"
                  className={styles.fieldLabel}
                >
                  Quiz difficulty
                </label>
                <div
                  className={styles.segmented}
                  role="radiogroup"
                  aria-labelledby="material-difficulty-label"
                >
                  {(["Easy", "Medium", "Hard"] as const).map((level) => (
                    <label key={level} className={styles.segmentedOption}>
                      <input
                        type="radio"
                        name="material-difficulty"
                        value={level}
                        checked={difficulty === level}
                        onChange={() => setDifficulty(level)}
                      />
                      <span>{level}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className={styles.formGroup}>
                <label
                  htmlFor="material-personality"
                  className={styles.fieldLabel}
                >
                  Quiz host
                </label>
                <select
                  id="material-personality"
                  className={styles.select}
                  value={personality}
                  onChange={(e) => setPersonality(e.target.value)}
                >
                  {Object.keys(PERSONALITY_DESC).map((host) => (
                    <option key={host} value={host}>
                      {host}
                    </option>
                  ))}
                </select>
                <p className={styles.fieldHint}>
                  {PERSONALITY_DESC[personality]}
                </p>
              </div>
            </>
          ) : null}
        </div>
      </details>

      {/* Failures and Errors */}
      {stageFailures.length > 0 ? (
        <div className={styles.failureAlert} role="alert">
          <div className={styles.failureHead}>
            <Icon name="alert-circle" size={18} />
            <span>Some stages encountered errors during generation:</span>
          </div>
          <ul className={styles.failureList}>
            {stageFailures.map((failure, idx) => (
              <li key={idx}>
                <span className={styles.failureStage}>{failure.stage}:</span>{" "}
                {failure.message}
              </li>
            ))}
          </ul>
          <div className={styles.failureActions}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={create.isPending}
              onClick={() => void handleRetryFailedStages()}
            >
              {create.isPending ? "Retrying..." : "Retry Failed Stages"}
            </Button>
          </div>
        </div>
      ) : error ? (
        <div className={styles.failureAlert} role="alert">
          <div className={styles.failureHead}>
            <Icon name="alert-circle" size={18} />
            <span>{error}</span>
          </div>
          <div className={styles.failureActions}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={create.isPending}
              onClick={() => void handleRetryFailedStages()}
            >
              {create.isPending ? "Retrying..." : "Retry Failed Stages"}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Progress Animation */}
      {progress ? (
        <div className={styles.progress} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <div className={styles.progressCopy}>
            <strong>Building from your source</strong>
            <span>{progress}</span>
          </div>
        </div>
      ) : null}

      {/* Action Footer */}
      <div className={styles.actions}>
        <Button type="button" onClick={onClose} disabled={create.isPending}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={create.isPending}
          className={styles.submitButton}
          aria-label={
            create.isPending ? "Creating…" : "Generate Study Resources"
          }
        >
          {create.isPending ? "Creating…" : "Create my study kit"}
        </Button>
      </div>
    </form>
  );
}
