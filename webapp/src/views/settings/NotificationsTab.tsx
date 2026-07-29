import { useCallback, useId, useState } from "react";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { ToggleSwitch } from "../../components/ToggleSwitch";
import { useSettings } from "../../context/settings";
import styles from "./settings.module.css";
import notif from "./notifications.module.css";

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

  const requestPermission = useCallback(() => {
    if (!("Notification" in window)) return;
    void Notification.requestPermission().then(() => {
      setPermission(readPermission());
    });
  }, []);

  return (
    <section className={styles.card} aria-labelledby="settings-notif-heading">
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
            Get notified when a focus session, countdown, or flowtime block ends
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
    </section>
  );
}
