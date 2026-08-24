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
import shared from "./formShared.module.css";
import styles from "./MaterialPanel.module.css";
import { Button } from "../Button";
import { Icon } from "../Icon";

interface MaterialPanelProps {
  folderId?: string | null;
  materialId?: string;
  outputs?: { flashcards?: boolean; quiz?: boolean };
  onClose: () => void;
  onDone?: () => void;
}

type SourceKind = StudySource["kind"];
type Difficulty = typeof CREATE_DEFAULTS.difficulty;
type WizardStep = "source" | "results" | "details";

const STEP_ORDER: WizardStep[] = ["source", "results", "details"];
const STEP_LABELS: Record<WizardStep, string> = {
  source: "Add a source",
  results: "Choose results",
  details: "Review & create",
};
const FOLDER_COLORS = ["#4A90E2", "#E24A4A", "#4AE283", "#E2A84A", "#9B4AE2"];
const PERSONALITY_DESC: Record<string, string> = {
  "Friendly Tutor": "Patient and supportive, with step-by-step explanations.",
  "Strict Coach": "Direct and challenging, with a focus on improvement.",
  "Sarcastic Buddy": "Casual and playful, with light humour.",
  "Academic Professor": "Formal, precise, and textbook-style.",
};

const SOURCE_OPTIONS: Array<{
  kind: SourceKind;
  label: string;
  description: string;
  icon: IconName;
}> = [
  {
    kind: "file",
    label: "Document or recording",
    description: "PDF, Word, text, audio, or video",
    icon: "upload-cloud",
  },
  {
    kind: "text",
    label: "Paste text",
    description: "Lecture notes, an article, or a transcript",
    icon: "file-text",
  },
  {
    kind: "link",
    label: "Web or video link",
    description: "A web page or YouTube URL",
    icon: "link",
  },
  {
    kind: "material",
    label: "Saved material",
    description: "Build from something already in Learnora",
    icon: "folder",
  },
  {
    kind: "topic",
    label: "Just a topic",
    description: "No source needed — start from general knowledge",
    icon: "brain",
  },
];

