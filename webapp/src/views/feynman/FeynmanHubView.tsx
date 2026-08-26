import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import {
  PERSONA_PROFILES,
  type ApprenticePersona,
  type FeynmanDifficulty,
  type FeynmanSessionState,
  generateApprenticeDraft,
  listFeynmanSessions,
  saveFeynmanSession,
  deleteFeynmanSession,
  setActiveFeynmanSessionId,
  getActiveFeynmanSessionId,
} from "../../api/aiFeynman";
import styles from "./FeynmanHubView.module.css";

const QUICK_TOPICS = [
  { subject: "Biology", topic: "Photosynthesis" },
  { subject: "Physics", topic: "Quantum Entanglement" },
  { subject: "Computer Science", topic: "Big O Notation" },
  { subject: "Economics", topic: "Supply & Demand" },
  { subject: "Statistics", topic: "Bayesian Probability" },
  { subject: "AI", topic: "Neural Networks" },
];

export function FeynmanHubView() {
  const navigate = useNavigate();

  const [subject, setSubject] = useState("Biology");
  const [topic, setTopic] = useState("Photosynthesis");
  const [selectedPersona, setSelectedPersona] =
    useState<ApprenticePersona>("curious_beginner");
  const [selectedDifficulty, setSelectedDifficulty] =
    useState<FeynmanDifficulty>("intermediate");
  const [isGenerating, setIsGenerating] = useState(false);
  const [sessions, setSessions] = useState<FeynmanSessionState[]>([]);
  const [activeSession, setActiveSession] =
    useState<FeynmanSessionState | null>(null);

  const refreshSessions = useCallback(() => {
    const all = listFeynmanSessions();
    setSessions(all);
    const activeId = getActiveFeynmanSessionId();
    if (activeId) {
      const active = all.find((s) => s.id === activeId && s.status === "active");
      setActiveSession(active ?? null);
    } else {
      const inProgress = all.find((s) => s.status === "active");
      setActiveSession(inProgress ?? null);
    }
  }, []);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  const handleStartSession = async () => {
    if (!topic.trim()) return;
    setIsGenerating(true);
    try {
      const draft = await generateApprenticeDraft(
        subject.trim() || "General Knowledge",
        topic.trim(),
        selectedPersona,
        selectedDifficulty
      );

      const newSession: FeynmanSessionState = {
        id: `feynman-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        subject: subject.trim() || "General Knowledge",
        topic: topic.trim(),
        persona: selectedPersona,
        difficulty: selectedDifficulty,
        draft,
        turns: [],
        currentScore: 20,
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      saveFeynmanSession(newSession);
      setActiveFeynmanSessionId(newSession.id);
      navigate(`/feynman/studio/${newSession.id}`);
    } catch (err) {
      console.error("Failed to start Feynman session", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleResumeSession = (session: FeynmanSessionState) => {
    setActiveFeynmanSessionId(session.id);
    navigate(`/feynman/studio/${session.id}`);
  };

  const handleViewDebrief = (session: FeynmanSessionState) => {
    navigate(`/feynman/debrief/${session.id}`);
  };

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteFeynmanSession(sessionId);
    refreshSessions();
  };

  return (
    <div className={styles.container}>
      {/* Hero Card */}
      <div className={styles.heroCard}>
        <div className={styles.heroHeader}>
          <div className={styles.heroTitleGroup}>
            <span className={styles.eyebrowBadge}>
              <Icon name="brain" size={14} /> Teach-to-Master Arena
            </span>
            <h1 className={styles.heroTitle}>Feynman AI Apprentice</h1>
            <p className={styles.heroSubtitle}>
              True understanding is the ability to teach a concept simply. Choose
              an AI apprentice with subtle misconceptions, spot their flawed
              reasoning, and guide them to a lightbulb moment.
            </p>
          </div>
        </div>
      </div>

      {/* Active Session Banner */}
      {activeSession && (
        <div className={styles.activeSessionBanner} data-testid="active-session-banner">
          <div className={styles.activeSessionInfo}>
            <div className={styles.activeSessionAvatar}>
              {PERSONA_PROFILES[activeSession.persona].avatar}
            </div>
            <div>
              <div className={styles.activeSessionTitle}>
                In-Progress Arena: {activeSession.topic}
              </div>
              <div className={styles.activeSessionMeta}>
                Apprentice: {PERSONA_PROFILES[activeSession.persona].name} • Current
                Understanding: {activeSession.currentScore}% • {activeSession.turns.length} Turn
                {activeSession.turns.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>
          <div className={styles.activeSessionActions}>
            <Button
              variant="primary"
              onClick={() => handleResumeSession(activeSession)}
            >
              <Icon name="play" size={16} /> Resume Teaching
            </Button>
          </div>
        </div>
      )}

      {/* Arena Setup Card */}
      <div className={styles.heroCard}>
        <div className={styles.configGrid}>
          {/* Topic Configuration */}
          <div className={styles.fieldGroup}>
            <div className={styles.sectionTitle}>
              <Icon name="target" size={20} /> 1. Select Subject & Topic
            </div>
            <div className={styles.inputRow}>
              <div className={styles.fieldGroup}>
                <label htmlFor="subject-input" className={styles.fieldLabel}>
                  Subject
                </label>
                <input
                  id="subject-input"
                  className={styles.fieldInput}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Biology, Physics, CS"
                />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="topic-input" className={styles.fieldLabel}>
                  Topic or Concept to Master
                </label>
                <input
                  id="topic-input"
                  className={styles.fieldInput}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Photosynthesis, Bell's Theorem"
                />
              </div>
            </div>
            <div className={styles.topicChips}>
              <span className={styles.fieldLabel} style={{ alignSelf: "center", marginRight: 4 }}>
                Popular:
              </span>
              {QUICK_TOPICS.map((item) => (
                <button
                  key={item.topic}
                  type="button"
                  className={styles.topicChip}
                  onClick={() => {
                    setSubject(item.subject);
                    setTopic(item.topic);
                  }}
                >
                  {item.topic} ({item.subject})
                </button>
              ))}
            </div>
          </div>

          {/* Apprentice Persona Selection */}
          <div className={styles.fieldGroup}>
            <div className={styles.sectionTitle}>
              <Icon name="user" size={20} /> 2. Choose Your Apprentice Persona
            </div>
            <div className={styles.personaGrid}>
              {(Object.keys(PERSONA_PROFILES) as ApprenticePersona[]).map((key) => {
                const p = PERSONA_PROFILES[key];
                const isSelected = selectedPersona === key;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`${styles.personaCard} ${isSelected ? styles.selected : ""}`}
                    onClick={() => setSelectedPersona(key)}
                    data-testid={`persona-${key}`}
                  >
                    {isSelected && (
                      <div className={styles.personaSelectedCheck}>
                        <Icon name="check" size={14} />
                      </div>
                    )}
                    <div className={styles.personaHeader}>
                      <div className={styles.personaAvatar}>{p.avatar}</div>
                      <div>
                        <div className={styles.personaName}>{p.name}</div>
                        <div className={styles.personaTagline}>{p.challengeStyle}</div>
                      </div>
                    </div>
                    <p className={styles.personaTagline}>{p.description}</p>
                    <div className={styles.personaTraits}>
                      {p.traits.map((t) => (
                        <span key={t} className={styles.traitBadge}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Difficulty Selection */}
          <div className={styles.fieldGroup}>
            <div className={styles.sectionTitle}>
              <Icon name="award" size={20} /> 3. Select Challenge Depth
            </div>
            <div className={styles.difficultyRow}>
              {(["beginner", "intermediate", "advanced"] as FeynmanDifficulty[]).map((diff) => (
                <button
                  key={diff}
                  type="button"
                  className={`${styles.difficultyBtn} ${
                    selectedDifficulty === diff ? styles.selected : ""
                  }`}
                  onClick={() => setSelectedDifficulty(diff)}
                  data-testid={`difficulty-${diff}`}
                >
                  {diff === "beginner" && "🌱 Intuition & Analogies (Beginner)"}
                  {diff === "intermediate" && "⚡ Mechanisms & Traps (Intermediate)"}
                  {diff === "advanced" && "🔬 Edge Cases & Proofs (Advanced)"}
                </button>
              ))}
            </div>
          </div>

          {/* Launch Button */}
          <div className={styles.launchRow}>
            <Button
              variant="primary"
              size="md"
              onClick={handleStartSession}
              disabled={isGenerating || !topic.trim()}
              data-testid="start-arena-btn"
            >
              {isGenerating ? (
                <>
                  <Icon name="refresh-cw" size={18} /> Preparing Apprentice Draft...
                </>
              ) : (
                <>
                  <Icon name="zap" size={18} /> Enter Teaching Arena
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Past Sessions History */}
      <div className={styles.historyCard}>
        <div className={styles.sectionTitle}>
          <Icon name="calendar-week" size={20} /> Past Teaching Sessions ({sessions.length})
        </div>

        {sessions.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🎓</div>
            <h3>No teaching sessions yet</h3>
            <p>
              Launch your first session above to test your depth of understanding on any subject!
            </p>
          </div>
        ) : (
          <div className={styles.sessionList}>
            {sessions.map((sess) => {
              const persona = PERSONA_PROFILES[sess.persona];
              const isCompleted = sess.status === "completed";
              return (
                <div key={sess.id} className={styles.sessionRow} data-testid="session-row">
                  <div className={styles.sessionMain}>
                    <div className={styles.sessionAvatar}>{persona.avatar}</div>
                    <div>
                      <div className={styles.sessionTopic}>
                        {sess.topic} <span className={styles.sessionSub}>({sess.subject})</span>
                      </div>
                      <div className={styles.sessionSub}>
                        <span>Apprentice: {persona.name}</span>
                        <span>•</span>
                        <span
                          className={`${styles.badge} ${
                            isCompleted ? styles.badgeSuccess : styles.badgeAccent
                          }`}
                        >
                          {isCompleted ? "Mastered" : "In Progress"} ({sess.currentScore}%)
                        </span>
                        <span>•</span>
                        <span>{sess.turns.length} Turns</span>
                      </div>
                    </div>
                  </div>

                  <div className={styles.sessionActions}>
                    {isCompleted ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleViewDebrief(sess)}
                        data-testid="view-debrief-btn"
                      >
                        <Icon name="file-text" size={14} /> View Debrief
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleResumeSession(sess)}
                        data-testid="resume-session-btn"
                      >
                        <Icon name="play" size={14} /> Resume
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={(e) => handleDeleteSession(sess.id, e)}
                      aria-label="Delete session"
                      data-testid="delete-session-btn"
                    >
                      <Icon name="trash" size={14} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
