import { useEffect, useState } from "react";
import { Modal } from "../../components/Modal";
import { Icon } from "../../components/Icon";
import type { WebSearchResult } from "../../api/aiWebSearch";
import { useWebSearch } from "../../hooks/useWebSearch";
import styles from "./webSourceImport.module.css";

export interface WebSourceImportModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (source: {
    title: string;
    content: string;
    url: string;
    type: "web";
  }) => void | Promise<void>;
  defaultQuery?: string;
}

const SAMPLE_TOPICS = [
  "Attention mechanisms",
  "Quantum computing",
  "Cellular respiration",
  "Bayesian inference",
];

export function WebSourceImportModal({
  open,
  onClose,
  onImport,
  defaultQuery = "",
}: WebSourceImportModalProps) {
  const { query, setQuery, results, isLoading, error, search, importResult } =
    useWebSearch();
  const [hasSearched, setHasSearched] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !defaultQuery.trim()) return;
    setHasSearched(true);
    void search(defaultQuery);
  }, [defaultQuery, open, search]);

  const runSearch = async (value: string) => {
    if (!value.trim()) return;
    setHasSearched(true);
    await search(value);
  };

  const handleImport = async (result: WebSearchResult) => {
    setImportingId(result.id);
    setImportError(null);
    try {
      const source = await importResult(result);
      await onImport(source);
      setAddedIds((previous) => new Set(previous).add(result.id));
    } catch (cause) {
      setImportError(
        cause instanceof Error
          ? cause.message
          : "That page could not be imported.",
      );
    } finally {
      setImportingId(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Research the web"
      subtitle="Find a source, inspect it, then import its extracted text into this notebook."
    >
      <div className={styles.container}>
        <form
          className={styles.searchBar}
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch(query);
          }}
        >
          <div className={styles.inputWrapper}>
            <span className={styles.searchIcon}>
              <Icon name="search" size={16} />
            </span>
            <input
              type="text"
              className={styles.input}
              placeholder="Search a topic or question"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search the web for study sources"
              maxLength={400}
            />
          </div>
          <button
            type="submit"
            className={styles.searchBtn}
            disabled={isLoading || !query.trim()}
          >
            <Icon name="globe" size={14} />
            {isLoading ? "Searching…" : "Search"}
          </button>
        </form>

        <div className={styles.quickPills}>
          <span className={styles.quickPillLabel}>Try:</span>
          {SAMPLE_TOPICS.map((topic) => (
            <button
              key={topic}
              type="button"
              className={styles.topicChip}
              disabled={isLoading}
              onClick={() => void runSearch(topic)}
            >
              {topic}
            </button>
          ))}
        </div>

        {error || importError ? (
          <div className={styles.errorState} role="alert">
            <Icon name="alert-circle" size={20} />
            <span>{error || importError}</span>
          </div>
        ) : null}

        {results.length > 0 ? (
          <div
            className={styles.resultsList}
            role="region"
            aria-label="Search results"
          >
            {results.map((result) => {
              const isAdded = addedIds.has(result.id);
              const isImporting = importingId === result.id;
              return (
                <article key={result.id} className={styles.resultCard}>
                  <div className={styles.cardTop}>
                    <div className={styles.titleArea}>
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.titleLink}
                      >
                        {result.title} ↗
                      </a>
                      <div className={styles.badgeRow}>
                        <span className={styles.domainBadge}>
                          {result.domain}
                        </span>
                        {typeof result.score === "number" ? (
                          <span className={styles.metaText}>
                            {Math.round(result.score * 100)}% query match
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <p className={styles.snippet}>{result.snippet}</p>
                  <div className={styles.cardBottom}>
                    <button
                      type="button"
                      className={`${styles.addBtn}${
                        isAdded ? ` ${styles.addBtnSuccess}` : ""
                      }`}
                      onClick={() => void handleImport(result)}
                      disabled={isAdded || importingId !== null}
                    >
                      {isAdded
                        ? "Added to notebook"
                        : isImporting
                          ? "Reading source…"
                          : "Import full source"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : hasSearched && !isLoading && !error ? (
          <div className={styles.emptyState}>
            <Icon name="search" size={32} className={styles.emptyIcon} />
            <h4 className={styles.emptyTitle}>No useful results found</h4>
            <p className={styles.emptyDesc}>
              Try a more specific topic or question.
            </p>
          </div>
        ) : !isLoading ? (
          <div className={styles.emptyState}>
            <Icon name="globe" size={36} className={styles.emptyIcon} />
            <h4 className={styles.emptyTitle}>Find material worth studying</h4>
            <p className={styles.emptyDesc}>
              Search results come from the live web. Learnora reads the page
              only when you choose to import it.
            </p>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
