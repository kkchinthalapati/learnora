import { useId } from "react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Combobox } from "../../components/Combobox";
import { Icon } from "../../components/Icon";
import { ToggleSwitch } from "../../components/ToggleSwitch";
import { useSettings } from "../../context/settings";
import { useToast } from "../../context/toast";
import { useTranslation } from "../../hooks/useTranslation";
import { profileApi } from "../../api/profile";
import { examsApi } from "../../api/exams";
import { plansApi } from "../../api/plans";
import { generateICS, downloadICS } from "../../lib/ics";
import {
  AI_DEPTH_OPTIONS,
  AI_LANGUAGE_OPTIONS,
  AI_LENGTH_OPTIONS,
  AI_PERSONA_OPTIONS,
  AI_STYLE_OPTIONS,
  UI_LANGUAGE_OPTIONS,
  type AiConciseness,
  type AiPersona,
  type PersonaDepth,
  type StudyStyle,
} from "../../lib/settings";
import type { TranslationKey } from "../../lib/i18n";
import { SetupCard } from "./SetupCard";
import styles from "./settings.module.css";

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
  const aiDepthId = useId();
  const aiStyleId = useId();
  const autoAdaptId = useId();
  const webAccessId = useId();
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
      showToast("Calendar exported.");
    } catch (err) {
      console.error("Failed to export calendar", err);
      showToast("Calendar export failed.");
    }
  };

  return (
    <>
      <SetupCard />
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
            <p>Set the tone and length of AI responses.</p>
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <label htmlFor={personaId}>{t("set_persona")}</label>
            <p className={styles.fieldDesc}>
              Choose the teaching style for AI responses.
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
        aria-labelledby="settings-persona-web-heading"
      >
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon}>
            <Icon name="sparkles" size={18} />
          </span>
          <div>
            <h3 id="settings-persona-web-heading">
              AI Study Persona & Web Access
            </h3>
            <p>
              Customize response depth, pedagogical style, and web intelligence
              defaults.
            </p>
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <label htmlFor={aiDepthId}>Depth Level</label>
            <p className={styles.fieldDesc}>
              Controls cognitive depth of explanations (1: Quick Intuition, 3:
              Standard, 5: Deep Academic)
            </p>
          </div>
          <div className={styles.fieldAction}>
            <select
              id={aiDepthId}
              value={settings.aiDepth}
              onChange={(e) =>
                setSettings({ aiDepth: Number(e.target.value) as PersonaDepth })
              }
            >
              {AI_DEPTH_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <label htmlFor={aiStyleId}>Study Style</label>
            <p className={styles.fieldDesc}>
              Primary pedagogical style for study interactions
            </p>
          </div>
          <div className={styles.fieldAction}>
            <select
              id={aiStyleId}
              value={settings.aiStyle}
              onChange={(e) =>
                setSettings({ aiStyle: e.target.value as StudyStyle })
              }
            >
              {AI_STYLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <span className={styles.labelText} id={autoAdaptId}>
              Auto-Adapt Persona
            </span>
            <p className={styles.fieldDesc}>
              Automatically adjust explanations based on follow-ups and
              confusion patterns
            </p>
          </div>
          <div className={styles.fieldAction}>
            <ToggleSwitch
              labelledBy={autoAdaptId}
              label="Auto-Adapt Persona"
              checked={settings.aiAutoAdapt}
              onChange={(checked) => setSettings({ aiAutoAdapt: checked })}
            />
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <span className={styles.labelText} id={webAccessId}>
              Live Web Intelligence
            </span>
            <p className={styles.fieldDesc}>
              Enable live academic search and paper citations in study sessions
            </p>
          </div>
          <div className={styles.fieldAction}>
            <ToggleSwitch
              labelledBy={webAccessId}
              label="Live Web Intelligence"
              checked={settings.webAccess}
              onChange={(checked) => setSettings({ webAccess: checked })}
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
        aria-labelledby="settings-l10n-heading"
      >
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon}>
            <Icon name="globe" size={18} />
          </span>
          <div>
            <h3 id="settings-l10n-heading">{t("set_localization")}</h3>
            <p>Set interface language, AI language, and timezone.</p>
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
            <Combobox
              options={ALL_TIMEZONES.map((tz) => ({
                value: tz,
                label: tz,
              }))}
              value={settings.timezone}
              onChange={(tz) => setSettings({ timezone: tz })}
              placeholder="Search timezone..."
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
        aria-labelledby="settings-data-heading"
      >
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon}>
            <Icon name="calendar" size={18} />
          </span>
          <div>
            <h3 id="settings-data-heading">Calendar Export</h3>
            <p>Add upcoming exams and study plans to another calendar.</p>
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <span className={styles.labelText}>Calendar File (.ics)</span>
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
              if (!(
                err instanceof Error && err.message === "Not authenticated"
              )) {
                console.error("Failed to sync timezone", err);
              }
            });
            showToast("Preferences saved.");
          }}
        >
          {t("btn_save_config")}
        </Button>
      </div>
    </>
  );
}
