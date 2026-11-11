import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router";
import {
  studySetLanding,
  summarizeStudyPackage,
  type StudyPackageResult,
} from "../api/studyPackage";
import { loadLearnerStyle } from "../api/learnerStyle";
import {
  useCreateStudyPackage,
  type StudyPackageInput,
} from "../hooks/useStudyPackage";
import type { LearnerStyle } from "../lib/learnerStyle";
import { GenerationScreen } from "../components/generation/GenerationScreen";
import { useToast } from "./toast";
import {
  GenerationContext,
  stageForMessage,
  type GenerationApi,
  type GenerationJob,
} from "./generation";

/* Owns every "make me a study set" run started from the capture box or the
   Create panel. See context/generation.ts for why it lives above the routes. */

function stepsFor(input: StudyPackageInput): GenerationJob["steps"] {
  const outputs = input.outputs ?? {};
  const isTopic = input.source.kind === "topic";
  const steps: GenerationJob["steps"] = [];
  if (!isTopic) steps.push("read");
  if (
    isTopic
      ? outputs.notes === true
      : outputs.notes !== false || input.source.kind !== "material"
  ) {
    steps.push("notes");
  }
  if (outputs.flashcards) steps.push("cards");
  if (outputs.quiz) steps.push("quiz");
  return steps.length ? steps : ["notes"];
}

const RUNNING = new Set<GenerationJob["stage"]>([
  "read",
  "notes",
  "cards",
  "quiz",
]);

interface Pending {
  input: StudyPackageInput;
  label: string;
  resolve: (result: StudyPackageResult | null) => void;
}

export function GenerationProvider({ children }: { children: ReactNode }) {
  const create = useCreateStudyPackage();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [style, setStyle] = useState<LearnerStyle | null>(null);
  const jobRef = useRef(job);
  jobRef.current = job;
  const pendingRef = useRef<Pending | null>(null);

  const execute = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending) return;
    const { input, label, resolve } = pending;
    const steps = stepsFor(input);
    setJob((j) => ({
      label,
      steps,
      stage: steps[0],
      message: "Getting started…",
      startedAt: Date.now(),
      minimized: j?.minimized ?? false,
    }));
    try {
      const result = await create.mutateAsync({
        ...input,
        onProgress: (message) => {
          setJob((j) =>
            j
              ? { ...j, message, stage: stageForMessage(message) ?? j.stage }
              : j,
          );
          input.onProgress?.(message);
        },
      });
      const summary = summarizeStudyPackage(result);
      if (!summary) {
        setJob(
          (j) =>
            j && {
              ...j,
              stage: "failed",
              minimized: false,
              error:
                result.failures[0]?.message ??
                "Nothing could be made this time. Please try again in a moment.",
            },
        );
        resolve(result);
        return;
      }
      const refusal = result.failures.find((f) => f.refused);
      if (refusal) showToast(refusal.message, { error: true });
      /* Straight into the lesson, where Learn starts (DESIGN.md rule 0.1). */
      const destination = studySetLanding(result);
      if (jobRef.current?.minimized) {
        /* They chose to keep working: don't pull them away mid-task. */
        setJob((j) => j && { ...j, stage: "done", destination });
        showToast(`${summary} "${label}" is ready.`, {
          actionLabel: destination ? "Open" : undefined,
          onAction: destination
            ? () => {
                setJob(null);
                void navigate(destination);
              }
            : undefined,
          duration: 12000,
        });
      } else {
        setJob(null);
        showToast(summary);
        if (destination) void navigate(destination);
      }
      resolve(result);
    } catch (caught) {
      setJob(
        (j) =>
          j && {
            ...j,
            stage: "failed",
            minimized: false,
            error:
              caught instanceof Error && caught.message
                ? caught.message
                : "Something went wrong. Please try again.",
          },
      );
      resolve(null);
    }
  }, [create, navigate, showToast]);

  const start = useCallback<GenerationApi["start"]>(
    async (input, { label }) => {
      const current = jobRef.current;
      if (current && RUNNING.has(current.stage))
        return null;
      return new Promise<StudyPackageResult | null>((resolve) => {
        pendingRef.current = { input, label, resolve };
        void (async () => {
          /* Shown while it runs ("shaped for…"). How they learn is asked in
             onboarding and changed in Settings, never here. */
          setStyle(await loadLearnerStyle().catch(() => null));
          void execute();
        })();
      });
    },
    [execute],
  );

  /* Leaving the page abandons the run, so say so before it happens. */
  const running = job ? RUNNING.has(job.stage) : false;
  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  const value = useMemo<GenerationApi>(() => ({ job, start }), [job, start]);

  return (
    <GenerationContext.Provider value={value}>
      {children}
      {job ? (
        <GenerationScreen
          job={job}
          style={style}
          onMinimize={() => setJob((j) => j && { ...j, minimized: true })}
          onRestore={() => setJob((j) => j && { ...j, minimized: false })}
          onRetry={() => {
            if (!pendingRef.current) return;
            /* The original caller already heard "nothing made"; a retry's
               result only needs to reach the screen. */
            pendingRef.current = { ...pendingRef.current, resolve: () => {} };
            void execute();
          }}
          onClose={() => {
            setJob(null);
          }}
          onOpen={() => {
            const to = job.destination;
            setJob(null);
            if (to) void navigate(to);
          }}
        />
      ) : null}
    </GenerationContext.Provider>
  );
}
