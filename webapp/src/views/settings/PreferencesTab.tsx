import { useId } from "react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { useSettings } from "../../context/settings";
import { useToast } from "../../context/toast";
import { useTranslation } from "../../hooks/useTranslation";
import { profileApi } from "../../api/profile";
import { examsApi } from "../../api/exams";
import { plansApi } from "../../api/plans";
import { generateICS, downloadICS } from "../../lib/ics";
import {
  AI_LANGUAGE_OPTIONS,
  AI_LENGTH_OPTIONS,
  AI_PERSONA_OPTIONS,
  UI_LANGUAGE_OPTIONS,
  type AiConciseness,
  type AiPersona,
} from "../../lib/settings";
import type { TranslationKey } from "../../lib/i18n";
import styles from "./settings.module.css";

/* Preferences tab — ports index.html:1510-1595 + js/ui.js's saveSettings
 * (:1078-1090).
 *
 * The vanilla read the four <select> values straight out of the DOM on save;
 * here they're controlled inputs over the shared settings context, so the
 * Notifications tab's immediate writes and this tab's explicit save can't
 * clobber each other (see SettingsProvider).
 *
 * `saveSettings()` also called `applyTranslations()`, which walks every
 * `[data-i18n]` node in the vanilla document — now ported via `useTranslation()`
 * (Step 23). Only the headings/labels/option text the vanilla actually marks
 * `data-i18n` translate here: the `<option>` *language names* themselves
 * (English/Español/…) don't, in either app, and neither do this tab's plain
 * descriptive `<p>` copy or the Data & Privacy tab, none of which carry
 * `data-i18n` in index.html either. */

const PERSONA_KEYS: Record<AiPersona, TranslationKey> = {
  tutor: "opt_tutor",
  coach: "opt_coach",
  buddy: "opt_buddy",
  professor: "opt_professor",
};

const LENGTH_KEYS: Record<AiConciseness, TranslationKey> = {
  short: "opt_short",
  medium: "opt_med",
  detailed: "opt_long",
};

const ALL_TIMEZONES =
  typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : [Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"];

export function PreferencesTab() {
  const { settings, setSettings, save } = useSettings();
  const { showToast } = useToast();
  const t = useTranslation();

  const personaId = useId();
  const lengthId = useId();
  const uiLangId = useId();
  const aiLangId = useId();
  const tzId = useId();

  const handleExportICS = async () => {
    try {
      const [exams, plans] = await Promise.all([
        examsApi.fetch(),
        plansApi.fetchAll(),
      ]);
      const ics = generateICS(exams, plans);
      downloadICS(ics);
      showToast("Calendar exported successfully!");
    } catch (err) {
      console.error("Failed to export calendar", err);
      showToast("Failed to export calendar.");
    }
  };

  return (
    <>
      <Card
        as="section"
        variant="elevated"
        radius="lg"
        padding="lg"
        className={styles.card}
        aria-labelledby="settings-ai-heading"
      >
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon}>
            <Icon name="brain" size={18} />
          </span>
          <div>
            <h3 id="settings-ai-heading">{t("set_ai_brain")}</h3>
            <p>Customize how Learnora AI responds to you</p>
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <label htmlFor={personaId}>{t("set_persona")}</label>
            <p className={styles.fieldDesc}>
              Choose the teaching style that works best for you
            </p>
          </div>
          <div className={styles.fieldAction}>
            <select
              id={personaId}
              value={settings.aiPersona}
              onChange={(e) =>
                setSettings({ aiPersona: e.target.value as AiPersona })
              }
            >
              {AI_PERSONA_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(PERSONA_KEYS[o.value])}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <label htmlFor={lengthId}>{t("set_length")}</label>
            <p className={styles.fieldDesc}>
              How detailed AI responses should be
            </p>
          </div>
          <div className={styles.fieldAction}>
            <select
              id={lengthId}
              value={settings.aiConciseness}
              onChange={(e) =>
                setSettings({ aiConciseness: e.target.value as AiConciseness })
              }
            >
              {AI_LENGTH_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(LENGTH_KEYS[o.value])}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      <Card
        as="section"
        variant="elevated"
        radius="lg"
        padding="lg"
        className={styles.card}
        aria-labelledby="settings-l10n-heading"
      >
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon}>
            <Icon name="globe" size={18} />
          </span>
          <div>
            <h3 id="settings-l10n-heading">{t("set_localization")}</h3>
            <p>Language and regional preferences</p>
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <label htmlFor={uiLangId}>{t("set_ui_lang")}</label>
            <p className={styles.fieldDesc}>Language used for the interface</p>
          </div>
          <div className={styles.fieldAction}>
            <select
              id={uiLangId}
              value={settings.uiLanguage}
              onChange={(e) => setSettings({ uiLanguage: e.target.value })}
            >
              {UI_LANGUAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <label htmlFor={aiLangId}>{t("set_ai_lang")}</label>
            <p className={styles.fieldDesc}>
              Language for AI-generated content
            </p>
          </div>
          <div className={styles.fieldAction}>
            <select
              id={aiLangId}
              value={settings.aiLanguage}
              onChange={(e) => setSettings({ aiLanguage: e.target.value })}
            >
              {AI_LANGUAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <label htmlFor={tzId}>Timezone</label>
            <p className={styles.fieldDesc}>
              Used for daily reminders and leaderboard deadlines
            </p>
          </div>
          <div className={styles.fieldAction}>
            <select
              id={tzId}
              value={settings.timezone}
              onChange={(e) => setSettings({ timezone: e.target.value })}
            >
              {ALL_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      <Card
        as="section"
        variant="elevated"
        radius="lg"
        padding="lg"
        className={styles.card}
        aria-labelledby="settings-data-heading"
      >
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon}>
            <Icon name="calendar" size={18} />
          </span>
          <div>
            <h3 id="settings-data-heading">Data Management</h3>
            <p>Export your exams and study plan to other calendar apps</p>
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <span className={styles.labelText}>Calendar Export (.ics)</span>
            <p className={styles.fieldDesc}>
              Download a calendar file of all upcoming exams and study plans
            </p>
          </div>
          <div className={styles.fieldAction}>
            <Button variant="secondary" size="sm" onClick={handleExportICS}>
              Export to Calendar
            </Button>
          </div>
        </div>
      </Card>

      <div className={styles.actionsRight}>
        <Button
          variant="primary"
          onClick={() => {
            save();
            profileApi.updateTimezone(settings.timezone).catch((err) => {
              console.error("Failed to sync timezone", err);
            });
            showToast("Your settings have been saved successfully.");
          }}
        >
          {t("btn_save_config")}
        </Button>
      </div>
    </>
  );
}
