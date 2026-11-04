import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { loadRelatedMaterials } from "../../api/grounding";
import { passageText } from "../../lib/grounding";
import { sourceSnippet } from "../../lib/sourceSnippet";
import styles from "./notesSidebar.module.css";

/* The student's other materials that cover this page's concepts — the same
   idea in a different chapter, handout or subject. Each says which concepts
   it shares, so the link can be judged before it is followed, and offers to
   ask the tutor how the two fit together. Renders nothing until there is a
   real match: an empty "related" box is noise. */
export function RelatedMaterials({
  materialId,
  onAsk,
}: {
  materialId: string;
  /** Puts a question in the page's tutor box without sending it, with the
   *  other material's matching passage attached so the tutor can see it. */
  onAsk: (question: string, source: { title: string; text: string }) => void;
}) {
  const { data: related = [] } = useQuery({
    queryKey: ["relatedMaterials", materialId],
    queryFn: () => loadRelatedMaterials(materialId),
    staleTime: 5 * 60_000,
  });
  if (related.length === 0) return null;

  return (
    <section className={styles.related} aria-labelledby="related-materials-label">
      <p id="related-materials-label" className={styles.marginLabel}>
        In your other materials
      </p>
      <ul className={styles.relatedList}>
        {related.map((r) => {
          const shown = r.concepts.slice(0, 3);
          const more = r.concepts.length - shown.length;
          return (
            <li key={r.materialId} className={styles.relatedItem}>
              <Link to={`/notes/${encodeURIComponent(r.materialId)}`} className={styles.relatedTitle}>
                {r.title}
              </Link>
              <span className={styles.relatedWhy}>
                Also covers {shown.join(", ")}
                {more > 0 ? ` and ${more} more` : ""}
              </span>
              <span className={styles.relatedQuote}>“{sourceSnippet(passageText(r.passage))}”</span>
              <button
                type="button"
                className={styles.relatedAsk}
                onClick={() =>
                  onAsk(
                    `How does what this page says about ${shown[0]} connect to the attached part of my notes in "${r.title}"? Point out anything the two say differently.`,
                    { title: r.title, text: passageText(r.passage) },
                  )
                }
                aria-label={`Ask the tutor how this page connects to ${r.title}`}
              >
                Ask how they connect
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
