import { useState } from "react";
import { Button } from "../../components/Button";
import { TutorTurn } from "../../components/learning/TutorTurn";
import { FLAG_REASONS, recheckAnswer, type FlagReason } from "../../api/aiSession";
import { useSettings } from "../../context/settings";
import styles from "./session.module.css";
import learning from "../../components/learning/learning.module.css";

/* "Something wrong? Flag this answer." The student says what looks wrong;
   the tutor re-checks against the source and says plainly whether it was.
   Nothing the student answered is marked against them because of it. */
export function FlagAnswer({
  answer,
  objective,
  source,
  onClose,
}: {
  answer: string;
  objective: string;
  source?: string;
  onClose: () => void;
}) {
  const { settings } = useSettings();
  const [state, setState] = useState<
    | { phase: "choose" }
    | { phase: "checking" }
    | { phase: "done"; verdict: string }
    | { phase: "failed" }
  >({ phase: "choose" });

  const flag = (reason: FlagReason) => {
    setState({ phase: "checking" });
    recheckAnswer({ answer, reason, objective, source, settings }).then(
      (verdict) => setState({ phase: "done", verdict }),
      () => setState({ phase: "failed" }),
    );
  };

  return (
    <section className={styles.check} aria-label="Flag this answer">
      {state.phase === "done" ? (
        <TutorTurn meta="Re-checked">
          <p>{state.verdict}</p>
        </TutorTurn>
      ) : (
        <>
          <p className={styles.checkQuestion}>Thanks. What looks wrong?</p>
          <div className={learning.pillRow}>
            {FLAG_REASONS.map((r) => (
              <button
                key={r.id}
                type="button"
                className={learning.pill}
                disabled={state.phase === "checking"}
                onClick={() => flag(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <p className={styles.caption}>
            {state.phase === "failed"
              ? "The re-check didn't go through. Your flag is noted; try again in a moment."
              : `The tutor will re-check this against ${source ?? "your material"} and say whether it was wrong. Nothing you've answered will be marked against you.`}
          </p>
        </>
      )}
      <div className={styles.actions}>
        <Button variant="ghost" size="sm" onClick={onClose}>
          {state.phase === "done" ? "Done" : "Cancel"}
        </Button>
      </div>
    </section>
  );
}
