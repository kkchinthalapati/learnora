import { useRef } from "react";
import { Link } from "react-router";
import { Icon } from "../../components/Icon";
import type { ConceptNode } from "../../lib/conceptGraph";
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
}

export function ConceptNodeDrawer({
  node,
  allNodes,
  isOpen,
  onClose,
  onSelectRelated,
}: ConceptNodeDrawerProps) {
  const { openCreateModal } = useCreateModal();
  const drawerRef = useRef<HTMLElement>(null);

  /* The repo-standard overlay pair, as Modal.tsx uses it: joins the overlay
   * stack (ESC closes, focus moves in on open and returns to the trigger on
   * close), and traps Tab inside the drawer instead of letting it escape
   * into the graph behind a dialog marked aria-modal. */
  useOverlayBehavior({ ref: drawerRef, open: isOpen && !!node, onClose });
  useFocusTrap(drawerRef, isOpen && !!node);

  if (!node) return null;

  // Resolve related concept labels
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
  const relatedList = node.relatedConcepts
    .map((id) => nodeMap.get(id))
    .filter((n): n is ConceptNode => Boolean(n));

  // Determine mastery color
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
          {/* Knowledge Gap Alert Banner */}
          {node.isKnowledgeGap && (
            <div className={styles.gapBanner} role="alert">
              <Icon name="alert-triangle" size={20} className={styles.gapBannerIcon} />
              <div className={styles.gapBannerText}>
                <strong>Knowledge Gap Identified</strong>
                {node.masteryScore < 60
                  ? `Your current retention score for this concept is ${node.masteryScore}%. Focused active recall practice is recommended.`
                  : "This concept has unpracticed study notes or 0 quiz coverage. Test yourself to lock it into long-term memory."}
              </div>
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
            /* Scoped to this concept — the bare openCreateModal() this used
             * to call opened the generic panel with quiz off and nothing
             * preselected, doing neither of the things its label promised. */
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
