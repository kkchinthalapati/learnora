import { useRef, useState, useMemo, useEffect } from "react";
import { Link } from "react-router";
import { Icon } from "../../components/Icon";
import {
  generateRecoveryDrill,
  type ConceptNode,
} from "../../lib/conceptGraph";
import { useCreateModal } from "../../context/createModal";
import { useOverlayBehavior } from "../../context/overlayStack";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import styles from "./graph.module.css";

interface ConceptNodeDrawerProps {
  node: ConceptNode | null;
  allNodes: ConceptNode[];
  isOpen: boolean;
  onClose: () => void;
  onSelectRelated: (conceptId: string) => void;
  initialDrillOpen?: boolean;
}

export function ConceptNodeDrawer({
  node,
  allNodes,
  isOpen,
  onClose,
  onSelectRelated,
  initialDrillOpen = false,
}: ConceptNodeDrawerProps) {
  const { openCreateModal } = useCreateModal();
  const drawerRef = useRef<HTMLElement>(null);
  const [showRecoveryDrill, setShowRecoveryDrill] = useState(initialDrillOpen);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});

  useEffect(() => {
    setShowRecoveryDrill(initialDrillOpen);
    setSelectedAnswers({});
  }, [node?.id, initialDrillOpen]);

  useOverlayBehavior({ ref: drawerRef, open: isOpen && !!node, onClose });
  useFocusTrap(drawerRef, isOpen && !!node);

  const nodeMap = useMemo(() => new Map(allNodes.map((n) => [n.id, n])), [allNodes]);

  const relatedList = useMemo(() => {
    if (!node) return [];
    return node.relatedConcepts
      .map((id) => nodeMap.get(id))
      .filter((n): n is ConceptNode => Boolean(n));
  }, [node, nodeMap]);

  const prereqNodes = useMemo(() => {
    if (!node) return [];
    return (node.prerequisites || [])
      .map((id) => nodeMap.get(id))
      .filter((n): n is ConceptNode => Boolean(n));
  }, [node, nodeMap]);

  const depNodes = useMemo(() => {
    if (!node) return [];
    return (node.dependents || [])
      .map((id) => nodeMap.get(id))
      .filter((n): n is ConceptNode => Boolean(n));
  }, [node, nodeMap]);

  const recoveryDrill = useMemo(() => {
    if (!node) return null;
    return generateRecoveryDrill(node, allNodes);
  }, [node, allNodes]);

  if (!node) return null;

  const masteryColor =
    node.masteryScore >= 75
      ? "var(--success)"
      : node.masteryScore >= 50
        ? "var(--warning)"
        : "var(--danger)";

  const practiceLink = node.deckId
    ? `/review/${node.deckId}`
    : node.quizId
      ? `/quiz/${node.quizId}`
      : null;

  const handleSelectOption = (questionId: number, optionIdx: number) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: optionIdx,
    }));
  };

  const answeredCount = Object.keys(selectedAnswers).length;
  const totalQuestions = recoveryDrill?.highYieldQuestions.length || 0;
  const correctCount = recoveryDrill
    ? recoveryDrill.highYieldQuestions.filter(
        (q) => selectedAnswers[q.id] === q.correctIndex,
      ).length
    : 0;

  return (
    <>
      <div
        className={`${styles.drawerOverlay} ${isOpen ? styles.drawerOverlayOpen : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        ref={drawerRef}
        className={`${styles.drawer} ${isOpen ? styles.drawerOpen : ""}`}
        role="dialog"
        aria-label={`Concept details for ${node.label}`}
        aria-modal="true"
      >
        <div className={styles.drawerHeader}>
          <div className={styles.drawerTitleGroup}>
            <span
              className={styles.drawerFolderBadge}
              style={{
                backgroundColor: `${node.folderColor}20`,
                color: node.folderColor,
                border: `1px solid ${node.folderColor}40`,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: node.folderColor,
                  display: "inline-block",
                }}
              />
              {node.folderName}
            </span>
            <h2 className={styles.drawerTitle}>{node.label}</h2>
          </div>

          <button
            type="button"
            className={styles.drawerCloseBtn}
            onClick={onClose}
            aria-label="Close concept drawer"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className={styles.drawerBody}>
          {/* Knowledge Gap Alert Banner & 1-Click Remediation Trigger */}
          {node.isKnowledgeGap && (
            <div className={styles.gapBanner} role="alert">
              <Icon name="alert-triangle" size={20} className={styles.gapBannerIcon} />
              <div className={styles.gapBannerText} style={{ width: "100%" }}>
                <strong>Knowledge Gap Identified</strong>
                <div>
                  {node.gapDetails?.remediationReasons && node.gapDetails.remediationReasons.length > 0
                    ? node.gapDetails.remediationReasons.join(" • ")
                    : `Your current retention score is ${node.masteryScore}%. Focused active recall practice is recommended.`}
                </div>

                <div className={styles.remediateActionRow}>
                  <button
                    type="button"
                    className={`${styles.remediateBtn} ${showRecoveryDrill ? styles.remediateBtnActive : ""}`}
                    onClick={() => setShowRecoveryDrill((prev) => !prev)}
                    aria-expanded={showRecoveryDrill}
                  >
                    <Icon name="zap" size={16} />
                    {showRecoveryDrill ? "Hide Recovery Drill" : "1-Click Remediate Knowledge Gap (5-Min Drill)"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Interactive 5-Minute Recovery Drill View */}
          {showRecoveryDrill && recoveryDrill && (
            <div className={styles.recoveryDrillCard} role="region" aria-label="5-minute recovery drill">
              <div className={styles.drillHeader}>
                <div className={styles.drillTitleGroup}>
                  <Icon name="zap" size={18} style={{ color: "var(--accent)" }} />
                  <h3 className={styles.drillTitle}>5-Minute Recovery Drill</h3>
                </div>
                <span className={styles.drillBadge}>⚡ 5 Min Active Recall</span>
              </div>

              {/* High Yield Concept Takeaway */}
              <div className={styles.takeawayBox}>
                <div className={styles.takeawayTitle}>
                  <Icon name="file-text" size={14} />
                  Core Takeaway & Key Mechanism
                </div>
                <p style={{ margin: 0 }}>{recoveryDrill.summaryTakeaway}</p>
              </div>

              {/* Prerequisite Foundations Review Checklist */}
              {recoveryDrill.prerequisiteReview.length > 0 && (
                <div className={styles.prereqChecklist}>
                  <div className={styles.prereqChecklistTitle}>
                    Prerequisite Foundations to Solidify First:
                  </div>
                  {recoveryDrill.prerequisiteReview.map((prereq) => (
                    <button
                      key={prereq.id}
                      type="button"
                      className={styles.prereqItem}
                      onClick={() => onSelectRelated(prereq.id)}
                      title={`Review prerequisite ${prereq.label}`}
                    >
                      <span>{prereq.label}</span>
                      <span
                        style={{
                          fontWeight: 700,
                          color: prereq.masteryScore >= 70 ? "var(--success)" : "var(--danger)",
                        }}
                      >
                        {prereq.masteryScore}%
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Interactive Rapid-Fire Recall Questions */}
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
                <h4 style={{ margin: 0, fontSize: "var(--fs-xs)", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.5px" }}>
                  Active Recall Check ({answeredCount}/{totalQuestions})
                </h4>

                {recoveryDrill.highYieldQuestions.map((q) => {
                  const selectedIdx = selectedAnswers[q.id];
                  const hasAnswered = selectedIdx !== undefined;
                  const isCorrect = selectedIdx === q.correctIndex;

                  return (
                    <div key={q.id} className={styles.drillQuestionCard}>
                      <div className={styles.drillQuestionTitle}>
                        {q.id}. {q.question}
                      </div>

                      <div className={styles.drillOptionsList}>
                        {q.options.map((opt, optIdx) => {
                          let optClass = styles.drillOptionBtn;
                          if (hasAnswered) {
                            if (optIdx === q.correctIndex) {
                              optClass = `${styles.drillOptionBtn} ${styles.drillOptionCorrect}`;
                            } else if (selectedIdx === optIdx) {
                              optClass = `${styles.drillOptionBtn} ${styles.drillOptionIncorrect}`;
                            }
                          }

                          return (
                            <button
                              key={optIdx}
                              type="button"
                              className={optClass}
                              onClick={() => handleSelectOption(q.id, optIdx)}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>

                      {hasAnswered && (
                        <div
                          className={styles.explanationBox}
                          style={{
                            borderLeft: `3px solid ${isCorrect ? "var(--success)" : "var(--danger)"}`,
                          }}
                        >
                          <strong>{isCorrect ? "✓ Correct! " : "✕ Review Key Concept: "}</strong>
                          {q.explanation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Completion Banner */}
              {answeredCount === totalQuestions && (
                <div className={styles.drillScoreBanner}>
                  <span>Drill Completed: {correctCount} of {totalQuestions} Correct</span>
                  <span style={{ fontSize: 11 }}>⚡ Retention Pathway Reinforced</span>
                </div>
              )}
            </div>
          )}

          {/* Mastery Meter */}
          <div className={styles.masteryCard}>
            <div className={styles.masteryCardHeader}>
              <span className={styles.masteryLabel}>Concept Mastery</span>
              <span className={styles.masteryScoreValue} style={{ color: masteryColor }}>
                {node.masteryScore}%
              </span>
            </div>
            <div className={styles.masteryBar}>
              <div
                className={styles.masteryProgress}
                style={{
                  width: `${node.masteryScore}%`,
                  backgroundColor: masteryColor,
                }}
              />
            </div>
          </div>

          {/* Prerequisite & Dependency Hierarchy Section */}
          <div className={styles.hierarchySection}>
            <h3 className={styles.sectionTitle}>
              <Icon name="network" size={16} />
              Prerequisite & Dependency Hierarchy
            </h3>

            {/* Upstream Prerequisites (Must Learn First) */}
            <div className={styles.hierarchyGroup}>
              <span className={styles.hierarchyGroupLabel}>
                <Icon name="layers" size={14} />
                Prerequisites (Learn First)
              </span>
              {prereqNodes.length > 0 ? (
                <div className={styles.hierarchyList}>
                  {prereqNodes.map((prereq) => (
                    <button
                      key={prereq.id}
                      type="button"
                      className={styles.hierarchyCard}
                      onClick={() => onSelectRelated(prereq.id)}
                      title={`Jump to prerequisite ${prereq.label}`}
                      aria-label={`Jump to prerequisite ${prereq.label}`}
                    >
                      <div className={styles.hierarchyCardLeft}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            backgroundColor: prereq.folderColor,
                          }}
                        />
                        <span>{prereq.label}</span>
                      </div>
                      <span
                        className={styles.hierarchyBadge}
                        style={{
                          backgroundColor:
                            prereq.masteryScore >= 70
                              ? "rgba(34, 197, 94, 0.15)"
                              : "rgba(239, 68, 68, 0.15)",
                          color:
                            prereq.masteryScore >= 70 ? "var(--success)" : "var(--danger)",
                        }}
                      >
                        {prereq.masteryScore}% {prereq.masteryScore >= 70 ? "Mastered" : "Gap"}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>
                  No upstream prerequisites required (entry foundation).
                </p>
              )}
            </div>

            {/* Downstream Dependents (Unlocks Next) */}
            <div className={styles.hierarchyGroup}>
              <span className={styles.hierarchyGroupLabel}>
                <Icon name="network" size={14} />
                Unlocks Next (Advanced Topics)
              </span>
              {depNodes.length > 0 ? (
                <div className={styles.hierarchyList}>
                  {depNodes.map((dep) => (
                    <button
                      key={dep.id}
                      type="button"
                      className={styles.hierarchyCard}
                      onClick={() => onSelectRelated(dep.id)}
                      title={`Jump to dependent ${dep.label}`}
                      aria-label={`Jump to dependent ${dep.label}`}
                    >
                      <div className={styles.hierarchyCardLeft}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            backgroundColor: dep.folderColor,
                          }}
                        />
                        <span>{dep.label}</span>
                      </div>
                      <span
                        className={styles.hierarchyBadge}
                        style={{
                          backgroundColor: "var(--surface)",
                          color: "var(--text-muted)",
                        }}
                      >
                        {dep.masteryScore}%
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>
                  No downstream dependent topics detected.
                </p>
              )}
            </div>
          </div>

          {/* Study Content Coverage */}
          <div className={styles.coverageGrid}>
            <div className={styles.coverageItem}>
              <Icon name="file-text" size={20} className={styles.coverageIcon} />
              <span className={styles.coverageCount}>{node.notesCount}</span>
              <span className={styles.coverageLabel}>Note Mentions</span>
            </div>
            <div className={styles.coverageItem}>
              <Icon name="layers" size={20} className={styles.coverageIcon} />
              <span className={styles.coverageCount}>{node.flashcardsCount}</span>
              <span className={styles.coverageLabel}>Flashcards</span>
            </div>
            <div className={styles.coverageItem}>
              <Icon name="help-circle" size={20} className={styles.coverageIcon} />
              <span className={styles.coverageCount}>{node.quizzesCount}</span>
              <span className={styles.coverageLabel}>Quiz Questions</span>
            </div>
          </div>

          {/* Linked Notes Snippets */}
          {node.noteSnippets.length > 0 && (
            <div>
              <h3 className={styles.sectionTitle}>
                <Icon name="file-text" size={16} />
                Linked Notes Context
              </h3>
              <div className={styles.snippetsList} style={{ marginTop: 8 }}>
                {node.noteSnippets.map((snippet, idx) => (
                  <div key={idx} className={styles.snippetCard}>
                    {snippet}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Related Concepts */}
          {relatedList.length > 0 && (
            <div>
              <h3 className={styles.sectionTitle}>
                <Icon name="share-2" size={16} />
                Connected Concepts ({relatedList.length})
              </h3>
              <div className={styles.relatedPills} style={{ marginTop: 8 }}>
                {relatedList.map((rel) => (
                  <button
                    key={rel.id}
                    type="button"
                    className={styles.relatedPill}
                    onClick={() => onSelectRelated(rel.id)}
                    title={`Jump to ${rel.label}`}
                    aria-label={`Jump to ${rel.label}`}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        backgroundColor: rel.folderColor,
                      }}
                    />
                    {rel.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={styles.drawerFooter}>
          {practiceLink ? (
            <Link to={practiceLink} className={styles.practiceBtn} onClick={onClose}>
              <Icon name="play" size={18} />
              Practice Concept Now
            </Link>
          ) : (
            <button
              type="button"
              className={styles.practiceBtn}
              onClick={() => {
                openCreateModal({
                  outputs: { flashcards: true, quiz: false },
                  folderId: node.folderId,
                  materialId: node.materialId ?? undefined,
                  title: `Generate flashcards for ${node.label}`,
                });
                onClose();
              }}
            >
              <Icon name="plus" size={18} />
              Generate Practice Flashcards
            </button>
          )}

          <div className={styles.secondaryActionRow}>
            {node.materialId && (
              <Link
                to={`/notes/${node.materialId}`}
                className={styles.secondaryBtn}
                onClick={onClose}
              >
                <Icon name="file-text" size={14} />
                Open Note
              </Link>
            )}
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => {
                openCreateModal({
                  outputs: { flashcards: false, quiz: true },
                  folderId: node.folderId,
                  materialId: node.materialId ?? undefined,
                  title: `Quiz on ${node.label}`,
                });
                onClose();
              }}
            >
              <Icon name="brain" size={14} />
              Quiz on Topic
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

