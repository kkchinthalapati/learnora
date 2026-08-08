import { useCallback, useId, useState } from "react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { ToggleSwitch } from "../../components/ToggleSwitch";
import { useSettings } from "../../context/settings";
import { isPushSupported } from "../../lib/push";
import { usePush } from "../../hooks/usePush";
import styles from "./settings.module.css";
import notif from "./notifications.module.css";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as
  string | undefined;

/* Notifications tab — ports index.html:1596-1641 + js/main.js:1011-1049.
 *
 * Both toggles persist on change rather than on a Save button, matching the
 * vanilla (`$("notif-study-reminders").addEventListener("change", () =>
 * UI.saveSettings())`). */

type PermissionState = NotificationPermission | "unsupported";

function readPermission(): PermissionState {
  return typeof window !== "undefined" && "Notification" in window
    ? Notification.permission
    : "unsupported";
}

const PERMISSION_COPY: Record<PermissionState, string> = {
  unsupported: "Your browser does not support notifications.",
  granted: "✓ Enabled",
  denied: "Denied. Please enable in your browser settings.",
  default: "Not enabled yet.",
};

export function NotificationsTab() {
  const { settings, updateAndSave } = useSettings();
  /* Notification.permission isn't observable, so it's snapshotted on mount
     and re-read after the prompt resolves — the only moment it can change
     from inside this page. */
  const [permission, setPermission] = useState<PermissionState>(readPermission);

  const remindersId = useId();
  const timerId = useId();
  const watchdogId = useId();
  const pushExamsId = useId();
  const pushFlashcardsId = useId();

  const requestPermission = useCallback(() => {
    if (!("Notification" in window)) return;
    void Notification.requestPermission().then(() => {
      setPermission(readPermission());
    });
  }, []);

  const push = usePush();
  const pushConfigured = isPushSupported() && !!VAPID_PUBLIC_KEY;

  return (
    <>
      <Card
        as="section"
        variant="elevated"
        radius="lg"
        padding="lg"
        className={styles.card}
        aria-labelledby="settings-notif-heading"
      >
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon}>
            <Icon name="bell" size={18} />
          </span>
          <div>
            <h3 id="settings-notif-heading">Browser Notifications</h3>
            <p>Control which desktop notifications Learnora can send you</p>
          </div>
        </div>

        <div className={`${styles.field} ${notif.permissionRow}`}>
          <div className={styles.fieldLabel}>
            <span className={styles.labelText}>Browser Permission</span>
            <p
              className={`${styles.fieldDesc} ${notif[permission]}`}
              role="status"
            >
              {PERMISSION_COPY[permission]}
            </p>
          </div>
          {permission === "default" && (
            <div className={styles.fieldAction}>
              <Button variant="primary" size="sm" onClick={requestPermission}>
                Enable Browser Notifications
              </Button>
            </div>
          )}
        </div>

        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <span className={styles.labelText} id={remindersId}>
              Flashcard Due Reminders
            </span>
            <p className={styles.fieldDesc}>
              Get notified once a day when you have flashcards due for review
            </p>
          </div>
          <div className={styles.fieldAction}>
            <ToggleSwitch
              checked={settings.notifyStudyReminders}
              labelledBy={remindersId}
              onChange={(checked) =>
                updateAndSave({ notifyStudyReminders: checked })
              }
            />
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <span className={styles.labelText} id={timerId}>
              Timer Alerts
            </span>
            <p className={styles.fieldDesc}>
              Get notified when a focus session, countdown, or flowtime block
              ends
            </p>
          </div>
          <div className={styles.fieldAction}>
            <ToggleSwitch
              checked={settings.notifyTimerAlerts}
              labelledBy={timerId}
              onChange={(checked) =>
                updateAndSave({ notifyTimerAlerts: checked })
              }
            />
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <span className={styles.labelText} id={watchdogId}>
              Stay-Focused Nudges
            </span>
            <p className={styles.fieldDesc}>
              While a timer is running, get a nudge if you switch tabs for
              15 seconds, and an automatic pause after a full minute away.
              Turn this off if you read reference material in another tab
              while you study — that's not a distraction.
            </p>
          </div>
          <div className={styles.fieldAction}>
            <ToggleSwitch
              checked={settings.timerFocusWatchdog}
              labelledBy={watchdogId}
              onChange={(checked) =>
                updateAndSave({ timerFocusWatchdog: checked })
              }
            />
          </div>
        </div>
      </Card>

      <Card
        as="section"
        variant="elevated"
        radius="lg"
        padding="lg"
        className={styles.card}
        aria-labelledby="settings-push-heading"
      >
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon}>
            <Icon name="bell" size={18} />
          </span>
          <div>
            <h3 id="settings-push-heading">Push Notifications</h3>
            <p>
              Reach you even when Learnora isn't open in a tab — exam countdowns
              and due-flashcard nudges, delivered by your browser like a text
              message.
            </p>
          </div>
        </div>

        <div className={`${styles.field} ${notif.permissionRow}`}>
          <div className={styles.fieldLabel}>
            <span className={styles.labelText}>This Device</span>
            <p className={styles.fieldDesc} role="status">
              {!isPushSupported()
                ? "Your browser does not support push notifications."
                : !VAPID_PUBLIC_KEY
                  ? "Push isn't configured on this deployment yet."
                  : push.status === "checking"
                    ? "Checking…"
                    : push.status === "subscribed"
                      ? "✓ Enabled on this device"
                      : "Not enabled on this device."}
            </p>
            {push.error ? (
              <p className={notif.denied} role="alert">
                {push.error}
              </p>
            ) : null}
          </div>
          {pushConfigured && push.status !== "checking" ? (
            <div className={styles.fieldAction}>
              <Button
                variant={push.status === "subscribed" ? "secondary" : "primary"}
                size="sm"
                disabled={push.pending}
                onClick={() =>
                  push.status === "subscribed"
                    ? push.disable()
                    : push.enable(VAPID_PUBLIC_KEY as string)
                }
              >
                {push.status === "subscribed"
                  ? "Disable on This Device"
                  : "Enable Push Notifications"}
              </Button>
            </div>
          ) : null}
        </div>

        {push.status === "subscribed" && push.row ? (
          <>
            <div className={styles.field}>
              <div className={styles.fieldLabel}>
                <span className={styles.labelText} id={pushExamsId}>
                  Exam Reminders
                </span>
                <p className={styles.fieldDesc}>
                  A push the day before (and the day of) an upcoming exam
                </p>
              </div>
              <div className={styles.fieldAction}>
                <ToggleSwitch
                  checked={push.row.notify_exams}
                  labelledBy={pushExamsId}
                  onChange={(checked) =>
                    push.updatePreferences({ notifyExams: checked })
                  }
                />
              </div>
            </div>

            <div className={styles.field}>
              <div className={styles.fieldLabel}>
                <span className={styles.labelText} id={pushFlashcardsId}>
                  Flashcard Due Push
                </span>
                <p className={styles.fieldDesc}>
                  Once a day, if you have cards due for review
                </p>
              </div>
              <div className={styles.fieldAction}>
                <ToggleSwitch
                  checked={push.row.notify_flashcards}
                  labelledBy={pushFlashcardsId}
                  onChange={(checked) =>
                    push.updatePreferences({ notifyFlashcards: checked })
                  }
                />
              </div>
            </div>
          </>
        ) : null}

        {push.allSubscriptions.length > 0 && (
          <div
            className={styles.field}
            style={{
              borderTop: "1px solid var(--border)",
              paddingTop: "1rem",
              marginTop: "1rem",
              flexDirection: "column",
              alignItems: "stretch",
            }}
          >
            <div
              className={styles.fieldLabel}
              style={{ marginBottom: "0.5rem" }}
            >
              <span className={styles.labelText}>Registered Devices</span>
              <p className={styles.fieldDesc}>
                Manage push notifications across your devices
              </p>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {push.allSubscriptions.map((sub) => {
                const isCurrent = push.row?.id === sub.id;
                return (
                  <li
                    key={sub.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "0.75rem 0",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <span className={styles.fieldDesc}>
                      Device added on{" "}
                      {new Date(sub.created_at).toLocaleDateString()}{" "}
                      {isCurrent && (
                        <strong style={{ color: "var(--text-main)" }}>
                          (This device)
                        </strong>
                      )}
                    </span>
                    {!isCurrent && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => push.removeSubscription(sub.id)}
                      >
                        Revoke
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Card>
    </>
  );
}
