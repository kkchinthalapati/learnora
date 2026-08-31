import { useState, useEffect, useRef, type FormEvent } from "react";
import { useParams } from "react-router";
import { useStudyRoom } from "./useStudyRoom";
import { StudyDeskCard } from "./StudyDeskCard";
import { ReactionOverlay } from "./ReactionOverlay";
import { ambianceEngine } from "./audioAmbiance";
import type { AmbiancePreset } from "./types";
import { MAX_MESSAGE_LENGTH } from "../../api/studyRoom";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { useOverlayBehavior } from "../../context/overlayStack";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import styles from "./room.module.css";

const AMBIANCE_PRESETS: { id: AmbiancePreset; label: string; icon: string }[] =
  [
    { id: "rain", label: "Gentle Rain", icon: "🌧️" },
    { id: "white_noise", label: "Brown Noise", icon: "📻" },
    { id: "cafe", label: "Cafe Murmur", icon: "☕" },
    { id: "waves", label: "Ocean Waves", icon: "🌊" },
    { id: "binaural", label: "Alpha Waves (10Hz)", icon: "🧠" },
  ];

const QUICK_GLOBAL_CHEERS = ["🔥", "👏", "☕", "🧠", "💪", "✨", "🎉"];

export function StudyRoomView() {
  const { roomId } = useParams<{ roomId?: string }>();
  const {
    selfParticipant,
    friendsParticipants,
    activeCount,
    messages = [],
    sendMessage,
    reactions,
    cheerFeed,
    sendCheer,
    broadcastCheer,
    syncWithParticipant,
    copyInviteLink,
    isCopied,
  } = useStudyRoom(roomId);

  // Chat message draft state
  const [chatInput, setChatInput] = useState<string>("");

  // Sound ambiance state
  const [isAmbianceOpen, setIsAmbianceOpen] = useState<boolean>(false);
  const [currentAmbiance, setCurrentAmbiance] =
    useState<AmbiancePreset>("none");
  const [ambianceVolume, setAmbianceVolume] = useState<number>(0.5);
  const ambianceMenuRef = useRef<HTMLDivElement>(null);
  const ambiancePopoverRef = useRef<HTMLDivElement>(null);

  useOverlayBehavior({
    ref: ambiancePopoverRef,
    open: isAmbianceOpen,
    onClose: () => setIsAmbianceOpen(false),
  });
  useFocusTrap(ambiancePopoverRef, isAmbianceOpen);

  // Close ambiance popover on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        ambianceMenuRef.current &&
        !ambianceMenuRef.current.contains(event.target as Node)
      ) {
        setIsAmbianceOpen(false);
      }
    };
    if (isAmbianceOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isAmbianceOpen]);

  // Clean up ambiance audio on unmount
  useEffect(() => {
    return () => {
      ambianceEngine.stop();
    };
  }, []);

  const handleSelectAmbiance = (preset: AmbiancePreset) => {
    if (currentAmbiance === preset) {
      ambianceEngine.stop();
      setCurrentAmbiance("none");
    } else {
      ambianceEngine.play(preset, ambianceVolume);
      setCurrentAmbiance(preset);
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    setAmbianceVolume(newVolume);
    ambianceEngine.setVolume(newVolume);
  };

  const handleSendChat = async (e: FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    if (sendMessage) {
      await sendMessage(chatInput);
    }
    setChatInput("");
  };

  const activeAmbianceMeta = AMBIANCE_PRESETS.find(
    (p) => p.id === currentAmbiance,
  );

  return (
    <main className={styles.roomView} aria-label="Virtual Study Room">
      {/* Reaction & Floating Animation Overlay */}
      <ReactionOverlay reactions={reactions} cheerFeed={cheerFeed} />

      {/* Room Header Top Bar */}
      <header className={styles.roomHeader}>
        <div className={styles.roomHeaderLeft}>
          <div className={styles.roomTitleRow}>
            <h1 className={styles.roomTitle}>Virtual Study Circle</h1>
            <div className={styles.roomStats} aria-label="Active participants">
              <span className={styles.liveDot} />
              <span>
                {activeCount} {activeCount === 1 ? "student" : "students"}{" "}
                focusing together
              </span>
            </div>
          </div>
          <p className={styles.roomSub}>
            Quiet co-working room · Live timer sync & cheers
          </p>
        </div>

        <div className={styles.roomActions}>
          {/* Sound Ambiance Control */}
          <div className={styles.ambianceWrapper} ref={ambianceMenuRef}>
            <button
              type="button"
              className={`${styles.ambianceTrigger} ${
                currentAmbiance !== "none" ? styles.ambianceTriggerActive : ""
              }`}
              onClick={() => setIsAmbianceOpen((prev) => !prev)}
              aria-haspopup="dialog"
              aria-expanded={isAmbianceOpen}
              aria-label="Sound ambiance focus generator"
            >
              <span>{activeAmbianceMeta ? activeAmbianceMeta.icon : "🎧"}</span>
              <span>
                {activeAmbianceMeta
                  ? activeAmbianceMeta.label
                  : "Sound Ambiance"}
              </span>
              <Icon
                name="chevron-down"
                size={14}
                className={`${styles.ambianceChevron} ${
                  isAmbianceOpen ? styles.ambianceChevronOpen : ""
                }`}
              />
            </button>

            {isAmbianceOpen && (
              <div
                ref={ambiancePopoverRef}
                className={styles.ambianceMenu}
                role="dialog"
                aria-modal="true"
                aria-label="Sound ambiance settings"
              >
                <p className={styles.ambianceTitle}>Focus Soundscapes</p>
                <div className={styles.ambianceGrid}>
                  {AMBIANCE_PRESETS.map((preset) => {
                    const isSelected = currentAmbiance === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        className={`${styles.ambiancePresetBtn} ${
                          isSelected ? styles.ambiancePresetSelected : ""
                        }`}
                        onClick={() => handleSelectAmbiance(preset.id)}
                        aria-label={preset.label}
                        aria-pressed={isSelected}
                      >
                        <span>{preset.icon}</span>
                        <span>{preset.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className={styles.ambianceVolumeRow}>
                  <Icon name="clock" size={14} />
                  <label
                    htmlFor="ambiance-vol"
                    className={styles.ambianceTitle}
                  >
                    Volume
                  </label>
                  <input
                    id="ambiance-vol"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={ambianceVolume}
                    onChange={(e) =>
                      handleVolumeChange(parseFloat(e.target.value))
                    }
                    className={styles.ambianceVolumeSlider}
                    aria-label="Ambiance volume"
                  />
                  {currentAmbiance !== "none" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleSelectAmbiance(currentAmbiance)}
                    >
                      Mute
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Copy Invite Link */}
          <Button
            variant="primary"
            size="md"
            className={styles.inviteButton}
            onClick={() => void copyInviteLink()}
            aria-label="Copy study room invite link"
          >
            <Icon name="link" size={16} />
            <span>
              {isCopied ? "Link Copied!" : "Copy study room invite link"}
            </span>
          </Button>
        </div>
      </header>

      {/* Global Room Cheer Bar */}
      <section
        className={styles.roomCheerBar}
        aria-label="Send a cheer to everyone in the room"
      >
        <div className={styles.roomCheerPrompt}>
          <Icon name="zap" size={16} />
          <span>Cheer everyone in the room:</span>
        </div>
        <div className={styles.roomCheerEmojis}>
          {QUICK_GLOBAL_CHEERS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className={styles.cheerBtn}
              onClick={() => broadcastCheer(emoji)}
              aria-label={`Send ${emoji} to the entire study circle`}
              title={`Cheer the room with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </section>

      {/* Desks Grid */}
      <section className={styles.desksGrid} aria-label="Student Study Desks">
        {/* Current User Self Desk */}
        {selfParticipant && (
          <StudyDeskCard
            participant={selfParticipant}
            isSelf={true}
            onCheer={(emoji) => broadcastCheer(emoji)}
          />
        )}

        {/* Friends Desks */}
        {friendsParticipants.map((friend) => (
          <StudyDeskCard
            key={friend.id || friend.userId}
            participant={friend}
            isSelf={false}
            onCheer={(emoji) => sendCheer(friend, emoji)}
            onSync={() => syncWithParticipant(friend)}
          />
        ))}
      </section>

      {/* Empty State when alone in the room */}
      {friendsParticipants.length === 0 && (
        <section
          className={styles.emptyState}
          aria-label="Empty study room prompt"
        >
          <div className={styles.emptyIcon}>
            <Icon name="users" size={44} />
          </div>
          <h2 className={styles.emptyTitle}>You're the first one here!</h2>
          <p className={styles.emptySub}>
            Studying is more motivating together. Share your room invite link
            with study partners or classmates to sync timers and keep each other
            accountable.
          </p>
          <Button
            variant="primary"
            size="md"
            onClick={() => void copyInviteLink()}
            aria-label="Invite Friends to Study"
          >
            <Icon name="link" size={16} />
            <span>{isCopied ? "Link Copied!" : "Invite Friends to Study"}</span>
          </Button>
        </section>
      )}

      {/* Room Chat Section */}
      <section
        className={`${styles.deskCard} ${styles.chatSection}`}
        role="region"
        aria-label="Room Chat"
      >
        <h3 className={styles.chatTitle}>Room Chat</h3>

        {messages.length === 0 ? (
          <p className={styles.chatEmpty}>
            Welcome to the study room! Say hello or share your focus goals for
            today.
          </p>
        ) : (
          <div className={styles.chatMessages}>
            {messages.map((msg) => (
              <div key={msg.id} className={styles.chatMessage}>
                <strong>{msg.userName}:</strong>
                <span>{msg.text}</span>
              </div>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => void handleSendChat(e)}
          className={styles.chatForm}
        >
          <input
            type="text"
            className={styles.chatInput}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder="Send a quiet message…"
            aria-label="Room chat message"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            aria-label="Send message"
          >
            <Icon name="send" size={16} />
          </Button>
        </form>
      </section>
    </main>
  );
}
