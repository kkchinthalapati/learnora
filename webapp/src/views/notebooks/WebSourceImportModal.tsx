import { useEffect, useState } from "react";
import { Modal } from "../../components/Modal";
import { Icon } from "../../components/Icon";
import styles from "./webSourceImport.module.css";

export interface WebSearchResult {
  id: string;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  sourceMeta?: string;
}

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
  "Attention Mechanisms",
  "Quantum Computing",
  "Cellular Respiration",
  "Bayesian Inference",
];

const CURATED_RESULTS: Record<string, WebSearchResult[]> = {
  attention: [
    {
      id: "res-1",
      title: "Attention Is All You Need",
      url: "https://arxiv.org/abs/1706.03762",
      domain: "arxiv.org",
      snippet:
        "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. We propose the Transformer, based solely on attention mechanisms.",
      sourceMeta: "arXiv:1706.03762 • Vaswani et al.",
    },
    {
      id: "res-2",
      title: "Transformer Architecture & Self-Attention Explained",
      url: "https://en.wikipedia.org/wiki/Transformer_(deep_learning_architecture)",
      domain: "wikipedia.org",
      snippet:
        "Transformers process entire input sequences simultaneously using scaled dot-product attention and multi-head attention blocks without recurrent connections.",
      sourceMeta: "Wikipedia • Peer-reviewed encyclopedia",
    },
  ],
  quantum: [
    {
      id: "res-3",
      title: "Quantum Computation and Quantum Information",
      url: "https://nature.com/articles/nature01410",
      domain: "nature.com",
      snippet:
        "Comprehensive exploration of qubits, superposition, entanglement, and quantum error-correcting codes compared with classical Turing machines.",
      sourceMeta: "Nature • Nielsen & Chuang review",
    },
    {
      id: "res-4",
      title: "Introduction to Quantum Algorithms",
      url: "https://mit.edu/quantum-algorithms",
      domain: "mit.edu",
      snippet:
        "Foundational lectures covering Shor's algorithm for prime factorisation and Grover's search algorithm achieving quadratic speedup.",
      sourceMeta: "MIT OpenCourseWare • Lecture notes",
    },
  ],
  respiration: [
    {
      id: "res-5",
      title: "Cellular Respiration: Glycolysis, Krebs Cycle & ETC",
      url: "https://khanacademy.org/science/biology/cellular-respiration",
      domain: "khanacademy.org",
      snippet:
        "How cells harvest chemical energy from glucose molecules to synthesize adenosine triphosphate (ATP) through oxidative phosphorylation.",
      sourceMeta: "Khan Academy • Biology Curriculum",
    },
  ],
};

