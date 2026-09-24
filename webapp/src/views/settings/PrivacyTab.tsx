import { useId, useState } from "react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { ToggleSwitch } from "../../components/ToggleSwitch";
import { useAuth } from "../../context/auth";
import { useToast } from "../../context/toast";
import {
  usePrivacySettings,
  useSetLeaderboardOptOut,
} from "../../hooks/useFriends";
import { buildDataExport, downloadDataExport } from "../../lib/dataExport";
import { hasAiConsent, setAiConsent } from "../../lib/aiConsent";
import styles from "./settings.module.css";

/* Privacy — what other people can see, and getting your own data out.
 *
 * Consent to be someone's friend and consent to have your study hours ranked
 * against theirs are two different things, and the app only ever asked for
 * the first: accepting a request silently enrolled you on a leaderboard, and
 * the only way off was to remove the friend. */
export function PrivacyTab() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const privacy = usePrivacySettings();
  const setOptOut = useSetLeaderboardOptOut();
  const [exporting, setExporting] = useState(false);
  const [savingConsent, setSavingConsent] = useState(false);

  const boardId = useId();
  const aiId = useId();
  const aiConsent = hasAiConsent(user?.user_metadata);

  /* Withdrawing used to mean emailing support (see the Privacy notice).
     Either direction takes effect on the next AI request: the client asks
     again before sending anything, and the edge function refuses an
     account that has said no. */
  async function onAiConsent(granted: boolean) {
    setSavingConsent(true);
    try {
      await setAiConsent(granted);
      showToast(
        granted
          ? "AI features are on."
          : "AI features are off. Nothing new is sent to our AI providers, and Learnora will ask before any AI feature runs.",
      );
    } catch {
      showToast("Could not save that. Please try again.", { error: true });
    } finally {
      setSavingConsent(false);
    }
  }

  async function onExport() {
    if (!user) return;
    setExporting(true);
    try {
      const data = await buildDataExport(user.id);
      downloadDataExport(data);
      const missing = Object.keys(data.unavailable);
      showToast(
        missing.length === 0
          ? "Your data has been downloaded."
          : `Downloaded, but ${missing.length} ${missing.length === 1 ? "table" : "tables"} could not be read: ${missing.join(", ")}.`,
        { error: missing.length > 0 },
      );
    } catch (err) {
      showToast(
        `Could not export your data. ${(err as Error).message}`,
        { error: true },
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <Card
        as="section"
        variant="panel"
        padding="lg"
        className={styles.card}
        aria-labelledby="settings-ai-consent-heading"
      >
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon}>
            <Icon name="sparkles" size={18} />
          </span>
          <div>
            <h3 id="settings-ai-consent-heading">AI and your study data</h3>
            <p>
              AI features send what you&apos;re working on — your questions,
              notes and answers — to Learnora&apos;s AI providers, Anthropic
              (Claude) and Google (Gemini). The timer, tasks, exams and
              flashcard reviews work without it.
            </p>
          </div>
        </div>
        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <span className={styles.labelText} id={aiId}>
              Let AI features use my study data
            </span>
            <p className={styles.fieldDesc}>
              {aiConsent
                ? "On. Turn it off and Learnora will ask before any AI feature runs."
                : "Off. Learnora will ask the next time you use an AI feature."}
            </p>
          </div>
          <div className={styles.fieldAction}>
            <ToggleSwitch
              checked={aiConsent}
              labelledBy={aiId}
              disabled={savingConsent || !user}
              onChange={(checked) => void onAiConsent(checked)}
            />
          </div>
        </div>
      </Card>

      <Card
        as="section"
        variant="panel"
        padding="lg"
        className={styles.card}
        aria-labelledby="settings-privacy-heading"
      >
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon}>
            <Icon name="shield" size={18} />
          </span>
          <div>
            <h3 id="settings-privacy-heading">What others can see</h3>
            <p>
              Only people whose friend request you accepted can see anything at
              all. This controls what they see once they can.
            </p>
          </div>
        </div>

        {privacy.isPending ? (
          <Skeleton label="Loading your privacy settings" height={72} />
        ) : privacy.isError ? (
          <p role="alert">
            Could not load your privacy settings.{" "}
            {(privacy.error as Error).message}
          </p>
        ) : (
          <div className={styles.field}>
            <div className={styles.fieldLabel}>
              <span className={styles.labelText} id={boardId}>
                Appear on friends&apos; leaderboards
              </span>
              <p className={styles.fieldDesc}>
                Off means your focus time and streak are hidden from other
                people&apos;s boards. You still see your own, and your
                friendships are untouched.
              </p>
            </div>
            <div className={styles.fieldAction}>
              <ToggleSwitch
                checked={!privacy.data.leaderboardOptOut}
                labelledBy={boardId}
                disabled={setOptOut.isPending}
                onChange={(checked) =>
                  setOptOut.mutate(!checked, {
                    onError: () =>
                      showToast("Could not save that. Please try again.", {
                        error: true,
                      }),
                  })
                }
              />
            </div>
          </div>
        )}

        {/* Stated rather than offered as a toggle: study rooms have no
            discovery mechanism at all — a room is reachable only by its
            invite link — so a "discoverable / invite-only" control would be a
            switch with nothing on the other side of it. */}
        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <span className={styles.labelText}>Study rooms</span>
            <p className={styles.fieldDesc}>
              Always invite-only. Rooms are not listed or searchable anywhere;
              the only way into yours is a link you send.
            </p>
          </div>
        </div>
      </Card>

      <Card
        as="section"
        variant="panel"
        padding="lg"
        className={styles.card}
        aria-labelledby="settings-export-heading"
      >
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon}>
            <Icon name="download" size={18} />
          </span>
          <div>
            <h3 id="settings-export-heading">Your data</h3>
            <p>Everything Learnora stores about you, as a file you keep.</p>
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <span className={styles.labelText}>Download my data</span>
            <p className={styles.fieldDesc}>
              A JSON file with your profile, folders, materials, notes,
              flashcards, quizzes and attempts, study sessions, tasks, exams,
              plans and notebooks. Uploaded files themselves are not included —
              you already have those.
            </p>
          </div>
          <div className={styles.fieldAction}>
            <Button onClick={() => void onExport()} disabled={exporting || !user}>
              {exporting ? "Preparing…" : "Download"}
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}
