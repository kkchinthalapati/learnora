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
  vibeTitle?: string;
  focusGoal?: string;
  interimTranscript?: string;
  confirmedTranscript?: string;
  onDoneSpeaking?: () => void;
  onPauseCall?: () => void;
  onResumeCall?: () => void;
  isCallPaused?: boolean;
  onEndCall?: () => void;
  audioRate?: number;
  onToggleAudioRate?: () => void;
  isAudioMuted?: boolean;
  onToggleAudioMuted?: () => void;
  callDurationSeconds?: number;
}

function formatCallTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function SparringStage({
  currentSpeaker,
  activeAiSpeaker,
  isListening,
  isSpeaking,
  conceptAnchor,
  onToggleMic,
  micDisabled = false,
  vibeTitle,
  focusGoal,
  interimTranscript = "",
  confirmedTranscript = "",
  onDoneSpeaking,
  onPauseCall,
  onResumeCall,
  isCallPaused = false,
  onEndCall,
  audioRate = 1.0,
  onToggleAudioRate,
  isAudioMuted = false,
  onToggleAudioMuted,
  callDurationSeconds = 0,
}: SparringStageProps) {
  const isAlexActive =
    (activeAiSpeaker === "alex" || currentSpeaker === "alex") && isSpeaking;
  const isJordanActive =
    (activeAiSpeaker === "jordan" || currentSpeaker === "jordan") && isSpeaking;
  const isStudentActive = isListening || currentSpeaker === "student";

  const alex = SPARRING_PERSONAS.alex;
  const jordan = SPARRING_PERSONAS.jordan;

  const activePersonaName = isAlexActive
    ? alex.name
    : isJordanActive
      ? jordan.name
      : vibeTitle || "AI Examiner";

  const statusLabel = isCallPaused
    ? "Call paused — click Resume to continue viva"
    : isStudentActive
      ? "Listening to your explanation…"
      : isAlexActive
        ? `${alex.name} is probing foundational intuition…`
        : isJordanActive
          ? `${jordan.name} is challenging with counter-examples…`
          : "Your turn: speak your reasoning or type below";

  const activeTranscript = interimTranscript
    ? confirmedTranscript
      ? `${confirmedTranscript} ${interimTranscript}`
      : interimTranscript
    : confirmedTranscript;

  return (
    <section
      className={styles.stageContainer}
      aria-label="Socratic Sparring Stage"
    >
      {/* Alex Pod (Left) */}
      <div
        className={`${styles.avatarPod} ${styles.podAlex} ${
          isAlexActive ? styles.podSpeaking : ""
        }`}
        data-testid="alex-pod"
      >
        <div className={styles.avatarRing}>
          <span
            className={styles.avatarGlyph}
            role="img"
            aria-label="Alex avatar"
          >
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

      {/* Center Arena / Live Call In Progress */}
      <div className={styles.centerArena}>
        {/* Top In-Call Badges */}
        <div className={styles.callMetaRow}>
          <span
            className={`${styles.callLiveBadge} ${
              isCallPaused ? styles.callLiveBadgePaused : ""
            }`}
          >
            <span
              className={`${styles.callLiveDot} ${
                isCallPaused ? styles.callLiveDotPaused : ""
              }`}
            />
            <span>
              {isCallPaused
                ? "PAUSED"
                : `LIVE • ${formatCallTime(callDurationSeconds)}`}
            </span>
          </span>

          {conceptAnchor && (
            <div className={styles.anchorBadge} title="Current Viva Focus">
              <Icon name="target" size={14} />
              <span>Focus: {conceptAnchor}</span>
            </div>
          )}

          <span className={styles.personaVibePill} title="Examiner Persona">
            {activePersonaName}
          </span>

          {focusGoal && (
            <span className={styles.personaVibePill} title="Student Goal">
              🎯 {focusGoal}
            </span>
          )}
        </div>

        {/* Big Caller Orb Visualizer */}
        <div
          className={`${styles.callCenterOrb} ${
            isSpeaking
              ? styles.callCenterOrbSpeaking
              : isListening
                ? styles.callCenterOrbListening
                : isCallPaused
                  ? styles.callCenterOrbPaused
                  : ""
          }`}
        >
          <span className={styles.avatarGlyph} role="img" aria-label="Caller icon">
            {isStudentActive
              ? "🎙️"
              : isAlexActive
                ? alex.avatar
                : isJordanActive
                  ? jordan.avatar
                  : "✨"}
          </span>
          {isSpeaking && <span className={styles.callOrbPulseRing} />}
          {isListening && <span className={styles.callOrbListeningRing} />}
        </div>

        <div className={styles.statusAnnouncement} aria-live="polite">
          {statusLabel}
        </div>

        {/* Live Audio Waveform */}
        <AudioWaveform
          isActive={(isStudentActive || isSpeaking) && !isCallPaused}
          mode={
            isCallPaused
              ? "idle"
              : isStudentActive
                ? "listening"
                : isSpeaking
                  ? "speaking"
                  : "idle"
          }
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

        {/* Live spoken transcript box */}
        {isListening && (
          <div className={styles.stageTranscriptBox} role="status">
            <span className={styles.liveDot} />
            <span className={styles.stageTranscriptText}>
              {activeTranscript || "Listening for your voice… speak freely"}
            </span>
          </div>
        )}

        {/* In-Call Controls Bar */}
        <div className={styles.callControlsBar}>
          {/* Main Mic Push-to-Talk Button (Preserving original accessible attributes) */}
          <button
            type="button"
            className={`${styles.centerMicBtn} ${
              isListening ? styles.centerMicBtnRecording : ""
            }`}
            onClick={onToggleMic}
            disabled={micDisabled || isCallPaused}
            aria-label={
              isListening
                ? "Stop recording speech"
                : "Start speaking response"
            }
            title={
              isListening
                ? "Stop recording"
                : "Push to speak (or press Space)"
            }
          >
            <span className={styles.centerMicIconWrapper}>
              <Icon name={isListening ? "mic-off" : "mic"} size={22} />
            </span>
            <span className={styles.centerMicText}>
              {isListening ? "Listening (Tap to stop)" : "Push to Speak"}
            </span>
            {isListening && <span className={styles.micAura} />}
          </button>

          {/* Quick Submit button if student finished speaking */}
          {isListening && onDoneSpeaking && (
            <button
              type="button"
              className={`${styles.callCtrlBtn} ${styles.callCtrlBtnSend}`}
              onClick={onDoneSpeaking}
              title="Submit your spoken explanation immediately"
            >
              <Icon name="check" size={16} />
              <span>Done Speaking</span>
            </button>
          )}

          {/* Pause / Resume Call */}
          {(onPauseCall || onResumeCall) && (
            <button
              type="button"
              className={styles.callCtrlBtn}
              onClick={isCallPaused ? onResumeCall : onPauseCall}
              title={isCallPaused ? "Resume viva call" : "Pause viva call"}
            >
              <Icon name={isCallPaused ? "play" : "pause"} size={16} />
              <span>{isCallPaused ? "Resume Call" : "Pause"}</span>
            </button>
          )}

          {/* Audio Speed Toggle (1x / 1.25x) */}
          {onToggleAudioRate && (
            <button
              type="button"
              className={styles.callCtrlBtn}
              onClick={onToggleAudioRate}
              title="Toggle AI voice speed"
            >
              <Icon name="clock" size={16} />
              <span>{audioRate}x</span>
            </button>
          )}

          {/* Speaker Mute Toggle */}
          {onToggleAudioMuted && (
            <button
              type="button"
              className={`${styles.callCtrlBtn} ${
                isAudioMuted ? styles.callCtrlBtnActive : ""
              }`}
              onClick={onToggleAudioMuted}
              title={isAudioMuted ? "Unmute AI voice output" : "Mute AI voice output"}
            >
              <Icon name={isAudioMuted ? "volume-x" : "volume-2"} size={16} />
              <span>{isAudioMuted ? "Voice: Muted" : "Voice: On"}</span>
            </button>
          )}

          {/* End Call Button */}
          {onEndCall && (
            <button
              type="button"
              className={`${styles.callCtrlBtn} ${styles.callCtrlBtnEnd}`}
              onClick={onEndCall}
              title="End viva call and view scorecard"
            >
              <Icon name="phone-off" size={16} />
              <span>End Call</span>
            </button>
          )}
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
          <span
            className={styles.avatarGlyph}
            role="img"
            aria-label="Jordan avatar"
          >
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
