import { useId } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { ToggleSwitch } from "../../components/ToggleSwitch";
import { useSettings } from "../../context/settings";
import { useToast } from "../../context/toast";
import { tutorMemoryApi, tutorMemoryKey } from "../../api/tutorMemory";
import { memoryWhen } from "../../lib/tutorMemory";
import styles from "./settings.module.css";

/* What your tutor remembers (lib/tutorMemory.ts).
 *
 * The whole of it is on this card: the lessons the student has asked the
 * tutor about, and when. They can remove any one, remove all, or switch
 * remembering off, in which case nothing is read or written. There is no
 * hidden profile behind it; what they got wrong is the mistakes list on
 * Progress, which is theirs to see too. */
export function TutorMemoryCard() {
  const { settings, setSettings } = useSettings();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const toggleId = useId();
  const memory = useQuery({ queryKey: tutorMemoryKey, queryFn: () => tutorMemoryApi.list() });
  const refresh = () => qc.invalidateQueries({ queryKey: tutorMemoryKey });
  const failed = () => showToast("Could not remove that. Please try again.", { error: true });
  const forget = useMutation({
    mutationFn: (materialId: string) => tutorMemoryApi.forget(materialId),
    onSuccess: refresh,
    onError: failed,
  });
  const forgetAll = useMutation({
    mutationFn: () => tutorMemoryApi.forgetAll(),
    onSuccess: () => {
      void refresh();
      showToast("Your tutor has forgotten those lessons.");
    },
    onError: failed,
  });
  const entries = memory.data ?? [];

  return (
    <Card as="section" variant="panel" padding="lg" className={styles.card} aria-labelledby="settings-tutor-memory-heading">
      <div className={styles.cardHeader}>
        <span className={styles.cardIcon}>
          <Icon name="book-open" size={18} />
        </span>
        <div>
          <h3 id="settings-tutor-memory-heading">What your tutor remembers</h3>
          <p>
            Only which lessons you&apos;ve asked the tutor about, and when, so it can connect a new question to one
            you&apos;ve worked on. It does not keep what you typed or what it replied.
          </p>
        </div>
      </div>

      <div className={styles.field}>
        <div className={styles.fieldLabel}>
          <span className={styles.labelText} id={toggleId}>
            Let the tutor remember lessons we&apos;ve worked on
          </span>
          <p className={styles.fieldDesc}>
            {settings.tutorMemory
              ? "On. Turn it off and nothing more is remembered or used."
              : "Off. The tutor starts fresh each time. What is listed below stays until you remove it."}
          </p>
        </div>
        <div className={styles.fieldAction}>
          <ToggleSwitch
            checked={settings.tutorMemory}
            labelledBy={toggleId}
            onChange={(checked) => setSettings({ tutorMemory: checked })}
          />
        </div>
      </div>

      {memory.isPending ? (
        <Skeleton label="Loading what your tutor remembers" height={56} />
      ) : entries.length === 0 ? (
        <p className={styles.fieldDesc}>Nothing is remembered yet.</p>
      ) : (
        <>
          <ul className={styles.memoryList} aria-label="Lessons your tutor remembers">
            {entries.map((e) => (
              <li key={e.materialId} className={styles.memoryRow}>
                <span className={styles.memoryText}>
                  <span className={styles.labelText}>{e.lessonTitle}</span>
                  <span className={styles.fieldDesc}>
                    {[e.subject, `last on ${memoryWhen(e)}`, e.times > 1 ? `${e.times} conversations` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={forget.isPending || forgetAll.isPending}
                  aria-label={`Remove ${e.lessonTitle}`}
                  onClick={() => forget.mutate(e.materialId)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          <div>
            <Button variant="secondary" busy={forgetAll.isPending} onClick={() => forgetAll.mutate()}>
              Forget all of it
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
