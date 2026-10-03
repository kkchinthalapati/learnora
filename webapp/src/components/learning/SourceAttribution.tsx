import { Link } from "react-router";
import type { GroundingSource } from "../../api/grounding";
import styles from "./repair.module.css";

/* Where an explanation's material came from: the passages of the student's
   own notes it was given. Each links to the notes it came from, so "from your
   notes" can always be checked. */
export function SourceAttribution({ sources }: { sources: GroundingSource[] }) {
  if (sources.length === 0) return null;
  return (
    <aside className={styles.sources} aria-label="From your notes">
      <p className={styles.sourcesLabel}>From your notes</p>
      <ul>
        {sources.map((s, i) => (
          <li key={`${s.materialId}-${i}`}>
            <Link to={`/notes/${encodeURIComponent(s.materialId)}`}>{s.label}</Link>
            {s.excerpt ? <span className={styles.excerpt}> “{s.excerpt}”</span> : null}
          </li>
        ))}
      </ul>
    </aside>
  );
}
