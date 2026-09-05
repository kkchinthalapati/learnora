import { useCallback, useId, useState } from "react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { ToggleSwitch } from "../../components/ToggleSwitch";
import { useSettings } from "../../context/settings";
import { useDialog } from "../../context/dialog";
import { useToast } from "../../context/toast";
import { isPushSupported } from "../../lib/push";
import { usePush } from "../../hooks/usePush";
import {
  useEmailNotificationPrefs,
  useUpdateEmailNotificationPrefs,
} from "../../hooks/useEmailNotifications";
import styles from "./settings.module.css";
import notif from "./notifications.module.css";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as
  string | undefined;

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
  /* Browser permission changes only after the native prompt resolves. */
  const [permission, setPermission] = useState<PermissionState>(readPermission);

  const remindersId = useId();
  const timerId = useId();
  const watchdogId = useId();
  const examGraceId = useId();
  const pushExamsId = useId();
  const pushFlashcardsId = useId();

  const requestPermission = useCallback(() => {
    if (!("Notification" in window)) return;
    void Notification.requestPermission().then(() => {
      setPermission(readPermission());
    });
  }, []);

  const push = usePush();
  const { confirm } = useDialog();
  const { showToast } = useToast();
  const pushConfigured = isPushSupported() && !!VAPID_PUBLIC_KEY;

  const emailPrefs = useEmailNotificationPrefs();
  const updateEmailPrefs = useUpdateEmailNotificationPrefs();
  const emailExamsId = useId();
  const emailFlashcardsId = useId();

  const handleRevokeDevice = async (deviceId: string, isCurrent: boolean) => {
    if (isCurrent) {
      const ok = await confirm(
        "This will disable push notifications on this device. You can re-enable them anytime.",
        {
          title: "Disable push on this device?",
          confirmText: "Disable",
          danger: true,
        },
      );
      if (!ok) return;
    }
    await push.removeSubscription(deviceId);
  };

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
            <p>Choose alerts for this browser.</p>
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
              Send one daily alert when flashcards are due.
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
              Alert when a focus session, countdown, or flowtime block ends.
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
              Nudge after 15 seconds in another tab and pause after one minute.
              Turn this off when reference material lives in another tab.
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

        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <span className={styles.labelText} id={examGraceId}>
              Mock Exam Warning
            </span>
            <p className={styles.fieldDesc}>
              Allow five seconds to return before a mock exam is submitted. When
              off, leaving fullscreen or switching tabs submits at once.
            </p>
          </div>
          <div className={styles.fieldAction}>
            <ToggleSwitch
              checked={settings.examTerminationGrace}
              labelledBy={examGraceId}
              onChange={(checked) =>
                updateAndSave({ examTerminationGrace: checked })
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
            <p>Receive exam and flashcard reminders when Learnora is closed.</p>
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
          <div className={`${styles.field} ${notif.deviceListField}`}>
            <div className={`${styles.fieldLabel} ${notif.deviceListHeader}`}>
              <span className={styles.labelText}>Registered Devices</span>
              <p className={styles.fieldDesc}>
                Manage push notifications across your devices
              </p>
            </div>
            <ul className={notif.deviceList}>
              {push.allSubscriptions.map((sub) => {
                const isCurrent = push.row?.id === sub.id;
                return (
                  <li key={sub.id} className={notif.deviceRow}>
                    <span className={styles.fieldDesc}>
                      Device added on{" "}
                      {new Date(sub.created_at).toLocaleDateString()}{" "}
                      {isCurrent && (
                        <strong className={notif.currentDevice}>
                          (This device)
                        </strong>
                      )}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleRevokeDevice(sub.id, isCurrent)}
                    >
                      {isCurrent ? "Disable on this device" : "Revoke"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Card>

      <Card
        as="section"
        variant="elevated"
        radius="lg"
        padding="lg"
        className={styles.card}
        aria-labelledby="settings-email-notif-heading"
      >
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon}>
            <Icon name="bell" size={18} />
          </span>
          <div>
            <h3 id="settings-email-notif-heading">Email Notifications</h3>
            <p>
              Reach you even on a device that has never had push turned on.
            </p>
          </div>
        </div>

        {emailPrefs.isPending ? (
          <Skeleton label="Loading your email preferences" height={72} />
        ) : emailPrefs.isError ? (
          <p role="alert">
            Could not load your email preferences.{" "}
            {(emailPrefs.error as Error).message}
          </p>
        ) : (
          <>
            <div className={styles.field}>
              <div className={styles.fieldLabel}>
                <span className={styles.labelText} id={emailExamsId}>
                  Exam Reminders
                </span>
                <p className={styles.fieldDesc}>
                  An email the day before (and the day of) an upcoming exam
                </p>
              </div>
              <div className={styles.fieldAction}>
                <ToggleSwitch
                  checked={emailPrefs.data.notifyExams}
                  labelledBy={emailExamsId}
                  disabled={updateEmailPrefs.isPending}
                  onChange={(checked) =>
                    updateEmailPrefs.mutate(
                      { notifyExams: checked },
                      {
                        onError: () =>
                          showToast("Could not save that. Please try again.", {
                            error: true,
                          }),
                      },
                    )
                  }
                />
              </div>
            </div>

            <div className={styles.field}>
              <div className={styles.fieldLabel}>
                <span className={styles.labelText} id={emailFlashcardsId}>
                  Flashcard Due Email
                </span>
                <p className={styles.fieldDesc}>
                  Once a day, if you have cards due for review
                </p>
              </div>
              <div className={styles.fieldAction}>
                <ToggleSwitch
                  checked={emailPrefs.data.notifyFlashcardsDue}
                  labelledBy={emailFlashcardsId}
                  disabled={updateEmailPrefs.isPending}
                  onChange={(checked) =>
                    updateEmailPrefs.mutate(
                      { notifyFlashcardsDue: checked },
                      {
                        onError: () =>
                          showToast("Could not save that. Please try again.", {
                            error: true,
                          }),
                      },
                    )
                  }
                />
              </div>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
