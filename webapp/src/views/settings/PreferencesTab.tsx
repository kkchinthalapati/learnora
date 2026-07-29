import { useId } from "react";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { useSettings } from "../../context/settings";
import { useToast } from "../../context/toast";
import {
  AI_LANGUAGE_OPTIONS,
  AI_LENGTH_OPTIONS,
  AI_PERSONA_OPTIONS,
  UI_LANGUAGE_OPTIONS,
  type AiConciseness,
  type AiPersona,
} from "../../lib/settings";
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
 * `[data-i18n]` node in the vanilla document. Nothing in the React app is
 * translated yet — no i18n layer is on the ledger — so the UI-language choice
 * is persisted and honoured by the vanilla app, but does not re-render this
 * app. Noted as a loose end in REACT_MIGRATION.md. */

export function PreferencesTab() {
  const { settings, setSettings, save } = useSettings();
  const { showToast } = useToast();

  const personaId = useId();
  const lengthId = useId();
  const uiLangId = useId();
  const aiLangId = useId();

  return (
    <>
      <section className={styles.card} aria-labelledby="settings-ai-heading">
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon}>
            <Icon name="brain" size={18} />
          </span>
          <div>
            <h3 id="settings-ai-heading">AI Personalization</h3>
            <p>Customize how Learnora AI responds to you</p>
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <label htmlFor={personaId}>AI Persona</label>
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
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <label htmlFor={lengthId}>Response Length</label>
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
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="settings-l10n-heading">
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon}>
            <Icon name="globe" size={18} />
          </span>
          <div>
            <h3 id="settings-l10n-heading">Localization</h3>
            <p>Language and regional preferences</p>
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <label htmlFor={uiLangId}>UI Language</label>
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
            <label htmlFor={aiLangId}>AI Response Language</label>
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
      </section>

      <div className={styles.actionsRight}>
        <Button
          variant="primary"
          onClick={() => {
            save();
            showToast("Your settings have been saved successfully.");
          }}
        >
          Save Preferences
        </Button>
      </div>
    </>
  );
}
