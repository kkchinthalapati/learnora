import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Link } from "react-router";
import { Icon } from "../../components/Icon";
import { useAllDecks } from "../../hooks/useDecks";
import { useFolders } from "../../hooks/useFolders";
import { useMaterials } from "../../hooks/useMaterials";
import { useQuizzes } from "../../hooks/useQuizzes";
import type { FlashcardDeck, Folder, Material, Quiz } from "../../api/types";
import { formatCreatedLong, formatCreatedShort } from "./libraryMeta";
import styles from "./LibrarySearch.module.css";

type SearchResultKind = "folders" | "materials" | "flashcards" | "quizzes";

interface SearchResult {
  id: string;
  kind: SearchResultKind;
  title: string;
  metadata: string;
  href: string;
  icon: "folder" | "file-text" | "layers" | "help-circle";
  actions?: Array<{ label: string; href: string }>;
}

interface SearchGroup {
  kind: SearchResultKind;
  label: string;
  results: SearchResult[];
}

const GROUP_LABELS: Record<SearchResultKind, string> = {
  folders: "Folders",
  materials: "Materials",
  flashcards: "Flashcard decks",
  quizzes: "Quizzes",
};

const GROUP_ICONS: Record<SearchResultKind, SearchResult["icon"]> = {
  folders: "folder",
  materials: "file-text",
  flashcards: "layers",
  quizzes: "help-circle",
};

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function folderName(folderId: string | null, foldersById: Map<string, Folder>) {
  return folderId ? foldersById.get(folderId)?.name : undefined;
}

function questionCount(quiz: Quiz): number {
  return Array.isArray(quiz.questions_json) ? quiz.questions_json.length : 0;
}

function matches(query: string, ...values: Array<string | undefined>): boolean {
  return values.some((value) => value && normalized(value).includes(query));
}

