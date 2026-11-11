import { useId } from "react";
import { useSpeechSynthesis } from "../../hooks/useSpeechSynthesis";
import { pickVoice, voiceChoices, voiceLabel } from "../../lib/voicePrefs";
import styles from "./voicePicker.module.css";

/* One voice choice: this device's voices, the student's language first, and
   a button to hear it. Used by the podcast setup, the call screen and
   Settings > Study > Voice and listening, so a voice chosen anywhere is the
   same choice everywhere (lib/voicePrefs.ts). */
export function VoicePicker({
  label,
  value,
  onChange,
  sample,
  pitch,
  rate,
}: {
  label: string;
  value: string | null;
  onChange: (voiceURI: string | null) => void;
  /** What the preview says. */
  sample: string;
  pitch?: number;
  rate?: number;
}) {
  const id = useId();
  const { voices, speak, isSupported } = useSpeechSynthesis();
  const choices = voiceChoices(voices);
  const known = value !== null && choices.some((v) => v.voiceURI === value);

  if (!isSupported) return null;

  return (
    <div className={styles.picker}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.row}>
        <select
          id={id}
          className={styles.select}
          value={known ? (value as string) : ""}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">Best match on this device</option>
          {choices.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {voiceLabel(v)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.preview}
          aria-label={`Hear ${label.toLowerCase()}`}
          onClick={() => speak(sample, { voice: pickVoice(voices, value), pitch, rate })}
        >
          Hear it
        </button>
      </div>
      {value !== null && !known && choices.length > 0 ? (
        <p className={styles.note}>The voice you chose isn&apos;t on this device, so the closest match is used.</p>
      ) : null}
    </div>
  );
}