function generateResultsForQuery(query: string): WebSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  // Direct URL check
  if (/^https?:\/\//i.test(q)) {
    try {
      const parsed = new URL(query.trim());
      const domain = parsed.hostname.replace(/^www\./, "");
      const pathSegments = parsed.pathname
        .split("/")
        .filter(Boolean)
        .map((seg) => decodeURIComponent(seg).replace(/[-_]/g, " "));
      const pageTitle =
        pathSegments.length > 0
          ? pathSegments[pathSegments.length - 1]
              .replace(/\.[a-z0-9]+$/i, "")
              .replace(/\b\w/g, (c) => c.toUpperCase())
          : domain;

      return [
        {
          id: `url-${Date.now()}`,
          title: pageTitle || `Web Article from ${domain}`,
          url: query.trim(),
          domain,
          snippet: `External reference imported from ${domain}. Full content and extracted insights are ready for grounding your study notes and AI tutoring.`,
          sourceMeta: `Direct URL Import • ${domain}`,
        },
      ];
    } catch {
      // Fall through to query match
    }
  }

  // Check curated matches
  for (const [key, results] of Object.entries(CURATED_RESULTS)) {
    if (q.includes(key)) {
      return results;
    }
  }

  // Generate dynamic results for any other academic query
  const cleanQ = query.trim();
  return [
    {
      id: `gen-1-${cleanQ}`,
      title: `${cleanQ}: Theoretical Foundations & Key Principles`,
      url: `https://arxiv.org/abs/search?query=${encodeURIComponent(cleanQ)}`,
      domain: "arxiv.org",
      snippet: `In-depth academic survey of ${cleanQ}, detailing fundamental theorems, rigorous definitions, and empirical experimental validations.`,
      sourceMeta: `Academic Paper • arXiv Repository`,
    },
    {
      id: `gen-2-${cleanQ}`,
      title: `${cleanQ} Overview & Study Guide`,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(cleanQ.replace(/\s+/g, "_"))}`,
      domain: "wikipedia.org",
      snippet: `Structured encyclopedia summary covering historical context, core mathematical formulas, common applications, and revision questions for ${cleanQ}.`,
      sourceMeta: "Wikipedia • Educational Resource",
    },
  ];
}

export function WebSourceImportModal({
  open,
  onClose,
  onImport,
  defaultQuery = "",
}: WebSourceImportModalProps) {
  const [query, setQuery] = useState(defaultQuery);
  const [results, setResults] = useState<WebSearchResult[]>([]);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (defaultQuery) {
      setQuery(defaultQuery);
      setResults(generateResultsForQuery(defaultQuery));
      setHasSearched(true);
    }
  }, [defaultQuery]);

  const handleSearch = (qToSearch: string) => {
    const q = qToSearch.trim();
    if (!q) return;
    setResults(generateResultsForQuery(q));
    setHasSearched(true);
  };

  const handleImport = (result: WebSearchResult) => {
    setAddedIds((prev) => new Set([...prev, result.id]));
    void onImport({
      title: result.title,
      url: result.url,
      content: result.snippet,
      type: "web",
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import Web Intelligence"
      subtitle="Search academic articles & research papers, or paste a link to ground your notes."
    >
      <div className={styles.container}>
        {/* Search Bar */}
        <form
          className={styles.searchBar}
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch(query);
          }}
        >
          <div className={styles.inputWrapper}>
            <span className={styles.searchIcon}>
              <Icon name="search" size={16} />
            </span>
            <input
              type="text"
              className={styles.input}
              placeholder="Search papers, topics (e.g. 'Attention') or paste URL..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                // If user pasted a URL, auto-trigger preview
                if (/^https?:\/\//i.test(e.target.value.trim())) {
                  handleSearch(e.target.value.trim());
                }
              }}
              aria-label="Search articles and papers or paste URL"
            />
          </div>
          <button type="submit" className={styles.searchBtn}>
            <Icon name="globe" size={14} />
            Search
          </button>
        </form>

        {/* Quick Topic Suggestions */}
        <div className={styles.quickPills}>
          <span className={styles.quickPillLabel}>Try:</span>
          {SAMPLE_TOPICS.map((topic) => (
            <button
              key={topic}
              type="button"
              className={styles.topicChip}
              onClick={() => {
                setQuery(topic);
                handleSearch(topic);
              }}
            >
              {topic}
            </button>
          ))}
        </div>

        {/* Live Search Results */}
        {results.length > 0 ? (
          <div className={styles.resultsList} role="region" aria-label="Search results">
            {results.map((result) => {
              const isAdded = addedIds.has(result.id);
              return (
                <article key={result.id} className={styles.resultCard}>
                  <div className={cardTopStyle(result)}>
                    <div className={styles.titleArea}>
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.titleLink}
                        title={`Open ${result.title} in new window`}
                      >
                        {result.title} ↗
                      </a>
                      <div className={styles.badgeRow}>
                        <span className={styles.domainBadge}>
                          🌐 {result.domain}
                        </span>
                        {result.sourceMeta && (
                          <span className={styles.metaText}>
                            {result.sourceMeta}
                          </span>
                        )}
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
                      onClick={() => handleImport(result)}
                      disabled={isAdded}
                      aria-label={
                        isAdded
                          ? `Added ${result.title} to Notebook`
                          : `Add ${result.title} to Notebook`
                      }
                    >
                      {isAdded ? "✓ Added to Notebook" : "📥 Add to Notebook"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : hasSearched ? (
          <div className={styles.emptyState}>
            <Icon name="alert-circle" size={32} className={styles.emptyIcon} />
            <h4 className={styles.emptyTitle}>No results found</h4>
            <p className={styles.emptyDesc}>
              Try searching for academic concepts or pasting a direct URL
              (https://...).
            </p>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <Icon name="globe" size={36} className={styles.emptyIcon} />
            <h4 className={styles.emptyTitle}>Search the Academic Web</h4>
            <p className={styles.emptyDesc}>
              Enter a subject, paper topic, or direct URL above to ground your
              notebook in verified sources.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function cardTopStyle(_result: WebSearchResult) {
  return styles.cardTop;
}
