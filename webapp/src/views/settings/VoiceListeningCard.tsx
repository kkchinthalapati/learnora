import { useId, useState } from "react";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { VoicePicker } from "../../components/learning/VoicePicker";
import {
  callModeOptions,
  callPersonaOptions,
  callVoice,
  loadCallStyle,
  saveCallStyle,
  type CallStyle,
} from "../../lib/callStyle";
import {
  FORMATS,
  LENGTHS,
  PODCAST_FORMATS,
  PODCAST_LENGTHS,
  loadPodcastStyle,
  savePodcastStyle,
  type PodcastStyle,
} from "../../lib/podcastStyle";
import { SPEEDS, saveVoicePrefs, useVoicePrefs } from "../../lib/voicePrefs";
import styles from "./settings.module.css";

/* Settings > Study > Voice and listening: every choice about how Learnora
 * sounds, in one place. The same choices appear where they are used (the
 * call screen, the podcast setup) and change together, because they are the
 * same stores (lib/voicePrefs.ts, lib/callStyle.ts, lib/podcastStyle.ts).
 * All of it is kept on this device, like the voices themselves. */
export function VoiceListeningCard() {
  const prefs = useVoicePrefs();
  const [call, setCall] = useState<CallStyle>(loadCallStyle);
  const [podcast, setPodcast] = useState<PodcastStyle>(loadPodcastStyle);
  const ids = { persona: useId(), mode: useId(), speed: useId(), format: useId(), length: useId(), listen: useId() };

  const updateCall = (patch: Partial<CallStyle>) => {
    const next = { ...call, ...patch };
    setCall(next);
    saveCallStyle(next);
  };
  const updatePodcast = (patch: Partial<PodcastStyle>) => {
    const next = { ...podcast, ...patch };
    setPodcast(next);
    savePodcastStyle(next);
  };

  return (
    <Card as="section" variant="panel" padding="lg" className={styles.card} aria-labelledby="settings-voice-heading">
      <div className={styles.cardHeader}>
        <span className={styles.cardIcon}>
          <Icon name="headphones" size={18} />
        </span>
        <div>
          <h3 id="settings-voice-heading">Voice and listening</h3>
          <p>
            How your tutor sounds on a call and when it reads replies aloud, and how lesson podcasts are made. Voices
            are your device&apos;s own, so these are kept on this device.
          </p>
        </div>
      </div>

      <div className={styles.voiceGroup}>
        <h4 className={styles.voiceGroupTitle}>Your tutor</h4>
        <VoicePicker
          label="Tutor voice"
          value={prefs.tutorVoice}
          onChange={(v) => saveVoicePrefs({ tutorVoice: v })}
          sample="Hi! I'm your tutor. Ask me anything about your lesson."
          pitch={callVoice(call.persona).pitch}
          rate={callVoice(call.persona).rate * prefs.tutorRate}
        />
        <div className={styles.voiceSelects}>
          <SelectField
            id={ids.speed}
            label="Speaking speed"
            value={String(prefs.tutorRate)}
            options={SPEEDS.map((s) => ({ value: String(s), label: `${s}×` }))}
            onChange={(v) => saveVoicePrefs({ tutorRate: Number(v) })}
          />
          <SelectField
            id={ids.persona}
            label="Personality on a call"
            value={call.persona}
            options={callPersonaOptions.map((o) => ({ value: o.id, label: `${o.label}: ${o.hint}` }))}
            onChange={(v) => updateCall({ persona: v as CallStyle["persona"] })}
          />
          <SelectField
            id={ids.mode}
            label="Kind of call"
            value={call.mode}
            options={callModeOptions.map((o) => ({ value: o.id, label: `${o.label}: ${o.hint}` }))}
            onChange={(v) => updateCall({ mode: v as CallStyle["mode"] })}
          />
        </div>
      </div>

      <div className={styles.voiceGroup}>
        <h4 className={styles.voiceGroupTitle}>Lesson podcasts</h4>
        <div className={styles.voiceSelects}>
          <SelectField
            id={ids.format}
            label="Format"
            value={podcast.format}
            options={PODCAST_FORMATS.map((f) => ({ value: f, label: `${FORMATS[f].label}: ${FORMATS[f].hint}` }))}
            onChange={(v) => updatePodcast({ format: v as PodcastStyle["format"] })}
          />
          <SelectField
            id={ids.length}
            label="Length"
            value={podcast.length}
            options={PODCAST_LENGTHS.map((l) => ({ value: l, label: `${LENGTHS[l].label}, ${LENGTHS[l].minutes}` }))}
            onChange={(v) => updatePodcast({ length: v as PodcastStyle["length"] })}
          />
          <SelectField
            id={ids.listen}
            label="Playback speed"
            value={String(prefs.listenRate)}
            options={SPEEDS.map((s) => ({ value: String(s), label: `${s}×` }))}
            onChange={(v) => saveVoicePrefs({ listenRate: Number(v) })}
          />
        </div>
        <label className={styles.voiceCheck}>
          <input
            type="checkbox"
            checked={podcast.recallBreaks}
            onChange={(e) => updatePodcast({ recallBreaks: e.target.checked })}
          />
          Recall breaks: pause to ask me a question before giving the answer
        </label>
        <VoicePicker
          label="First voice (teacher, host)"
          value={prefs.hostVoice}
          onChange={(v) => saveVoicePrefs({ hostVoice: v })}
          sample="Welcome back. Let's get into today's lesson."
        />
        <VoicePicker
          label="Second voice (student, challenger)"
          value={prefs.guestVoice}
          onChange={(v) => saveVoicePrefs({ guestVoice: v })}
          sample="Wait, can you go over that bit again?"
        />
      </div>
    </Card>
  );
}

function SelectField({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles.voiceSelect}>
      <label htmlFor={id} className={styles.labelText}>
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
