import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { HowYouLearn } from "../../components/learning/HowYouLearn";
import { StyleSuggestion } from "../../components/learning/Adapt";
import { useLearnerProfile } from "../../hooks/useLearnerStyle";
import { useLearnerSignals } from "../../hooks/useLearnerSignals";
import type { LearnerProfile } from "../../lib/learnerProfile";
import styles from "./settings.module.css";

/* Settings > Study > How you learn: the same answers as the onboarding step,
   to change at any time. Choices save at once; typing saves when the field
   is left, or after a pause. Lessons link here ("Change in Settings"). */
export function HowYouLearnCard() {
  const { profile, isPending, save } = useLearnerProfile();
  const signals = useLearnerSignals(profile);
  const [draft, setDraft] = useState<LearnerProfile | null>(null);
  const [status, setStatus] = useState<"" | "saving" | "saved" | "failed">("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { hash } = useLocation();

  useEffect(() => {
    if (hash === "#how-you-learn" && !isPending) document.getElementById("how-you-learn")?.scrollIntoView?.({ block: "start" });
  }, [hash, isPending]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const value = draft ?? profile;

  const persist = async (next: LearnerProfile) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setStatus("saving");
    try {
      /* The editor keeps showing what was typed (the saved copy is trimmed,
         which mid-sentence would eat a space). */
      await save(next);
      setStatus("saved");
    } catch {
      setStatus("failed");
    }
  };

  const change = (next: LearnerProfile) => {
    setDraft(next);
    const textChanged = next.notes !== value.notes || next.interests !== value.interests;
    if (!textChanged) {
      void persist(next);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(next), 1200);
  };

  return (
    <Card
      as="section"
      variant="elevated"
      radius="lg"
      padding="lg"
      className={`${styles.card} ${styles.howYouLearnCard}`}
      aria-labelledby="settings-how-you-learn-heading"
      id="how-you-learn"
    >
      <div className={styles.cardHeader}>
        <span className={styles.cardIcon}>
          <Icon name="graduation-cap" size={18} />
        </span>
        <div>
          <h3 id="settings-how-you-learn-heading">How you learn</h3>
          <p>Lessons, notes, podcasts and explanations are all shaped around this. Change it whenever it stops fitting.</p>
        </div>
      </div>
      <StyleSuggestion
        suggestion={signals.suggestion}
        onAccept={(style) => change({ ...value, style })}
      />
      <HowYouLearn
        where="settings"
        value={value}
        disabled={isPending}
        onChange={change}
        onTextBlur={() => {
          if (draft && timer.current) void persist(draft);
        }}
      />
      <p className={styles.saveStatus} role="status" aria-live="polite">
        {status === "saving" ? "Saving…" : status === "saved" ? "Saved. The next lesson will use it." : status === "failed" ? "Couldn't save just now. Try again." : ""}
      </p>
    </Card>
  );
}
