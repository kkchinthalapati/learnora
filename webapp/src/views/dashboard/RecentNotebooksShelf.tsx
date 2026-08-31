import { Link, useNavigate } from "react-router";
import { Icon } from "../../components/Icon";
import { useNotebooks } from "../../hooks/useNotebooks";
import styles from "./dashboard.module.css";
import { plural } from "../../lib/plural";

export function RecentNotebooksShelf() {
  const navigate = useNavigate();
  const { notebooks } = useNotebooks();

  if (!notebooks || notebooks.length === 0) return null;

  const topNotebooks = notebooks.slice(0, 3);

  return (
    <div className={styles.notebooksShelf}>
      <div className={styles.notebooksShelfHead}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
          <Icon name="book-open" size={17} style={{ color: "var(--accent)" }} />
          <span style={{ fontFamily: "var(--font-head)", fontSize: "var(--fs-base)", fontWeight: 700, color: "var(--text)" }}>
            Your Study Notebooks
          </span>
        </div>
        <Link to="/notebooks" className={styles.link} style={{ fontSize: "var(--fs-xs)" }}>
          View all notebooks ({notebooks.length}) →
        </Link>
      </div>

      <div className={styles.notebooksShelfGrid}>
        {topNotebooks.map((nb) => {
          const cheatSheetCount = nb.artifacts.filter((a) => a.type === "cheat_sheet").length;
          const feynmanCount = nb.artifacts.filter((a) => a.type === "feynman").length;

          return (
            <div
              key={nb.id}
              className={styles.shelfCard}
              onClick={() => void navigate(`/notebooks/${nb.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") void navigate(`/notebooks/${nb.id}`);
              }}
            >
              <div className={styles.shelfCardTop}>
                <span className={styles.shelfSubject}>
                  <span
                    className={styles.shelfDot}
                    style={{ background: nb.color }}
                  />
                  {nb.subject}
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  {plural(nb.sources.length, "source")}
                </span>
              </div>

              <h3 className={styles.shelfTitle}>{nb.title}</h3>

              <div className={styles.shelfFooter}>
                <div style={{ display: "flex", gap: "var(--s-2)" }}>
                  {cheatSheetCount > 0 && (
                    <span className={styles.shelfBadge} title="Cheat sheet available">
                      <Icon name="file-text" size={11} />
                      Cheat Sheet
                    </span>
                  )}
                  {feynmanCount > 0 && (
                    <span className={styles.shelfBadge} title="Has a plain-English breakdown">
                      <Icon name="brain" size={11} />
                      Explainer
                    </span>
                  )}
                </div>
                <span className={styles.shelfAction}>Open notebook</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
