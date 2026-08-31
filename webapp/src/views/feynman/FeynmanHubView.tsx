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
import { CognitiveBridge } from "../../lib/cognitiveBridge";
import styles from "./FeynmanHubView.module.css";
import { EmptyState } from "../../components/EmptyState";

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

    const bridged = CognitiveBridge.getPayload();
    if (bridged && bridged.sourceTool !== "feynman") {
      if (bridged.subject) {
        setSubject(bridged.subject);
      }
      const targetTopic = bridged.concept || bridged.topic;
      if (targetTopic) {
        setTopic(targetTopic);
      }
    }
  }, [refreshSessions]);

  const handleStartSession = async () => {
    if (!topic.trim()) return;
    setIsGenerating(true);
    try {
      const draft = await generateApprenticeDraft(
        subject.trim() || "General knowledge",
        topic.trim(),
        selectedPersona,
        selectedDifficulty
      );

      const newSession: FeynmanSessionState = {
        id: `feynman-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        subject: subject.trim() || "General knowledge",
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
              <Icon name="brain" size={14} /> Study Lab
            </span>
            <h1 className={styles.heroTitle}>Explain It Simply</h1>
            <p className={styles.heroSubtitle}>
              If you can explain something simply, you understand it. Pick someone
              to teach — they'll have a few things muddled — spot where they've gone
              wrong, and talk them round.
            </p>
          </div>
        </div>
      </div>

      {/* Banner for a session in progress */}
      {activeSession && (
        <div className={styles.activeSessionBanner} data-testid="active-session-banner">
          <div className={styles.activeSessionInfo}>
            <div className={styles.activeSessionAvatar}>
              {PERSONA_PROFILES[activeSession.persona].avatar}
            </div>
            <div>
              <div className={styles.activeSessionTitle}>
                Still going: {activeSession.topic}
              </div>
              <div className={styles.activeSessionMeta}>
                Teaching {PERSONA_PROFILES[activeSession.persona].name} • they're
                {" "}{activeSession.currentScore}% of the way there • {activeSession.turns.length}
                {" "}message{activeSession.turns.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>
          <div className={styles.activeSessionActions}>
            <Button
              variant="primary"
              onClick={() => handleResumeSession(activeSession)}
            >
              <Icon name="play" size={16} /> Carry on
            </Button>
          </div>
        </div>
      )}

      {/* Setup card */}
      <div className={styles.heroCard}>
        <div className={styles.configGrid}>
          {/* Topic Configuration */}
          <div className={styles.fieldGroup}>
            <div className={styles.sectionTitle}>
              <Icon name="target" size={20} /> 1. What are you explaining?
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
                  Topic
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
                Try one:
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

          {/* Who you are teaching */}
          <div className={styles.fieldGroup}>
            <div className={styles.sectionTitle}>
              <Icon name="user" size={20} /> 2. Who are you teaching?
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

          {/* How hard */}
          <div className={styles.fieldGroup}>
            <div className={styles.sectionTitle}>
              <Icon name="award" size={20} /> 3. How hard should they push you?
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
                  {diff === "beginner" && "Gently — just the big idea"}
                  {diff === "intermediate" && "A bit — how it actually works"}
                  {diff === "advanced" && "Hard — the tricky cases"}
                </button>
              ))}
            </div>
          </div>

          {/* Start button */}
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
                  <Icon name="refresh-cw" size={18} /> Getting them ready…
                </>
              ) : (
                <>
                  <Icon name="zap" size={18} /> Start teaching
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Past sessions */}
      <div className={styles.historyCard}>
        <div className={styles.sectionTitle}>
          <Icon name="calendar-week" size={20} /> Things you've explained ({sessions.length})
        </div>

        {sessions.length === 0 ? (
          <EmptyState
            icon="brain"
            title="Nothing here yet"
            message="Pick a topic above and try explaining it. It's the quickest way to find out what you actually know."
          />
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
                        <span>Taught {persona.name}</span>
                        <span>•</span>
                        <span
                          className={`${styles.badge} ${
                            isCompleted ? styles.badgeSuccess : styles.badgeAccent
                          }`}
                        >
                          {isCompleted ? "Nailed it" : "Still going"} ({sess.currentScore}%)
                        </span>
                        <span>•</span>
                        <span>{sess.turns.length} messages</span>
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
                        <Icon name="file-text" size={14} /> See how it went
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleResumeSession(sess)}
                        data-testid="resume-session-btn"
                      >
                        <Icon name="play" size={14} /> Carry on
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={(e) => handleDeleteSession(sess.id, e)}
                      aria-label={`Delete the session on ${sess.topic}`}
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
