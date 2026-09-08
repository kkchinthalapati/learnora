import { useId, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Modal } from "../../components/Modal";
import { useNotebooks } from "../../hooks/useNotebooks";
import styles from "./notebooks.module.css";
import { plural } from "../../lib/plural";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { Skeleton } from "../../components/Skeleton";
import { useToast } from "../../context/toast";

const SUBJECT_COLORS = [
  "#4A90E2", // Blue (Maths)
  "#4AE283", // Green (Biology/Science)
  "#E2A84A", // Amber (History/Humanities)
  "#9B4AE2", // Purple (Languages/Lit)
  "#E24A4A", // Coral/Red (Physics/Chemistry)
];

export function NotebooksHubView() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const {
    notebooks,
    createNotebook,
    isLoading,
    isError,
    retryNotebooks,
    isCreating,
  } = useNotebooks();
  const titleId = useId();
  const subjectId = useId();
  const descriptionId = useId();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<string>("All");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // New notebook form state
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(SUBJECT_COLORS[0]);

  // Extract unique subjects
  const subjects = [
    "All",
    ...Array.from(new Set(notebooks.map((nb) => nb.subject))),
  ];

  const filteredNotebooks = notebooks.filter((nb) => {
    const matchesSearch =
      nb.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      nb.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (nb.description &&
        nb.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesSubject =
      selectedSubject === "All" || nb.subject === selectedSubject;
    return matchesSearch && matchesSubject;
  });

  /* Async now that the id is assigned by the database rather than by
     `nb-${Date.now()}`. The form closes only once the row exists, so a failed
     insert leaves the user's input in place to retry. */
  /* Search or a subject filter changes both the copy and the actions the
     empty state offers: "nothing matches" is a different problem from
     "nothing exists yet". */
  const isFiltered = Boolean(searchQuery) || selectedSubject !== "All";

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      const created = await createNotebook({
        title,
        subject: subject || "General Study",
        color,
        description,
      });
      setIsCreateOpen(false);
      setTitle("");
      setSubject("");
      setDescription("");
      void navigate(`/notebooks/${created.id}`);
    } catch (error) {
      showToast(
        `Could not create that notebook. ${error instanceof Error ? error.message : "Please try again."}`,
        { error: true },
      );
    }
  };

  return (
    <div className={styles.hubView}>
      <header className={styles.hubHeader}>
        <div className={styles.hubTitleGroup}>
          <span className={styles.hubEyebrow}>
            <Icon name="book-open" size={16} />
            Grounded in your own sources
          </span>
          <h1 className={styles.hubTitle}>Notebooks</h1>
          <p className={styles.hubSubtitle}>
            Bring several sources together, ask cited questions, and turn what
            you learn into revision material.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setIsCreateOpen(true)}
          disabled={isLoading || isError}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--s-2)",
          }}
        >
          <Icon name="plus" size={16} />
          New notebook
        </Button>
      </header>

      <div className={styles.hubGuide}>
        <strong>Notebooks connect sources.</strong>
        <span>
          Use the Library to store individual files, notes, decks and quizzes.
        </span>
        <Link to="/library" className={styles.hubGuideLink}>
          Open Library →
        </Link>
      </div>

      {!isLoading && !isError ? (
        <div className={styles.hubControls}>
          <div className={styles.searchBar}>
            <Icon
              name="search"
              size={16}
              style={{ color: "var(--text-muted)" }}
            />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search notebooks, topics, or subjects…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className={styles.subjectFilterList}>
            {subjects.map((subj) => (
              <button
                key={subj}
                type="button"
                className={`${styles.filterPill} ${selectedSubject === subj ? styles.filterPillActive : ""}`}
                onClick={() => setSelectedSubject(subj)}
              >
                {subj}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className={styles.loading} aria-busy="true">
          <Skeleton label="Loading notebooks" height={180} />
          <Skeleton height={180} />
        </div>
      ) : isError ? (
        <EmptyState
          icon="book-open"
          title="Notebooks could not be loaded"
          message="Your notebooks have not been changed. Check your connection and try again."
        >
          <Button variant="primary" onClick={() => void retryNotebooks()}>
            Try again
          </Button>
        </EmptyState>
      ) : (
        <div className={styles.notebooksGrid}>
          {filteredNotebooks.map((nb) => {
            const feynmanCount = nb.artifacts.filter(
              (a) => a.type === "feynman",
            ).length;
            const cheatSheetCount = nb.artifacts.filter(
              (a) => a.type === "cheat_sheet",
            ).length;
            const selectedSourcesCount = nb.sources.filter(
              (s) => s.selected,
            ).length;

            return (
              <div
                key={nb.id}
                className={styles.notebookCard}
                style={{ "--card-accent": nb.color } as React.CSSProperties}
                onClick={() => void navigate(`/notebooks/${nb.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    // Space on a role="button" activates it; without this it
                    // also scrolls the page a screen down underneath the
                    // navigation.
                    e.preventDefault();
                    void navigate(`/notebooks/${nb.id}`);
                  }
                }}
              >
                <div>
                  <div className={styles.cardTop}>
                    <Badge soft={false}>
                      <span
                        className={styles.cardSubjectDot}
                        style={{ background: nb.color }}
                      />
                      {nb.subject}
                    </Badge>
                    <span className={styles.cardSourceCount}>
                      {plural(nb.sources.length, "source")}
                    </span>
                  </div>

                  <h2 className={styles.cardTitle}>{nb.title}</h2>
                  {nb.description && (
                    <p className={styles.cardDescription}>{nb.description}</p>
                  )}
                </div>

                <div className={styles.cardMeta}>
                  <div className={styles.metaStats}>
                    {feynmanCount > 0 && (
                      <span
                        className={styles.metaStatItem}
                        title="Plain-English breakdowns made"
                      >
                        <Icon
                          name="brain"
                          size={13}
                          style={{ color: "var(--accent)" }}
                        />
                        {feynmanCount} explainer{feynmanCount === 1 ? "" : "s"}
                      </span>
                    )}
                    {cheatSheetCount > 0 && (
                      <span
                        className={styles.metaStatItem}
                        title="Revision cheat sheets generated"
                      >
                        <Icon
                          name="file-text"
                          size={13}
                          style={{ color: "var(--accent)" }}
                        />
                        {cheatSheetCount} Cheat Sheet
                        {cheatSheetCount === 1 ? "" : "s"}
                      </span>
                    )}
                    {feynmanCount === 0 && cheatSheetCount === 0 && (
                      <span className={styles.metaStatItem}>
                        <Icon
                          name="check"
                          size={13}
                          style={{ color: "var(--success)" }}
                        />
                        {plural(selectedSourcesCount, "grounded source")}
                      </span>
                    )}
                  </div>
                  <span>Open notebook</span>
                </div>
              </div>
            );
          })}

          {filteredNotebooks.length === 0 && (
            <EmptyState
              icon="book-open"
              title={
                isFiltered
                  ? "No matching notebooks found"
                  : "No study notebooks yet"
              }
              message={
                isFiltered
                  ? "Try adjusting your search query or subject filters to find what you are looking for."
                  : "Make your first workspace: pull in your notes, get things explained simply, and build a cheat sheet."
              }
            >
              {isFiltered && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedSubject("All");
                  }}
                >
                  Clear filters
                </Button>
              )}
              <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
                New notebook
              </Button>
            </EmptyState>
          )}
        </div>
      )}

      {isCreateOpen && (
        <Modal
          open={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          title="Create a new notebook"
        >
          <form
            onSubmit={(e) => void handleCreateSubmit(e)}
            className={styles.createForm}
          >
            <div>
              <label htmlFor={titleId} className={styles.fieldLabel}>
                Notebook title
              </label>
              <input
                id={titleId}
                type="text"
                required
                placeholder="e.g. Grade 9 Mathematics: Circle Theorems"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={styles.formControl}
              />
            </div>

            <div>
              <label htmlFor={subjectId} className={styles.fieldLabel}>
                Subject or topic
              </label>
              <input
                id={subjectId}
                type="text"
                placeholder="e.g. Mathematics, Biology, History"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className={styles.formControl}
              />
            </div>

            <div>
              <label htmlFor={descriptionId} className={styles.fieldLabel}>
                Description <span className={styles.optional}>(optional)</span>
              </label>
              <textarea
                id={descriptionId}
                placeholder="What will you study in this notebook?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={styles.formControl}
              />
            </div>

            <fieldset className={styles.colorField}>
              <legend className={styles.fieldLabel}>Colour accent</legend>
              <div className={styles.colorOptions}>
                {SUBJECT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`${styles.colorOption} ${color === c ? styles.colorOptionSelected : ""}`}
                    style={{ "--swatch-color": c } as React.CSSProperties}
                    aria-label={`Use ${c} as the notebook colour`}
                    aria-pressed={color === c}
                  />
                ))}
              </div>
            </fieldset>

            <div className={styles.formActions}>
              <Button type="button" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isCreating}>
                {isCreating ? "Creating…" : "Create notebook"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
