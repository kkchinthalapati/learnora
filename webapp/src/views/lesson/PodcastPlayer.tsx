import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { ToggleSwitch } from "../../components/ToggleSwitch";
import { VoicePicker } from "../../components/learning/VoicePicker";
import { writePodcastScript, type PodcastLine, type PodcastScript } from "../../api/podcast";
import { useSpeechSynthesis } from "../../hooks/useSpeechSynthesis";
import {
  FOCUS_LABELS,
  FORMATS,
  LENGTHS,
  MAX_INSTRUCTIONS,
  PODCAST_FOCUSES,
  PODCAST_FORMATS,
  PODCAST_LENGTHS,
  loadPodcastStyle,
  podcastStyleKey,
  savePodcastStyle,
  type PodcastStyle,
} from "../../lib/podcastStyle";
import { SPEEDS, pickVoice, saveVoicePrefs, useVoicePrefs } from "../../lib/voicePrefs";
import styles from "./podcast.module.css";

/* Listen: the lesson as an episode the student shapes (lib/podcastStyle.ts):
 * a conversation, a solo lesson or a debate over the idea people get wrong;
 * quick, standard or a deep dive; the whole lesson, only the parts they
 * missed in Learn, or something they ask for; with or without recall breaks.
 * The voices are theirs too (lib/voicePrefs.ts), the same ones the tutor
 * uses on a call.
 *
 * The script is written once per version of the notes and per set of
 * choices, and kept on this device. The voices are the browser's own speech
 * synthesis, so nothing is recorded or stored as audio. Nothing is written
 * until the student asks: a script costs part of the lesson's allowance. */

/** Seconds to think before a recall break's answer. */
export const RECALL_SECONDS = 6;

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const cacheKey = (materialId: string) => `learnora:podcast:v2:${materialId}`;

function readCached(materialId: string, key: string): PodcastScript | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(materialId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { key?: string; script?: PodcastScript };
    return parsed.key === key && parsed.script?.lines?.length ? parsed.script : null;
  } catch {
    return null;
  }
}

function writeCached(materialId: string, key: string, script: PodcastScript) {
  try {
    window.localStorage.setItem(cacheKey(materialId), JSON.stringify({ key, script }));
  } catch {
    /* Full or private storage: it's written again next time. */
  }
}