export function MaterialPanel({
  folderId: initialFolderId,
  materialId: initialMaterialId,
  outputs,
  onClose,
  onDone,
}: MaterialPanelProps) {
  const { settings } = useSettings();
  const initialStep: WizardStep = initialMaterialId ? "results" : "source";
  const [step, setStep] = useState<WizardStep>(initialStep);
  const [maxStep, setMaxStep] = useState(initialMaterialId ? 1 : 0);
  const [source, setSource] = useState<SourceKind>(
    initialMaterialId ? "material" : "file",
  );
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [materialId, setMaterialId] = useState(initialMaterialId ?? "");
  const [topic, setTopic] = useState("");
  const [wantFlashcards, setWantFlashcards] = useState(
    outputs?.flashcards ?? true,
  );
  const [wantQuiz, setWantQuiz] = useState(outputs?.quiz ?? false);
  const [folderId, setFolderId] = useState(initialFolderId ?? "");
  const [titleOverride, setTitleOverride] = useState("");
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const materialSelectRef = useRef<HTMLSelectElement>(null);
  const topicRef = useRef<HTMLInputElement>(null);
  const folderSelectRef = useRef<HTMLSelectElement>(null);
  const flashcardsRef = useRef<HTMLInputElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

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
  const activeStepIndex = STEP_ORDER.indexOf(step);

  const didDefaultFolder = useRef(false);
  useEffect(() => {
    const loaded = foldersQuery.data;
    if (didDefaultFolder.current || !loaded || loaded.length === 0) return;
    didDefaultFolder.current = true;
    if (!initialFolderId) setFolderId(loaded[0].id);
  }, [foldersQuery.data, initialFolderId]);

  useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [step]);

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
    const created = await addFolder.mutateAsync({ name, color });
    setExtraFolder(created);
    setFolderId(created.id);
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

  const moveTo = (nextStep: WizardStep) => {
    setError(null);
    setStep(nextStep);
    setMaxStep((current) => Math.max(current, STEP_ORDER.indexOf(nextStep)));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (create.isPending) return;

    if (step === "source") {
      const problem = validateSource();
      if (problem) {
        setError(problem.message);
        problem.focus();
        return;
      }
      moveTo("results");
      return;
    }

    if (step === "results") {
      if (!wantFlashcards && !wantQuiz && !isNewMaterial) {
        setError("Pick at least one thing to create.");
        flashcardsRef.current?.focus();
        return;
      }
      moveTo("details");
      return;
    }

    const sourceProblem = validateSource();
    if (sourceProblem) {
      setError(sourceProblem.message);
      setStep("source");
      window.setTimeout(sourceProblem.focus, 0);
      return;
    }
    if (isNewMaterial && !folderId) {
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
        outputs: { flashcards: wantFlashcards, quiz: wantQuiz },
        options: { cardCount, questionCount, difficulty, personality },
        onProgress: setProgress,
      });

      if (result.material) {
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
        failedNotes || stageFailures.length === 0
          ? wantQuiz
          : failedQuiz;

      const sourceToUse =
        createdMaterialId && !failedNotes
          ? { kind: "material" as const, materialId: createdMaterialId }
          : buildSource();

      const result = await create.mutateAsync({
        source: sourceToUse,
        folderId: source === "topic" ? null : folderId || null,
        title: titleOverride,
        outputs: { flashcards: retryFlashcards, quiz: retryQuiz },
        options: { cardCount, questionCount, difficulty, personality },
        onProgress: setProgress,
      });

      if (result.material) {
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

  const selectedSource = SOURCE_OPTIONS.find(
    (option) => option.kind === source,
  );
  const selectedFolder = folders.find((folder) => folder.id === folderId);
  const selectedMaterial = savedMaterials.find(
    (material) => material.id === materialId,
  );
  const sourceSummary =
    source === "file" && file
      ? file.name
      : source === "text" && text.trim()
        ? `${text.trim().slice(0, 38)}${text.trim().length > 38 ? "…" : ""}`
        : source === "link" && link.trim()
          ? link.trim()
          : source === "material" && selectedMaterial
            ? selectedMaterial.title
            : source === "topic" && topic.trim()
              ? topic.trim()
              : selectedSource?.label;
  const resultSummary = [
    ...(isNewMaterial ? ["Notes"] : []),
    ...(wantFlashcards ? [`${cardCount} flashcards`] : []),
    ...(wantQuiz ? [`${questionCount}-question quiz`] : []),
  ];
  const createLabel =
    resultSummary.length > 1
      ? "Create study kit"
      : `Create ${resultSummary[0]?.toLowerCase() ?? "resources"}`;

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate>
      <nav className={styles.stepper} aria-label="Creation progress">
        <ol>
          {STEP_ORDER.map((item, index) => (
            <li
              key={item}
              className={index < activeStepIndex ? styles.completeStep : ""}
            >
              <button
                type="button"
                onClick={() => moveTo(item)}
                disabled={index > maxStep || create.isPending}
                aria-current={step === item ? "step" : undefined}
              >
                <span className={styles.stepNumber} aria-hidden="true">
                  {index < activeStepIndex ? (
                    <Icon name="check" size={14} />
                  ) : (
                    index + 1
                  )}
                </span>
                <span>{STEP_LABELS[item]}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className={styles.workspace}>
        <main className={styles.stage}>
          {step === "source" ? (
            <section aria-labelledby="source-step-heading">
              <div className={styles.stageHead}>
                <span className={styles.stepKicker}>Step 1 of 3</span>
                <h3 id="source-step-heading" ref={stepHeadingRef} tabIndex={-1}>
                  What are you learning from?
                </h3>
                <p>
                  Choose one source. You can decide what Learnora makes next.
                </p>
              </div>

              <fieldset className={styles.sourceChoices}>
                <legend className={styles.srOnly}>Choose a source</legend>
                {SOURCE_OPTIONS.filter(
                  (option) => option.kind !== "material" || hasSavedMaterials,
                ).map((option) => (
                  <label key={option.kind} className={styles.choiceCard}>
                    <input
                      type="radio"
                      name="material-source"
                      value={option.kind}
                      checked={source === option.kind}
                      onChange={() => chooseSource(option.kind)}
                    />
                    <span className={styles.choiceIcon} aria-hidden="true">
                      <Icon name={option.icon} size={19} />
                    </span>
                    <span className={styles.choiceCopy}>
                      <strong>{option.label}</strong>
                      <span>{option.description}</span>
                    </span>
                    <span className={styles.choiceMark} aria-hidden="true">
                      <Icon name="check" size={13} />
                    </span>
                  </label>
                ))}
              </fieldset>

              <div className={styles.sourceInput}>
                {source === "file" ? (
                  <div
                    className={`${styles.dropzone} ${isDragging ? styles.dragging : ""}`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                  >
                    <Icon name={file ? "check" : "upload-cloud"} size={27} />
                    <div>
                      <strong>{file ? file.name : "Drop a file here"}</strong>
                      <p>
                        {file
                          ? `${Math.max(0.1, file.size / (1024 * 1024)).toFixed(1)}MB selected`
                          : "PDF, Word, text, audio, or video · up to 10MB"}
                      </p>
                    </div>
                    <label className={styles.fileButton}>
                      {file ? "Replace file" : "Browse files"}
                      <input
                        ref={fileInputRef}
                        className={styles.srOnly}
                        type="file"
                        accept=".pdf,.doc,.docx,.txt,.mp3,.mp4,.wav,.m4a,.aac,.ogg"
                        onChange={handleFileInputChange}
                      />
                    </label>
                  </div>
                ) : null}

                {source === "text" ? (
                  <div className={shared.inputGroup}>
                    <label htmlFor="material-text">
                      Paste your notes or text
                    </label>
                    <textarea
                      ref={textareaRef}
                      id="material-text"
                      className={shared.field}
                      rows={7}
                      value={text}
                      onChange={(event) => setText(event.target.value)}
                      placeholder="Paste lecture notes, an article, or a transcript…"
                      autoFocus
                    />
                    <p className={shared.fieldDesc}>
                      At least one paragraph works best.
                    </p>
                  </div>
                ) : null}

                {source === "link" ? (
                  <div className={shared.inputGroup}>
                    <label htmlFor="material-link">Web or YouTube link</label>
                    <input
                      ref={linkRef}
                      id="material-link"
                      className={shared.field}
                      type="url"
                      value={link}
                      onChange={(event) => setLink(event.target.value)}
                      placeholder="https://youtube.com/watch?v=…"
                      autoFocus
                    />
                    <p className={styles.infoNote}>
                      <Icon name="help-circle" size={16} />
                      YouTube links use the video's title and topic, not its
                      full transcript. For spoken content, upload the audio or
                      video file instead.
                    </p>
                  </div>
                ) : null}

                {source === "material" ? (
                  <div className={shared.inputGroup}>
                    <label htmlFor="material-select">Saved material</label>
                    <select
                      ref={materialSelectRef}
                      id="material-select"
                      className={shared.field}
                      value={materialId}
                      onChange={(event) => setMaterialId(event.target.value)}
                      autoFocus
                    >
                      <option value="" disabled>
                        {materialsQuery.isLoading
                          ? "Loading your materials…"
                          : "Choose a material…"}
                      </option>
                      {savedMaterials.map((material) => (
                        <option key={material.id} value={material.id}>
                          {material.title}
                        </option>
                      ))}
                    </select>
                    <p className={shared.fieldDesc}>
                      Nothing is uploaded again.
                    </p>
                  </div>
                ) : null}

                {source === "topic" ? (
                  <div className={shared.inputGroup}>
                    <label htmlFor="material-topic">Topic</label>
                    <input
                      ref={topicRef}
                      id="material-topic"
                      className={shared.field}
                      type="text"
                      value={topic}
                      onChange={(event) => setTopic(event.target.value)}
                      placeholder="e.g. Ionic bonding"
                      autoFocus
                    />
                    <p className={shared.fieldDesc}>
                      Learnora will use general knowledge.
                    </p>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {step === "results" ? (
            <section aria-labelledby="results-step-heading">
              <div className={styles.stageHead}>
                <span className={styles.stepKicker}>Step 2 of 3</span>
                <h3
                  id="results-step-heading"
                  ref={stepHeadingRef}
                  tabIndex={-1}
                >
                  What should Learnora make?
                </h3>
                <p>
                  Select everything you want. You can edit it after it is
                  created.
                </p>
              </div>

              <fieldset className={styles.outputChoices}>
                <legend className={styles.srOnly}>Choose results</legend>
                {isNewMaterial ? (
                  <label
                    className={`${styles.outputCard} ${styles.requiredOutput}`}
                  >
                    <input type="checkbox" checked disabled />
                    <span className={styles.outputIcon} aria-hidden="true">
                      <Icon name="file-text" size={22} />
                    </span>
                    <span className={styles.outputCopy}>
                      <span className={styles.outputTitle}>
                        <strong>Smart notes</strong>
                        <small>Always included</small>
                      </span>
                      <span>
                        A clean, structured document built from your source.
                      </span>
                    </span>
                  </label>
                ) : null}
                <label className={styles.outputCard}>
                  <input
                    ref={flashcardsRef}
                    type="checkbox"
                    checked={wantFlashcards}
                    onChange={(event) => {
                      setWantFlashcards(event.target.checked);
                      setError(null);
                    }}
                  />
                  <span className={styles.outputIcon} aria-hidden="true">
                    <Icon name="layers" size={22} />
                  </span>
                  <span className={styles.outputCopy}>
                    <span className={styles.outputTitle}>
                      <strong>Flashcards</strong>
                      <small>{cardCount} cards</small>
                    </span>
                    <span>A ready-to-review deck for active recall.</span>
                  </span>
                  <span className={styles.checkboxVisual} aria-hidden="true">
                    <Icon name="check" size={14} />
                  </span>
                </label>
                <label className={styles.outputCard}>
                  <input
                    type="checkbox"
                    checked={wantQuiz}
                    onChange={(event) => {
                      setWantQuiz(event.target.checked);
                      setError(null);
                    }}
                  />
                  <span className={styles.outputIcon} aria-hidden="true">
                    <Icon name="help-circle" size={22} />
                  </span>
                  <span className={styles.outputCopy}>
                    <span className={styles.outputTitle}>
                      <strong>Practice quiz</strong>
                      <small>{questionCount} questions</small>
                    </span>
                    <span>
                      Multiple-choice questions with instant feedback.
                    </span>
                  </span>
                  <span className={styles.checkboxVisual} aria-hidden="true">
                    <Icon name="check" size={14} />
                  </span>
                </label>
              </fieldset>
            </section>
          ) : null}

          {step === "details" ? (
            <section aria-labelledby="details-step-heading">
              <div className={styles.stageHead}>
                <span className={styles.stepKicker}>Step 3 of 3</span>
                <h3
                  id="details-step-heading"
                  ref={stepHeadingRef}
                  tabIndex={-1}
                >
                  Put it in the right place
                </h3>
                <p>
                  A clear title and subject make this much easier to find later.
                </p>
              </div>

              <div className={styles.detailFields}>
                {source !== "topic" ? (
                  <div className={shared.inputGroup}>
                    <div className={styles.labelRow}>
                      <label htmlFor="material-folder">Subject</label>
                      <button
                        type="button"
                        onClick={() => void handleNewFolder()}
                      >
                        <Icon name="plus" size={14} /> New subject
                      </button>
                    </div>
                    <select
                      ref={folderSelectRef}
                      id="material-folder"
                      className={shared.field}
                      value={folderId}
                      onChange={(event) => setFolderId(event.target.value)}
                    >
                      <option value="" disabled>
                        {folders.length
                          ? "Choose a subject…"
                          : "No subjects yet"}
                      </option>
                      {folders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.name}
                        </option>
                      ))}
                    </select>
                    {!foldersQuery.isLoading && folders.length === 0 ? (
                      <p className={styles.infoNote}>
                        <Icon name="folder" size={16} />
                        Create a subject first so this resource has a home.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className={shared.inputGroup}>
                  <label htmlFor="material-title">
                    Title <span className={shared.fieldDesc}>(optional)</span>
                  </label>
                  <input
                    id="material-title"
                    className={shared.field}
                    type="text"
                    value={titleOverride}
                    onChange={(event) => setTitleOverride(event.target.value)}
                    placeholder="Learnora will make a title if left blank"
                  />
                </div>

                {wantFlashcards || wantQuiz ? (
                  <details className={styles.advanced}>
                    <summary>
                      <span>
                        <strong>Fine-tune generation</strong>
                        <small>
                          Optional counts, difficulty, and quiz style
                        </small>
                      </span>
                      <Icon name="chevron-down" size={17} />
                    </summary>
                    <div className={styles.advancedBody}>
                      {wantFlashcards ? (
                        <div className={shared.inputGroup}>
                          <label htmlFor="material-card-count">
                            Flashcards: {cardCount}
                          </label>
                          <input
                            id="material-card-count"
                            type="range"
                            min={5}
                            max={30}
                            step={1}
                            value={cardCount}
                            onChange={(event) =>
                              setCardCount(Number(event.target.value))
                            }
                          />
                        </div>
                      ) : null}
                      {wantQuiz ? (
                        <>
                          <div className={shared.inputGroup}>
                            <label htmlFor="material-question-count">
                              Quiz questions: {questionCount}
                            </label>
                            <input
                              id="material-question-count"
                              type="range"
                              min={5}
                              max={20}
                              step={1}
                              value={questionCount}
                              onChange={(event) =>
                                setQuestionCount(Number(event.target.value))
                              }
                            />
                          </div>
                          <div className={shared.inputGroup}>
                            <label id="material-difficulty-label">
                              Quiz difficulty
                            </label>
                            <div
                              className={shared.segmented}
                              role="radiogroup"
                              aria-labelledby="material-difficulty-label"
                            >
                              {(["Easy", "Medium", "Hard"] as const).map(
                                (level) => (
                                  <label
                                    key={level}
                                    className={shared.segmentedOption}
                                  >
                                    <input
                                      type="radio"
                                      name="material-difficulty"
                                      value={level}
                                      checked={difficulty === level}
                                      onChange={() => setDifficulty(level)}
                                    />
                                    <span>{level}</span>
                                  </label>
                                ),
                              )}
                            </div>
                          </div>
                          <div className={shared.inputGroup}>
                            <label htmlFor="material-personality">
                              Quiz host
                            </label>
                            <select
                              id="material-personality"
                              className={shared.field}
                              value={personality}
                              onChange={(event) =>
                                setPersonality(event.target.value)
                              }
                            >
                              {Object.keys(PERSONALITY_DESC).map((host) => (
                                <option key={host} value={host}>
                                  {host}
                                </option>
                              ))}
                            </select>
                            <p className={shared.fieldDesc}>
                              {PERSONALITY_DESC[personality]}
                            </p>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </details>
                ) : null}
              </div>
            </section>
          ) : null}

          {stageFailures.length > 0 ? (
            <div className={styles.failureBreakdown} role="alert">
              <div className={styles.failureHead}>
                <Icon name="alert-circle" size={18} />
                <span>Some stages encountered errors during generation:</span>
              </div>
              <ul className={styles.failureList}>
                {stageFailures.map((failure, idx) => (
                  <li key={idx}>
                    <span className={styles.failureStage}>
                      {failure.stage}:
                    </span>{" "}
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
            <div className={styles.failureBreakdown} role="alert">
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
          {progress ? (
            <div className={styles.progress} role="status" aria-live="polite">
              <span className={styles.spinner} aria-hidden="true" />
              <span>
                <strong>Creating your resources</strong>
                {progress}
              </span>
            </div>
          ) : null}
        </main>

        <aside className={styles.summary} aria-label="Creation summary">
          <span className={styles.summaryEyebrow}>Your study kit</span>
          <div className={styles.summaryItem}>
            <span className={styles.summaryIcon}>
              <Icon name={selectedSource?.icon ?? "file-text"} size={17} />
            </span>
            <span>
              <small>Source</small>
              <strong>{sourceSummary || "Not added yet"}</strong>
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryIcon}>
              <Icon name="sparkles" size={17} />
            </span>
            <span>
              <small>Creating</small>
              <strong>
                {resultSummary.length
                  ? resultSummary.join(", ")
                  : "Choose your results"}
              </strong>
            </span>
          </div>
          {source !== "topic" ? (
            <div className={styles.summaryItem}>
              <span className={styles.summaryIcon}>
                <Icon name="folder" size={17} />
              </span>
              <span>
                <small>Saving to</small>
                <strong>{selectedFolder?.name ?? "Choose a subject"}</strong>
              </span>
            </div>
          ) : null}
          <p>
            <Icon name="sparkles" size={15} /> You can edit everything Learnora
            creates.
          </p>
        </aside>
      </div>

      <div className={styles.actions}>
        <div>
          {activeStepIndex > 0 ? (
            <Button
              type="button"
              onClick={() => moveTo(STEP_ORDER[activeStepIndex - 1])}
              disabled={create.isPending}
            >
              Back
            </Button>
          ) : (
            <Button type="button" onClick={onClose} disabled={create.isPending}>
              Cancel
            </Button>
          )}
        </div>
        <div className={styles.primaryActions}>
          {activeStepIndex > 0 ? (
            <Button
              type="button"
              className={styles.cancelLink}
              onClick={onClose}
              disabled={create.isPending}
            >
              Cancel
            </Button>
          ) : null}
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {create.isPending
              ? "Creating…"
              : step === "source"
                ? "Continue to results"
                : step === "results"
                  ? "Review and create"
                  : createLabel}
            {!create.isPending && step !== "details" ? (
              <span aria-hidden="true">→</span>
            ) : null}
          </Button>
        </div>
      </div>
    </form>
  );
}
