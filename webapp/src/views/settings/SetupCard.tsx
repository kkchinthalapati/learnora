/* Settings ▸ Preferences ▸ "Your setup".
 *
 * The half of the onboarding contract that happens after onboarding: every
 * answer the welcome wizard collected has to be visible and changeable from
 * a normal settings screen, or the wizard becomes a decision you made once,
 * while tired, that you can never revisit.
 *
 * The goal and focus areas live here because nothing else owns them. The AI
 * voice, study rhythm and dashboard sections the wizard also set are already
 * owned by the fields below this card, by My week, and by Dashboard ▸
 * Customize respectively — this card links to those rather than duplicating
 * them.
 */

import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/Icon";
import { useAuth } from "../../context/auth";
import { useToast } from "../../context/toast";
import { useUpdateProfile } from "../../hooks/useAuthActions";
import {
  EMPTY_ANSWERS,
  FOCUS_AREAS,
  ONBOARDING_METADATA_KEY,
  STUDY_GOALS,
  dashboardLayoutFor,
  readOnboarding,
  type FocusAreaId,
  type StudyGoalId,
} from "../../lib/onboarding";
import {
  loadDashboardLayout,
  saveDashboardLayout,
} from "../dashboard/DashboardCustomizeModal";
import styles from "./settings.module.css";

export function SetupCard() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const updateProfile = useUpdateProfile();

  const saved = readOnboarding(user);
  const [goal, setGoal] = useState<StudyGoalId | null>(saved?.goal ?? null);
  const [focusAreas, setFocusAreas] = useState<FocusAreaId[]>(
    saved?.focusAreas ?? [],
  );

  const dirty =
    goal !== (saved?.goal ?? null) ||
    focusAreas.length !== (saved?.focusAreas.length ?? 0) ||
    focusAreas.some((a) => !saved?.focusAreas.includes(a));

  function toggle(id: FocusAreaId) {
    setFocusAreas((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );
  }

  async function handleSave() {
    const next = {
      ...EMPTY_ANSWERS,
      ...saved,
      goal,
      focusAreas,
      /* Editing here counts as having answered, so someone who skipped the
         wizard and filled this in instead is not asked again. */
      completedAt: saved?.completedAt ?? new Date().toISOString(),
      skipped: false,
    };

    /* Applied against the *current* layout, not the defaults: a section the
       student has since hidden or shown by hand in Dashboard ▸ Customize is
       still theirs to decide, except where these picks speak to it. */
    saveDashboardLayout(dashboardLayoutFor(next, loadDashboardLayout()));

    try {
      await updateProfile.mutateAsync({ [ONBOARDING_METADATA_KEY]: next });
      showToast(
        "Setup updated. Your dashboard will reflect it next time you open it.",
      );
    } catch {
      showToast(
        "Saved on this device, but we couldn't sync it to your account.",
      );
    }
  }

  return (
    <Card
      as="section"
      variant="elevated"
      radius="lg"
      padding="lg"
      className={styles.card}
      aria-labelledby="settings-setup-heading"
    >
      <div className={styles.cardHeader}>
        <span className={styles.cardIcon}>
          <Icon name="compass" size={18} />
        </span>
        <div>
          <h3 id="settings-setup-heading">Your Setup</h3>
          <p>
            What you told us when you joined. Change it whenever it changes.
          </p>
        </div>
      </div>

      <div className={`${styles.field} ${styles.fieldStack}`}>
        <div className={styles.fieldLabel}>
          <span className={styles.labelText}>What you're studying for</span>
          <p className={styles.fieldDesc}>
            Sets the tone of the notes, quizzes and explanations Learnora
            writes.
          </p>
        </div>
        <div className={styles.chipRow}>
          {STUDY_GOALS.map((option) => (
            <Chip
              key={option.id}
              tone="accent"
              soft
              pressed={goal === option.id}
              onClick={() => setGoal(goal === option.id ? null : option.id)}
            >
              {option.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className={`${styles.field} ${styles.fieldStack}`}>
        <div className={styles.fieldLabel}>
          <span className={styles.labelText}>What Learnora helps you with</span>
          <p className={styles.fieldDesc}>
            Decides which sections your dashboard shows. Adding one brings its
            section back; you can still override any of it from Dashboard ▸
            Customize.
          </p>
        </div>
        <div className={styles.chipRow}>
          {FOCUS_AREAS.map((area) => (
            <Chip
              key={area.id}
              tone="accent"
              soft
              pressed={focusAreas.includes(area.id)}
              onClick={() => toggle(area.id)}
            >
              {area.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className={styles.field}>
        <div className={styles.fieldLabel}>
          <span className={styles.labelText}>Walkthrough</span>
          <p className={styles.fieldDesc}>
            Run the welcome setup again, starting from your current answers.
          </p>
        </div>
        <div className={styles.fieldAction}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate("/welcome?replay=1")}
          >
            Re-run setup
          </Button>
        </div>
      </div>

      <div className={styles.actionsRight}>
        <Button
          variant="primary"
          size="sm"
          disabled={!dirty || updateProfile.isPending}
          onClick={() => void handleSave()}
        >
          {updateProfile.isPending ? "Saving…" : "Save setup"}
        </Button>
      </div>
    </Card>
  );
}
