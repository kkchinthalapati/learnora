import { Icon } from "../../components/Icon";
import { SPARRING_PERSONAS, type SparringPersona } from "../../api/aiSparring";
import { AudioWaveform } from "./AudioWaveform";
import styles from "./sparring.module.css";

export interface SparringStageProps {
  currentSpeaker: SparringPersona | "student" | null;
  activeAiSpeaker: SparringPersona | null;
  isListening: boolean;
  isSpeaking: boolean;
  conceptAnchor?: string;
  onToggleMic: () => void;
  micDisabled?: boolean;
}

export function SparringStage({
  currentSpeaker,
  activeAiSpeaker,
  isListening,
  isSpeaking,
  conceptAnchor,
  onToggleMic,
  micDisabled = false,
}: SparringStageProps) {
  const isAlexActive =
    (activeAiSpeaker === "alex" || currentSpeaker === "alex") && isSpeaking;
  const isJordanActive =
    (activeAiSpeaker === "jordan" || currentSpeaker === "jordan") && isSpeaking;
  const isStudentActive = isListening || currentSpeaker === "student";

  const alex = SPARRING_PERSONAS.alex;
  const jordan = SPARRING_PERSONAS.jordan;

  const statusLabel = isStudentActive
    ? "Listening to your explanation…"
    : isAlexActive
      ? "Alex is probing foundational intuition…"
      : isJordanActive
        ? "Jordan is challenging with counter-examples…"
        : "Your turn: speak your reasoning or type below";

  return (
    <section className={styles.stageContainer} aria-label="Socratic Sparring Stage">
      {/* Alex Pod (Left) */}
      <div
        className={`${styles.avatarPod} ${styles.podAlex} ${
          isAlexActive ? styles.podSpeaking : ""
        }`}
        data-testid="alex-pod"
      >
        <div className={styles.avatarRing}>
          <span className={styles.avatarGlyph} role="img" aria-label="Alex avatar">
            {alex.avatar}
          </span>
          {isAlexActive && <span className={styles.pulseRing} />}
        </div>
        <div className={styles.podInfo}>
          <div className={styles.podNameRow}>
            <span className={styles.podName}>{alex.name}</span>
            <span className={`${styles.podBadge} ${styles.badgeAlex}`}>
              {alex.title}
            </span>
          </div>
          <p className={styles.podDescription}>{alex.description}</p>
        </div>
      </div>

      {/* Center Arena */}
      <div className={styles.centerArena}>
        {conceptAnchor && (
          <div className={styles.anchorBadge} title="Current Socratic Focus">
            <Icon name="target" size={14} />
            <span>Focus: {conceptAnchor}</span>
          </div>
        )}

        <div className={styles.statusAnnouncement} aria-live="polite">
          {statusLabel}
        </div>

        <AudioWaveform
          isActive={isStudentActive || isSpeaking}
          mode={isStudentActive ? "listening" : isSpeaking ? "speaking" : "idle"}
          speaker={
            isStudentActive
              ? "student"
              : isAlexActive
                ? "alex"
                : isJordanActive
                  ? "jordan"
                  : null
          }
          height={48}
          barsCount={28}
        />

        <div className={styles.stageActions}>
          <button
            type="button"
            className={`${styles.centerMicBtn} ${
              isListening ? styles.centerMicBtnRecording : ""
            }`}
            onClick={onToggleMic}
            disabled={micDisabled}
            aria-label={isListening ? "Stop recording speech" : "Start speaking response"}
            title={isListening ? "Stop recording" : "Push to speak (or press Space)"}
          >
            <span className={styles.centerMicIconWrapper}>
              <Icon name="mic" size={24} />
            </span>
            <span className={styles.centerMicText}>
              {isListening ? "Listening (Tap to finish)" : "Push to Speak"}
            </span>
            {isListening && <span className={styles.micAura} />}
          </button>
        </div>
      </div>

      {/* Jordan Pod (Right) */}
      <div
        className={`${styles.avatarPod} ${styles.podJordan} ${
          isJordanActive ? styles.podSpeaking : ""
        }`}
        data-testid="jordan-pod"
      >
        <div className={styles.avatarRing}>
          <span className={styles.avatarGlyph} role="img" aria-label="Jordan avatar">
            {jordan.avatar}
          </span>
          {isJordanActive && <span className={styles.pulseRing} />}
        </div>
        <div className={styles.podInfo}>
          <div className={styles.podNameRow}>
            <span className={styles.podName}>{jordan.name}</span>
            <span className={`${styles.podBadge} ${styles.badgeJordan}`}>
              {jordan.title}
            </span>
          </div>
          <p className={styles.podDescription}>{jordan.description}</p>
        </div>
      </div>
    </section>
  );
}