function rankResults(
  searchCandidates: SearchResult[],
  query: string,
): SearchResult[] {
  return searchCandidates.sort((a, b) => {
    const aStarts = normalized(a.title).startsWith(query);
    const bStarts = normalized(b.title).startsWith(query);
    if (aStarts !== bStarts) return aStarts ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

function buildGroups(
  query: string,
  folders: Folder[],
  materials: Material[],
  decks: FlashcardDeck[],
  quizzes: Quiz[],
): SearchGroup[] {
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  const materialCounts = new Map<string, number>();
  for (const material of materials) {
    if (material.folder_id) {
      materialCounts.set(
        material.folder_id,
        (materialCounts.get(material.folder_id) ?? 0) + 1,
      );
    }
  }

  const folderResults = folders
    .filter((folder) => matches(query, folder.name))
    .map((folder): SearchResult => ({
      id: folder.id,
      kind: "folders",
      title: folder.name,
      metadata: `${materialCounts.get(folder.id) ?? 0} material${
        (materialCounts.get(folder.id) ?? 0) === 1 ? "" : "s"
      }${formatCreatedLong(folder.created_at) ? ` · Created ${formatCreatedLong(folder.created_at)}` : ""}`,
      href: `/folders/${folder.id}`,
      icon: GROUP_ICONS.folders,
    }));

  const materialResults = materials
    .filter((material) =>
      matches(
        query,
        material.title,
        material.type,
        folderName(material.folder_id, foldersById),
      ),
    )
    .map((material): SearchResult => {
      const parent = folderName(material.folder_id, foldersById);
      return {
        id: material.id,
        kind: "materials",
        title: material.title,
        metadata: `${material.type.toUpperCase()}${parent ? ` · ${parent}` : ""}${
          formatCreatedShort(material.created_at)
            ? ` · Added ${formatCreatedShort(material.created_at)}`
            : ""
        }`,
        href: `/notes/${material.id}`,
        icon: GROUP_ICONS.materials,
      };
    });

  const deckResults = decks
    .filter((deck) =>
      matches(query, deck.title, folderName(deck.folder_id, foldersById)),
    )
    .map((deck): SearchResult => {
      const parent = folderName(deck.folder_id, foldersById);
      return {
        id: deck.id,
        kind: "flashcards",
        title: deck.title,
        metadata: `${parent ? `${parent} · ` : ""}Created ${formatCreatedShort(deck.created_at)}`,
        href: `/review/${deck.id}`,
        icon: GROUP_ICONS.flashcards,
      };
    });

  const quizResults = quizzes
    .filter((quiz) =>
      matches(query, quiz.title, folderName(quiz.folder_id, foldersById)),
    )
    .map((quiz): SearchResult => {
      const parent = folderName(quiz.folder_id, foldersById);
      const questions = questionCount(quiz);
      return {
        id: quiz.id,
        kind: "quizzes",
        title: quiz.title,
        metadata: `${questions} question${questions === 1 ? "" : "s"}${
          parent ? ` · ${parent}` : ""
        } · Created ${formatCreatedShort(quiz.created_at)}`,
        href: `/quiz/${quiz.id}`,
        icon: GROUP_ICONS.quizzes,
        actions: [
          { label: "Review", href: `/quiz/${quiz.id}/review` },
          { label: "Mock Exam", href: `/quiz/${quiz.id}/mock-exam` },
        ],
      };
    });

  const groups: SearchGroup[] = [
    {
      kind: "folders",
      label: GROUP_LABELS.folders,
      results: rankResults(folderResults, query),
    },
    {
      kind: "materials",
      label: GROUP_LABELS.materials,
      results: rankResults(materialResults, query),
    },
    {
      kind: "flashcards",
      label: GROUP_LABELS.flashcards,
      results: rankResults(deckResults, query),
    },
    {
      kind: "quizzes",
      label: GROUP_LABELS.quizzes,
      results: rankResults(quizResults, query),
    },
  ];
  return groups.filter((group) => group.results.length > 0);
}

function SearchResults({ query }: { query: string }) {
  const foldersQuery = useFolders();
  const materialsQuery = useMaterials();
  const decksQuery = useAllDecks();
  const quizzesQuery = useQuizzes();
  const resultRefs = useRef<Array<HTMLAnchorElement | null>>([]);

  const isPending =
    foldersQuery.isPending ||
    materialsQuery.isPending ||
    decksQuery.isPending ||
    quizzesQuery.isPending;
  const failedSections = [
    foldersQuery.isError ? "folders" : null,
    materialsQuery.isError ? "materials" : null,
    decksQuery.isError ? "flashcard decks" : null,
    quizzesQuery.isError ? "quizzes" : null,
  ].filter((section): section is string => Boolean(section));
  const allFailed = failedSections.length === 4;

  const groups = useMemo(
    () =>
      buildGroups(
        normalized(query),
        foldersQuery.data ?? [],
        materialsQuery.data ?? [],
        decksQuery.data ?? [],
        quizzesQuery.data ?? [],
      ),
    [
      query,
      foldersQuery.data,
      materialsQuery.data,
      decksQuery.data,
      quizzesQuery.data,
    ],
  );

  const retry = () => {
    void Promise.all([
      foldersQuery.refetch(),
      materialsQuery.refetch(),
      decksQuery.refetch(),
      quizzesQuery.refetch(),
    ]);
  };

  function onResultKeyDown(
    event: KeyboardEvent<HTMLAnchorElement>,
    index: number,
  ) {
    let next: number | null = null;
    if (event.key === "ArrowDown")
      next = Math.min(index + 1, resultRefs.current.length - 1);
    if (event.key === "ArrowUp") next = Math.max(index - 1, 0);
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = resultRefs.current.length - 1;
    if (next === null || next === index) return;
    event.preventDefault();
    resultRefs.current[next]?.focus();
  }

  if (isPending) {
    return (
      <div className={styles.state} aria-live="polite" aria-busy="true">
        <span className={styles.spinner} aria-hidden="true" />
        <span>Searching your library…</span>
      </div>
    );
  }

  if (allFailed) {
    return (
      <div className={styles.state} role="alert">
        <strong>We couldn’t search your library.</strong>
        <span>Check your connection and try again.</span>
        <button type="button" className={styles.retry} onClick={retry}>
          Retry search
        </button>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className={styles.state} aria-live="polite">
        <Icon name="compass" size={22} />
        <strong>No matches for “{query.trim()}”.</strong>
        <span>
          {failedSections.length
            ? "Some results could not load (" +
              failedSections.join(", ") +
              "). Retry or search again."
            : "Try a folder, material, deck, or quiz title."}
        </span>
        {failedSections.length ? (
          <button type="button" className={styles.retry} onClick={retry}>
            Retry missing results
          </button>
        ) : null}
      </div>
    );
  }

  let resultIndex = 0;
  return (
    <div className={styles.results} aria-live="polite">
      {failedSections.length ? (
        <div className={styles.partialError} role="status">
          Showing available matches. Could not load {failedSections.join(", ")}.{" "}
          <button type="button" onClick={retry}>
            Retry
          </button>
        </div>
      ) : null}
      <p className={styles.resultSummary}>
        {groups.reduce((total, group) => total + group.results.length, 0)}{" "}
        result
        {groups.reduce((total, group) => total + group.results.length, 0) === 1
          ? ""
          : "s"}
        <span> · Use ↑/↓ to move, Enter to open</span>
      </p>
      {groups.map((group) => (
        <section
          key={group.kind}
          className={styles.group}
          aria-labelledby={`library-search-${group.kind}`}
        >
          <h2 id={`library-search-${group.kind}`} className={styles.groupTitle}>
            <Icon name={GROUP_ICONS[group.kind]} size={16} />
            {group.label}
            <span className={styles.groupCount}>{group.results.length}</span>
          </h2>
          <ul className={styles.resultList}>
            {group.results.map((searchResult) => {
              const index = resultIndex++;
              return (
                <li
                  key={`${searchResult.kind}-${searchResult.id}`}
                  className={styles.resultItem}
                >
                  <Link
                    ref={(element) => {
                      resultRefs.current[index] = element;
                    }}
                    to={searchResult.href}
                    className={styles.resultLink}
                    data-search-result
                    onKeyDown={(event) => onResultKeyDown(event, index)}
                  >
                    <span className={styles.resultIcon} aria-hidden="true">
                      <Icon name={searchResult.icon} size={18} />
                    </span>
                    <span className={styles.resultBody}>
                      <span className={styles.resultTitle}>
                        {searchResult.title}
                      </span>
                      <span className={styles.resultMetadata}>
                        {searchResult.metadata}
                      </span>
                    </span>
                    <span className={styles.openHint}>Open</span>
                  </Link>
                  {searchResult.actions ? (
                    <div
                      className={styles.resultActions}
                      aria-label={`${searchResult.title} actions`}
                    >
                      {searchResult.actions.map((action) => (
                        <Link
                          key={action.href}
                          to={action.href}
                          className={styles.actionLink}
                        >
                          {action.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

// Mounting results only after input keeps deck and quiz requests lazy.
export function LibrarySearch({
  onActiveChange,
  action,
}: {
  onActiveChange?: (active: boolean) => void;
  action?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const hasQuery = query.trim().length > 0;
  const searchRef = useRef<HTMLElement>(null);

  useEffect(() => {
    onActiveChange?.(hasQuery);
    return () => onActiveChange?.(false);
  }, [hasQuery, onActiveChange]);

  return (
    <section
      ref={searchRef}
      className={styles.search}
      aria-label="Library tools"
    >
      <div className={styles.toolbar}>
        <div className={styles.inputWrap}>
          <Icon name="compass" size={19} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.preventDefault();
                setQuery("");
              } else if (event.key === "ArrowDown" && hasQuery) {
                const firstResult =
                  searchRef.current?.querySelector<HTMLAnchorElement>(
                    "[data-search-result]",
                  );
                if (firstResult) {
                  event.preventDefault();
                  firstResult.focus();
                }
              }
            }}
            placeholder="Search folders, materials, decks, and quizzes"
            aria-label="Search your library"
            aria-controls="library-search-results"
            autoComplete="off"
          />
          {query ? (
            <button
              type="button"
              className={styles.clearButton}
              aria-label="Clear library search"
              onClick={() => setQuery("")}
            >
              Clear
            </button>
          ) : null}
        </div>
        {action ? <div className={styles.toolbarAction}>{action}</div> : null}
      </div>
      <div id="library-search-results">
        {hasQuery ? <SearchResults query={query} /> : null}
      </div>
    </section>
  );
}
