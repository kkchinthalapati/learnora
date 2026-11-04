import { useQuery } from "@tanstack/react-query";
import { loadRelatedMaterials } from "../../api/grounding";
import { ListRow, ListRows } from "../../components/ListRow";
import { passageText } from "../../lib/grounding";
import styles from "./notesSidebar.module.css";

/* The student's other lessons that cover this page's concepts — the same
   idea in a different chapter, handout or subject. Each row says which
   concepts it shares, so the link can be judged before it is followed, and
   offers to ask the tutor how the two fit together. Renders nothing until
   there is a real match: an empty "related" box is noise. */
export function RelatedMaterials({
  materialId,
  onAsk,
}: {
  materialId: string;
  /** Puts a question in the page's tutor box without sending it, with the
   *  other lesson's matching passage attached so the tutor can see it. */
  onAsk: (question: string, source: { title: string; text: string }) => void;
}) {
  const { data: related = [] } = useQuery({
    queryKey: ["relatedMaterials", materialId],
    queryFn: () => loadRelatedMaterials(materialId),
    staleTime: 5 * 60_000,
  });
  if (related.length === 0) return null;

  return (
    <section className={styles.related} aria-labelledby="related-lessons-label">
      <p id="related-lessons-label" className={styles.marginLabel}>
        In your other lessons
      </p>
      <ListRows label="Other lessons that cover this page's ideas">
        {related.map((r) => {
          const shown = r.concepts.slice(0, 3);
          const more = r.concepts.length - shown.length;
          return (
            <ListRow
              key={r.materialId}
              title={r.title}
              icon="book-open"
              to={`/notes/${encodeURIComponent(r.materialId)}`}
              meta={`Also covers ${shown.join(", ")}${more > 0 ? ` and ${more} more` : ""}`}
              trailing={
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
                  Ask
                </button>
              }
            />
          );
        })}
      </ListRows>
    </section>
  );
}