export function PodcastPlayer({
  materialId,
  lesson,
  notes,
  subject = null,
  missed = [],
}: {
  materialId: string;
  lesson: string;
  notes: string;
  subject?: string | null;
  /** Titles of the parts the student got wrong in Learn, for "only the
   *  parts I missed". */
  missed?: readonly string[];
}) {
  const [style, setStyleState] = useState<PodcastStyle>(() => {
    const saved = loadPodcastStyle();
    /* "Only what I missed" with nothing missed would be the whole lesson. */
    return saved.focus === "missed" && missed.length === 0 ? { ...saved, focus: "whole" } : saved;
  });
  const key = `${hash(notes)}:${podcastStyleKey(style, missed)}`;
  const [script, setScript] = useState<PodcastScript | null>(() => readCached(materialId, key));
  const [setupOpen, setSetupOpen] = useState(() => script === null);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  /* A recall break waiting for the listener: seconds left, or null. */
  const [thinking, setThinking] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set());
  const prefs = useVoicePrefs();
  const { speak, cancel, isSupported, setAudioRate, voices } = useSpeechSynthesis();

  /* Each play bumps the run, so a line ending after a pause, a skip or an
     unmount never advances anything. */
  const runRef = useRef(0);
  const scriptRef = useRef(script);
  scriptRef.current = script;
  const timerRef = useRef<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  /* Skips a recall break's wait ("Show it now"). */
  const revealRef = useRef<() => void>(() => {});

  const setStyle = (patch: Partial<PodcastStyle>) => {
    const next = { ...style, ...patch };
    setStyleState(next);
    savePodcastStyle(next);
  };

  const stopTimer = () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const write = useCallback(async () => {
    setWriting(true);
    setError(null);
    try {
      const next = await writePodcastScript({ materialId, lesson, notes, subject, style, missed });
      writeCached(materialId, key, next);
      setScript(next);
      setIndex(0);
      setRevealed(new Set());
      setSetupOpen(false);
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "The podcast couldn't be written.");
    } finally {
      setWriting(false);
    }
  }, [materialId, lesson, notes, subject, style, missed, key]);

  const voiceFor = useCallback(
    (line: PodcastLine) =>
      line.speaker === "student"
        ? { persona: "jordan" as const, voice: pickVoice(voices, prefs.guestVoice) }
        : { persona: "alex" as const, voice: pickVoice(voices, prefs.hostVoice) },
    [voices, prefs.hostVoice, prefs.guestVoice],
  );

  const playFrom = useCallback(
    (at: number) => {
      stopTimer();
      setThinking(null);
      const current = scriptRef.current;
      if (!current || at >= current.lines.length) {
        setPlaying(false);
        return;
      }
      const run = ++runRef.current;
      setIndex(at);
      setPlaying(true);
      const line = current.lines[at];
      const onError = () => {
        if (runRef.current !== run) return;
        setPlaying(false);
      };
      const next = () => {
        if (runRef.current !== run) return;
        playFrom(at + 1);
      };
      if (line.speaker !== "check") {
        speak(line.text, { ...voiceFor(line), onEnd: next, onError });
        return;
      }
      /* A recall break: the question, time to think, then the answer. */
      const sayAnswer = () => {
        if (runRef.current !== run) return;
        stopTimer();
        setThinking(null);
        setRevealed((r) => new Set(r).add(at));
        speak(line.answer ?? "", { ...voiceFor(line), onEnd: next, onError });
      };
      speak(`Quick check. ${line.text}`, {
        ...voiceFor(line),
        onEnd: () => {
          if (runRef.current !== run) return;
          let left = RECALL_SECONDS;
          setThinking(left);
          timerRef.current = window.setInterval(() => {
            left -= 1;
            if (left <= 0) sayAnswer();
            else setThinking(left);
          }, 1000);
        },
        onError,
      });
      revealRef.current = sayAnswer;
    },
    [speak, voiceFor],
  );

  const pause = useCallback(() => {
    runRef.current++;
    stopTimer();
    setThinking(null);
    cancel();
    setPlaying(false);
  }, [cancel]);

  useEffect(
    () => () => {
      runRef.current++;
      stopTimer();
      cancel();
    },
    [cancel],
  );

  useEffect(() => setAudioRate(prefs.listenRate), [prefs.listenRate, setAudioRate]);

  /* A different set of choices may already have an episode on this device. */
  useEffect(() => {
    if (!setupOpen) return;
    setScript(readCached(materialId, key));
  }, [key, materialId, setupOpen]);

  /* Keep the line being read in view inside the transcript. */
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    el?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [index]);

  if (setupOpen || !script) {
    if (writing) {
      return (
        <div className={styles.writing} role="status" aria-live="polite">
          <span className={styles.writingIcon} aria-hidden="true">
            <Icon name="headphones" size={28} />
          </span>
          <p className={styles.writingTitle}>Writing your episode…</p>
          <p className={styles.writingNote}>
            {FORMATS[style.format].label}, {LENGTHS[style.length].label.toLowerCase()}, taught from your notes for
            &ldquo;{lesson}&rdquo;. This takes about half a minute.
          </p>
          <span className={styles.bar} aria-hidden="true" />
        </div>
      );
    }
    return (
      <PodcastSetup
        lesson={lesson}
        style={style}
        missed={missed}
        onChange={setStyle}
        hasEpisode={script !== null}
        error={error}
        onMake={() => {
          pause();
          if (script) setSetupOpen(false);
          else void write();
        }}
        onRewrite={() => {
          pause();
          void write();
        }}
        onCancel={script ? () => setSetupOpen(false) : undefined}
      />
    );
  }

  const total = script.lines.length;
  const atEnd = index >= total - 1 && !playing;
  const names = FORMATS[style.format].voices;
  const checks = script.lines.filter((l) => l.speaker === "check").length;

  return (
    <div className={styles.player}>
      <section className={styles.deck} aria-label="Podcast player">
        <div className={styles.cover} aria-hidden="true">
          <Icon name="headphones" size={32} />
        </div>
        <div className={styles.deckText}>
          <p className={styles.eyebrow}>
            {FORMATS[style.format].label} · {LENGTHS[style.length].minutes}
            {checks ? ` · ${checks} recall ${checks === 1 ? "break" : "breaks"}` : ""}
          </p>
          <h2 className={styles.title}>{script.title}</h2>
          <p className={styles.small}>
            Written by AI from your notes, read by your device&apos;s voices. Check anything important against your
            notes.
          </p>
        </div>
        <div
          className={styles.progress}
          role="progressbar"
          aria-label="Episode progress"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={index + 1}
          aria-valuetext={`Line ${index + 1} of ${total}`}
        >
          <span style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>
        {thinking !== null ? (
          <div className={styles.thinking} role="status" aria-live="polite">
            <span>Your turn: answer in your head. The answer comes in {thinking}s.</span>
            <button type="button" className={styles.reveal} onClick={() => revealRef.current()}>
              Show it now
            </button>
          </div>
        ) : null}
        {isSupported ? (
          <div className={styles.controls}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => (playing ? playFrom(Math.max(0, index - 1)) : setIndex(Math.max(0, index - 1)))}
              disabled={index === 0}
              aria-label="Previous line"
            >
              <Icon name="skip-back" size={20} />
            </button>
            <button
              type="button"
              className={styles.playButton}
              onClick={() => (playing ? pause() : playFrom(atEnd ? 0 : index))}
              aria-label={playing ? "Pause" : atEnd ? "Play again" : "Play"}
            >
              <Icon name={playing ? "pause" : "play"} size={26} />
            </button>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => (playing ? playFrom(index + 1) : setIndex(Math.min(total - 1, index + 1)))}
              disabled={index >= total - 1}
              aria-label="Next line"
            >
              <Icon name="skip-forward" size={20} />
            </button>
            <label className={styles.speed}>
              <span className={styles.srOnly}>Speed</span>
              <select
                value={prefs.listenRate}
                onChange={(e) => {
                  saveVoicePrefs({ listenRate: Number(e.target.value) });
                  if (playing) playFrom(index);
                }}
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <p className={styles.small} role="note">
            This browser can&apos;t read aloud, so here is the episode as a transcript.
          </p>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            pause();
            setSetupOpen(true);
          }}
        >
          Change this episode
        </Button>
      </section>

      <ol ref={listRef} className={styles.transcript} aria-label="Transcript">
        {script.lines.map((line, i) => (
          <li key={i} data-index={i}>
            <button
              type="button"
              className={styles.line}
              data-speaker={line.speaker}
              aria-current={i === index ? "true" : undefined}
              onClick={() => (isSupported ? playFrom(i) : setIndex(i))}
            >
              <span className={styles.speaker}>
                {line.speaker === "check" ? "Quick check" : line.speaker === "student" ? (names.student ?? names.host) : names.host}
              </span>
              <span className={styles.lineText}>
                {line.text}
                {line.speaker === "check" ? (
                  revealed.has(i) || !isSupported ? (
                    <span className={styles.checkAnswer}>{line.answer}</span>
                  ) : (
                    <span className={styles.checkHidden}>Answer after a pause</span>
                  )
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* What the episode will be: format, length, focus, recall breaks, voices. */
function PodcastSetup({
  lesson,
  style,
  missed,
  onChange,
  hasEpisode,
  error,
  onMake,
  onRewrite,
  onCancel,
}: {
  lesson: string;
  style: PodcastStyle;
  missed: readonly string[];
  onChange: (patch: Partial<PodcastStyle>) => void;
  /** An episode with exactly these choices is already on this device. */
  hasEpisode: boolean;
  error: string | null;
  onMake: () => void;
  onRewrite: () => void;
  onCancel?: () => void;
}) {
  const titleId = useId();
  const recallId = useId();
  const prefs = useVoicePrefs();
  const voices = FORMATS[style.format].voices;
  const customEmpty = style.focus === "custom" && !style.instructions.trim();

  return (
    <section className={styles.setup} aria-labelledby={titleId}>
      <div>
        <h2 id={titleId} className={styles.setupTitle}>
          Make it your episode
        </h2>
        <p className={styles.small}>&ldquo;{lesson}&rdquo;, taught from your notes, the way you want to hear it.</p>
      </div>

      <fieldset className={styles.field}>
        <legend className={styles.fieldLabel}>Format</legend>
        <div className={styles.options}>
          {PODCAST_FORMATS.map((f) => (
            <label key={f} className={styles.option} data-checked={style.format === f || undefined}>
              <input
                type="radio"
                name="podcast-format"
                value={f}
                checked={style.format === f}
                onChange={() => onChange({ format: f })}
              />
              <span className={styles.optionLabel}>{FORMATS[f].label}</span>
              <span className={styles.optionHint}>{FORMATS[f].hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.field}>
        <legend className={styles.fieldLabel}>Length</legend>
        <div className={styles.segmented}>
          {PODCAST_LENGTHS.map((l) => (
            <label key={l} className={styles.segment} data-checked={style.length === l || undefined}>
              <input
                type="radio"
                name="podcast-length"
                value={l}
                checked={style.length === l}
                onChange={() => onChange({ length: l })}
              />
              <span>{LENGTHS[l].label}</span>
              <span className={styles.optionHint}>{LENGTHS[l].minutes}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.field}>
        <legend className={styles.fieldLabel}>What it covers</legend>
        <div className={styles.segmented}>
          {PODCAST_FOCUSES.map((f) => {
            const off = f === "missed" && missed.length === 0;
            return (
              <label
                key={f}
                className={styles.segment}
                data-checked={style.focus === f || undefined}
                data-disabled={off || undefined}
              >
                <input
                  type="radio"
                  name="podcast-focus"
                  value={f}
                  checked={style.focus === f}
                  disabled={off}
                  onChange={() => onChange({ focus: f })}
                />
                <span>{FOCUS_LABELS[f]}</span>
              </label>
            );
          })}
        </div>
        {missed.length === 0 ? (
          <p className={styles.small}>&ldquo;Only the parts I missed&rdquo; opens once you&apos;ve missed a check in Learn.</p>
        ) : style.focus === "missed" ? (
          <p className={styles.small}>Mostly about: {missed.join(", ")}.</p>
        ) : null}
        {style.focus === "custom" ? (
          <textarea
            className={styles.instructions}
            value={style.instructions}
            maxLength={MAX_INSTRUCTIONS}
            rows={3}
            aria-label="What to focus on"
            placeholder="For example: just the equations, with a worked example of each"
            onChange={(e) => onChange({ instructions: e.target.value })}
          />
        ) : null}
      </fieldset>

      <div className={styles.toggleRow}>
        <span className={styles.toggleText}>
          <span className={styles.fieldLabel} id={recallId}>
            Recall breaks
          </span>
          <span className={styles.small}>
            The episode stops to ask you a question and gives you {RECALL_SECONDS} seconds before the answer.
          </span>
        </span>
        <ToggleSwitch
          checked={style.recallBreaks}
          labelledBy={recallId}
          onChange={(checked) => onChange({ recallBreaks: checked })}
        />
      </div>

      <div className={styles.voices}>
        <VoicePicker
          label={`${voices.host} voice`}
          value={prefs.hostVoice}
          onChange={(v) => saveVoicePrefs({ hostVoice: v })}
          sample={`Hi, I'm your ${voices.host.toLowerCase()} for ${lesson}.`}
        />
        {voices.student ? (
          <VoicePicker
            label={`${voices.student} voice`}
            value={prefs.guestVoice}
            onChange={(v) => saveVoicePrefs({ guestVoice: v })}
            sample={`And I'm the ${voices.student.toLowerCase()}. Let's get into it.`}
          />
        ) : null}
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.setupActions}>
        <Button variant="primary" disabled={customEmpty} onClick={onMake}>
          {hasEpisode ? "Play this episode" : error ? "Try again" : "Make my episode"}
        </Button>
        {hasEpisode ? (
          <Button variant="secondary" onClick={onRewrite}>
            Write a fresh one
          </Button>
        ) : null}
        {onCancel ? (
          <button type="button" className={styles.quietLink} onClick={onCancel}>
            Back to the episode
          </button>
        ) : null}
      </div>
    </section>
  );
}
