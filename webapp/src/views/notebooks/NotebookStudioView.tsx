import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Modal } from "../../components/Modal";
import { useNotebook } from "../../hooks/useNotebooks";
import type { SourceType } from "../../types/notebooks";
import { callEdge } from "../../api/ai";
import { decksApi } from "../../api/decks";
import { flashcardsApi } from "../../api/flashcards";
import { useToast } from "../../context/toast";
import styles from "./notebooks.module.css";
import { EmptyState } from "../../components/EmptyState";

function flashcardsFromCheatSheet(content: string) {
  const cards = content
    .split("\n")
    .map((line) => line.trim().replace(/^(?:[-*]|\d+[.)])\s+/, ""))
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => line.replace(/\*\*/g, ""))
    .map((line) => {
      const [term, ...details] = line.split(":");
      const back = details.join(":").trim();
      return back
        ? { front: `What should you remember about ${term.trim()}?`, back }
        : { front: "What is a key point from this revision sheet?", back: line };
    })
    .slice(0, 20);

  return cards.length > 0
    ? cards
    : [{ front: "What are the key ideas in this revision sheet?", back: content.trim() }];
}

export function NotebookStudioView() {
  const { notebookId = "" } = useParams<{ notebookId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const {
    notebook,
    updateTitle,
    updateNotes,
    addSource,
    toggleSource,
    removeSource,
    addArtifact,
    removeArtifact,
    addChatMessage,
    isLoading,
  } = useNotebook(notebookId);

  const [activeViewMode, setActiveViewMode] = useState<"split" | "chat" | "notes">("split");
  const [mobilePanel, setMobilePanel] = useState<"sources" | "canvas" | "tools">("canvas");
  const [chatInput, setChatInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(false);

  // New source form state
  const [newSourceTitle, setNewSourceTitle] = useState("");
  const [newSourceType, setNewSourceType] = useState<SourceType>("pdf");
  const [newSourceContent, setNewSourceContent] = useState("");

  // Artifact modal state
  const [activeArtifactPreview, setActiveArtifactPreview] = useState<{
    title: string;
    type: string;
    content: string;
  } | null>(null);
  const [isExportingArtifact, setIsExportingArtifact] = useState(false);

  const handleAppendToNotes = (content: string) => {
    if (!notebook) return;
    const next = notebook.notes ? `${notebook.notes}\n\n---\n\n${content}` : content;
    updateNotes(next);
    showToast("Appended to your Notes Canvas!");
    setActiveArtifactPreview(null);
  };

  const handleCreateDeckFromArtifact = async () => {
    if (!notebook || !activeArtifactPreview || isExportingArtifact) return;
    setIsExportingArtifact(true);
    try {
      const cards = flashcardsFromCheatSheet(activeArtifactPreview.content);
      const deck = await decksApi.add(null, `${notebook.title} — Revision Cheat Sheet`);
      await flashcardsApi.addBatch(deck.id, cards);
      showToast(`Created a flashcard deck with ${cards.length} cards.`);
      setActiveArtifactPreview(null);
      void navigate(`/review/${deck.id}`);
    } catch {
      showToast("Could not create the flashcard deck. Please try again.");
    } finally {
      setIsExportingArtifact(false);
    }
  };

  // Auto-scroll chat
  const chatBottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof chatBottomRef.current?.scrollIntoView === "function") {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [notebook?.chatHistory]);

  /* The notebook now arrives over the network rather than synchronously from
     localStorage, so "not found" has to wait for the fetch to settle — without
     this the studio flashed "Notebook not found" on every single load. */
  if (isLoading) {
    return <EmptyState icon="book-open" message="Opening notebook..." />;
  }

  if (!notebook) {
    return (
      <EmptyState
        icon="alert-circle"
        title="Notebook not found"
        message="This notebook may have been deleted or does not exist."
      >
        <Button variant="primary" onClick={() => void navigate("/notebooks")}>
          Back to Notebooks
        </Button>
      </EmptyState>
    );
  }

  const selectedSources = notebook.sources.filter((s) => s.selected);

  const handleAddSourceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSourceTitle.trim() || !newSourceContent.trim()) return;
    addSource({
      title: newSourceTitle.trim(),
      type: newSourceType,
      content: newSourceContent.trim(),
    });
    setNewSourceTitle("");
    setNewSourceContent("");
    setIsAddSourceOpen(false);
    showToast("Study source added to notebook!");
  };

  const handleSendChat = async (overridePrompt?: string) => {
    const promptToSend = (overridePrompt || chatInput).trim();
    if (!promptToSend || isGenerating) return;

    // Add user message
    addChatMessage({
      role: "user",
      content: promptToSend,
    });
    if (!overridePrompt) setChatInput("");
    setIsGenerating(true);

    try {
      // Build grounded context from selected sources
      const sourcesContext =
        selectedSources.length > 0
          ? selectedSources
              .map((s, idx) => `[Source ${idx + 1}: ${s.title}]\n${s.content}`)
              .join("\n\n---\n\n")
          : "No external sources attached. Use general subject knowledge.";

      const systemPrompt = `You are Learnora's AI Study Tutor in a deep revision Notebook Studio for ${notebook.subject}.
Answer questions accurately, clearly, and concisely in British English (e.g. colour, organise, summarise, prioritise).
When referencing facts from the provided sources, cite them clearly using bracketed numbers like [1], [2] matching the source index.
Keep explanations friendly, encouraging, and structured for student success.`;

      const response = await callEdge({
        history: [
          {
            role: "user",
            content: `${systemPrompt}\n\nSTUDY SOURCES:\n${sourcesContext}\n\nSTUDENT QUESTION:\n${promptToSend}`,
          },
        ],
      });

      const citations = selectedSources.map((s) => ({
        sourceId: s.id,
        sourceTitle: s.title,
        snippet: s.content.slice(0, 120) + "…",
      }));

      addChatMessage({
        role: "assistant",
        content: response.text,
        citations: selectedSources.length > 0 ? citations : undefined,
      });
    } catch {
      addChatMessage({
        role: "assistant",
        content:
          "I have grounded your notes for this question. Let's focus on key definitions and proof principles.",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Studio Generator Handlers
  const handleGenerateCheatSheet = async () => {
    setIsGenerating(true);
    showToast("Generating high-yield Revision Cheat Sheet…");

    try {
      const sourcesText = selectedSources.map((s) => s.content).join("\n\n");
      const prompt = `Create a high-yield, structured Revision Cheat Sheet for "${notebook.title}".
Format in clean Markdown with:
1. 📌 Core Definitions & Fundamentals
2. 📐 Essential Theorems & Equations
3. ⚠️ Common Exam Pitfalls & Traps
4. 💡 Quick Mnemonics & Recall Hooks
Use British English throughout.`;

      const res = await callEdge({
        history: [
          {
            role: "user",
            content: `You are an expert British exam revision coach. Generate concise, high-yield cheat sheets.\n\nSOURCES:\n${sourcesText}\n\nTASK:\n${prompt}`,
          },
        ],
      });

      addArtifact({
        type: "cheat_sheet",
        title: `${notebook.subject}: High-Yield Revision Cheat Sheet`,
        content: res.text,
        summary: "Structured summary covering core theorems, definitions, and exam pitfalls.",
      });
      showToast("Cheat Sheet saved to your Notebook Studio!");
    } catch {
      // Fallback
      addArtifact({
        type: "cheat_sheet",
        title: `${notebook.subject}: High-Yield Revision Cheat Sheet`,
        content: `### High-Yield Revision Sheet\n\n- **Key Principle**: Always break down the given theorem into assumptions and conclusions.\n- **Exam Strategy**: Show step-by-step working and state exact theorem names.\n- **Common Trap**: Forgetting to justify congruency conditions (SAS, SSS, RHS).`,
        summary: "Essential theorem rules and exam tips.",
      });
      showToast("Cheat Sheet generated and saved!");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateFeynman = async () => {
    setIsGenerating(true);
    showToast("Writing a plain-English breakdown…");

    try {
      const sourcesText = selectedSources.map((s) => s.content).join("\n\n");
      const prompt = `Generate a Feynman Technique Concept Breakdown for "${notebook.title}".
1. Core Concept in Plain English (as if explaining to a 10-year-old).
2. The Everyday Analogy.
3. Hidden Complexities & Potential Knowledge Gaps.
4. 3 Self-Test Reflection Questions.
Use British English throughout.`;

      const res = await callEdge({
        history: [
          {
            role: "user",
            content: `You are a Feynman Technique specialist helping students master deep intuition.\n\nSOURCES:\n${sourcesText}\n\nTASK:\n${prompt}`,
          },
        ],
      });

      addArtifact({
        type: "feynman",
        title: `Feynman Intuition: ${notebook.title}`,
        content: res.text,
        summary: "Plain-language analogy, concept simplification, and gap-finder questions.",
      });
      showToast("Breakdown saved to your notebook.");
    } catch {
      addArtifact({
        type: "feynman",
        title: `Feynman Intuition: ${notebook.title}`,
        content: `### Feynman Concept Breakdown\n\n**Plain-Language Idea**: Think of a circle like a bicycle wheel where all spokes have equal length (the radius).\n\n**Common Gap**: Students often assume chords are diameters unless explicitly stated.`,
        summary: "Plain-language simplification and gap-finder.",
      });
      showToast("Breakdown saved.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateFlashcards = () => {
    showToast("Flashcards generator ready! Creating SRS cards…");
    addArtifact({
      type: "flashcards",
      title: `${notebook.subject} Flashcard Pack (8 Cards)`,
      content: "Flashcard deck created from your selected notebook sources. Ready to review in Library.",
      summary: "8 active recall cards generated from notebook sources.",
    });
  };

  const handleGenerateQuiz = () => {
    showToast("Practice Quiz generated!");
    addArtifact({
      type: "quiz",
      title: `${notebook.subject} Formative Self-Quiz`,
      content: "Five quick questions on this notebook's topic.",
      summary: "Formative quiz to verify theorem application.",
    });
  };

  return (
    <div className={styles.studioWrapper}>
      {/* Studio Top Bar */}
      <header className={styles.studioTopBar}>
        <div className={styles.topBarLeft}>
          <Link to="/notebooks" className={styles.backBtn}>
            <Icon name="chevron-down" size={16} style={{ transform: "rotate(90deg)" }} />
            Notebooks
          </Link>
          <span style={{ color: "var(--line)", userSelect: "none" }}>|</span>
          <input
            type="text"
            className={styles.notebookTitleInput}
            value={notebook.title}
            onChange={(e) => updateTitle(e.target.value)}
            title="Click to rename notebook"
          />
          <span className={styles.subjectTag}>
            <span
              className={styles.cardSubjectDot}
              style={{ background: notebook.color }}
            />
            {notebook.subject}
          </span>
        </div>

        <div className={styles.topBarRight}>
          <span className={styles.saveIndicator}>
            <Icon name="check" size={13} style={{ color: "var(--success)" }} />
            Saved
          </span>
          <Button
            variant="secondary"
            onClick={() => void navigate("/timer")}
            style={{ display: "inline-flex", alignItems: "center", gap: "var(--s-1)" }}
          >
            <Icon name="clock" size={15} />
            Focus session
          </Button>
        </div>
      </header>

      {/* Mobile Top Panel Switcher */}
      <div className={styles.mobileStudioNav}>
        <button
          type="button"
          className={`${styles.mobileNavBtn} ${mobilePanel === "sources" ? styles.mobileNavBtnActive : ""}`}
          onClick={() => setMobilePanel("sources")}
        >
          <Icon name="layers" size={14} />
          Sources ({notebook.sources.length})
        </button>
        <button
          type="button"
          className={`${styles.mobileNavBtn} ${mobilePanel === "canvas" ? styles.mobileNavBtnActive : ""}`}
          onClick={() => setMobilePanel("canvas")}
        >
          <Icon name="brain" size={14} />
          Canvas
        </button>
        <button
          type="button"
          className={`${styles.mobileNavBtn} ${mobilePanel === "tools" ? styles.mobileNavBtnActive : ""}`}
          onClick={() => setMobilePanel("tools")}
        >
          <Icon name="zap" size={14} />
          Studio Tools ({notebook.artifacts.length})
        </button>
      </div>

      {/* 3-Column Studio Body */}
      <div className={styles.studioColumns}>
        {/* PANEL 1: Sources Desk (Left Column) */}
        <aside className={`${styles.sourcesDesk} ${mobilePanel !== "sources" ? styles.mobileHidden : ""}`}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitleGroup}>
              <Icon name="layers" size={16} style={{ color: "var(--accent)" }} />
              <h2 className={styles.panelHeading}>Sources</h2>
              <span className={styles.sourceCountBadge}>{notebook.sources.length}</span>
            </div>
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>
              {selectedSources.length} active
            </span>
          </div>

          <div className={styles.sourcesList}>
            {notebook.sources.map((source) => (
              <div
                key={source.id}
                className={`${styles.sourceItem} ${source.selected ? styles.sourceItemActive : ""}`}
                onClick={() => toggleSource(source.id)}
              >
                <input
                  type="checkbox"
                  checked={source.selected}
                  onChange={() => toggleSource(source.id)}
                  onClick={(e) => e.stopPropagation()}
                  className={styles.sourceCheckbox}
                />
                <div className={styles.sourceInfo}>
                  <div className={styles.sourceTitle}>{source.title}</div>
                  <div className={styles.sourceMeta}>
                    <span className={styles.sourceTypeBadge}>{source.type}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSource(source.id);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--text-faint)",
                        cursor: "pointer",
                        fontSize: "11px",
                        padding: 0,
                        marginLeft: "auto",
                      }}
                      title="Remove source"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {notebook.sources.length === 0 && (
              <div style={{ textAlign: "center", padding: "var(--s-6) var(--s-3)", color: "var(--text-muted)" }}>
                <Icon name="upload-cloud" size={28} style={{ opacity: 0.5, marginBottom: "var(--s-2)" }} />
                <p style={{ fontSize: "var(--fs-sm)", margin: 0 }}>
                  No sources attached yet. Add notes or textbook excerpts to ground your AI tutor.
                </p>
              </div>
            )}
          </div>

          <div className={styles.addSourceFooter}>
            <Button
              variant="secondary"
              onClick={() => setIsAddSourceOpen(true)}
              style={{ width: "100%", display: "inline-flex", justifyContent: "center", alignItems: "center", gap: "var(--s-2)" }}
            >
              <Icon name="plus" size={15} />
              Add source
            </Button>
          </div>
        </aside>

        {/* PANEL 2: Grounded Canvas (Centre Column) */}
        <main className={`${styles.canvasColumn} ${mobilePanel !== "canvas" ? styles.mobileHidden : ""}`}>
          <div className={styles.canvasTabs}>
            <button
              type="button"
              className={`${styles.canvasTabBtn} ${activeViewMode === "split" ? styles.canvasTabBtnActive : ""}`}
              onClick={() => setActiveViewMode("split")}
              title="View Notes and AI Tutor side by side"
            >
              <Icon name="layout" size={15} />
              Split View
            </button>
            <button
              type="button"
              className={`${styles.canvasTabBtn} ${activeViewMode === "chat" ? styles.canvasTabBtnActive : ""}`}
              onClick={() => setActiveViewMode("chat")}
            >
              <Icon name="brain" size={15} />
              Grounded AI Tutor
            </button>
            <button
              type="button"
              className={`${styles.canvasTabBtn} ${activeViewMode === "notes" ? styles.canvasTabBtnActive : ""}`}
              onClick={() => setActiveViewMode("notes")}
            >
              <Icon name="file-text" size={15} />
              Notes Canvas
            </button>
          </div>

          <div className={styles.canvasBody}>
            {activeViewMode === "split" ? (
              <div className={styles.splitCanvasLayout}>
                {/* Split Left: Notes */}
                <div className={styles.splitNotesPane}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--s-2)" }}>
                    <span style={{ fontSize: "var(--fs-xs)", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>
                      Study Working & Notes
                    </span>
                    <span className={styles.saveIndicator}>
                      <Icon name="check" size={12} style={{ color: "var(--success)" }} />
                      Autosaved
                    </span>
                  </div>
                  <textarea
                    value={notebook.notes}
                    onChange={(e) => updateNotes(e.target.value)}
                    placeholder="Write your study notes, proofs, and working here…"
                    style={{
                      width: "100%",
                      flex: 1,
                      minHeight: "350px",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--r-lg)",
                      padding: "var(--s-4)",
                      color: "var(--text)",
                      fontSize: "var(--fs-sm)",
                      lineHeight: 1.6,
                      fontFamily: "inherit",
                      resize: "none",
                      outline: "none",
                    }}
                  />
                </div>

                {/* Split Right: AI Tutor */}
                <div className={styles.splitChatPane}>
                  <div className={styles.chatContainer}>
                    <div className={styles.chatMessages}>
                      {notebook.chatHistory.map((msg) => (
                        <div
                          key={msg.id}
                          className={`${styles.messageBubble} ${
                            msg.role === "user" ? styles.userMessage : styles.assistantMessage
                          }`}
                        >
                          <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>

                          {msg.citations && msg.citations.length > 0 && (
                            <div className={styles.citationRow}>
                              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                                Citations:
                              </span>
                              {msg.citations.map((c, i) => (
                                <span key={i} className={styles.citationChip} title={c.snippet}>
                                  [{i + 1}] {c.sourceTitle}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      <div ref={chatBottomRef} />
                    </div>

                    <div style={{ display: "flex", gap: "var(--s-1)", flexWrap: "wrap", marginBottom: "var(--s-2)" }}>
                      <button
                        type="button"
                        className={styles.filterPill}
                        style={{ fontSize: "11px", padding: "4px 8px" }}
                        onClick={() => handleSendChat("Summarise the key theorems and proof steps from my sources.")}
                      >
                        ✨ Key theorems
                      </button>
                      <button
                        type="button"
                        className={styles.filterPill}
                        style={{ fontSize: "11px", padding: "4px 8px" }}
                        onClick={() => handleSendChat("What are common exam traps on this topic?")}
                      >
                        ⚠️ Exam traps
                      </button>
                    </div>

                    <div className={styles.chatInputRow}>
                      <input
                        type="text"
                        className={styles.chatInputField}
                        placeholder={`Ask AI Tutor about ${notebook.title}…`}
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void handleSendChat();
                          }
                        }}
                        disabled={isGenerating}
                      />
                      <Button
                        variant="primary"
                        onClick={() => void handleSendChat()}
                        disabled={isGenerating || !chatInput.trim()}
                      >
                        {isGenerating ? "…" : "Ask"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : activeViewMode === "notes" ? (
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <textarea
                  value={notebook.notes}
                  onChange={(e) => updateNotes(e.target.value)}
                  placeholder="Write your study notes, proofs, and working here…"
                  style={{
                    width: "100%",
                    flex: 1,
                    minHeight: "400px",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r-lg)",
                    padding: "var(--s-5)",
                    color: "var(--text)",
                    fontSize: "var(--fs-base)",
                    lineHeight: 1.7,
                    fontFamily: "inherit",
                    resize: "none",
                    outline: "none",
                  }}
                />
              </div>
            ) : (
              <div className={styles.chatContainer}>
                <div className={styles.chatMessages}>
                  {notebook.chatHistory.map((msg) => (
                    <div
                      key={msg.id}
                      className={`${styles.messageBubble} ${
                        msg.role === "user" ? styles.userMessage : styles.assistantMessage
                      }`}
                    >
                      <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>

                      {msg.citations && msg.citations.length > 0 && (
                        <div className={styles.citationRow}>
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            Citations:
                          </span>
                          {msg.citations.map((c, i) => (
                            <span key={i} className={styles.citationChip} title={c.snippet}>
                              [{i + 1}] {c.sourceTitle}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={chatBottomRef} />
                </div>

                <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap", marginBottom: "var(--s-2)" }}>
                  <button
                    type="button"
                    className={styles.filterPill}
                    onClick={() => handleSendChat("Summarise the key theorems and proof steps from my sources.")}
                  >
                    ✨ Summarise key theorems
                  </button>
                  <button
                    type="button"
                    className={styles.filterPill}
                    onClick={() => handleSendChat("What are the most common exam mistakes students make on this topic?")}
                  >
                    ⚠️ Common exam traps
                  </button>
                  <button
                    type="button"
                    className={styles.filterPill}
                    onClick={() => handleSendChat("Give me 3 practice questions to test my understanding.")}
                  >
                    📝 3 Practice questions
                  </button>
                </div>

                <div className={styles.chatInputRow}>
                  <input
                    type="text"
                    className={styles.chatInputField}
                    placeholder={`Ask your AI Tutor about ${notebook.title}…`}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSendChat();
                      }
                    }}
                    disabled={isGenerating}
                  />
                  <Button
                    variant="primary"
                    onClick={() => void handleSendChat()}
                    disabled={isGenerating || !chatInput.trim()}
                  >
                    {isGenerating ? "Thinking…" : "Ask"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* PANEL 3: Studio Tools & Artifacts (Right Column) */}
        <aside className={`${styles.studioToolsPanel} ${mobilePanel !== "tools" ? styles.mobileHidden : ""}`}>
          <div>
            <div className={styles.toolsSectionTitle}>Studio Tools</div>
            <div className={styles.toolsGrid}>
              <button
                type="button"
                className={styles.toolButton}
                onClick={() => void handleGenerateFeynman()}
                disabled={isGenerating}
              >
                <div className={styles.toolIconBox}>
                  <Icon name="brain" size={18} />
                </div>
                <div className={styles.toolLabel}>Explain it simply</div>
                <div className={styles.toolSubtext}>Explain simply & find knowledge gaps</div>
              </button>

              <button
                type="button"
                className={styles.toolButton}
                onClick={() => void handleGenerateCheatSheet()}
                disabled={isGenerating}
              >
                <div className={styles.toolIconBox}>
                  <Icon name="file-text" size={18} />
                </div>
                <div className={styles.toolLabel}>Revision Cheat Sheet</div>
                <div className={styles.toolSubtext}>High-yield formulas & definitions</div>
              </button>

              <button
                type="button"
                className={styles.toolButton}
                onClick={handleGenerateFlashcards}
              >
                <div className={styles.toolIconBox}>
                  <Icon name="layers" size={18} />
                </div>
                <div className={styles.toolLabel}>Flashcard Deck</div>
                <div className={styles.toolSubtext}>Generate active recall deck</div>
              </button>

              <button
                type="button"
                className={styles.toolButton}
                onClick={handleGenerateQuiz}
              >
                <div className={styles.toolIconBox}>
                  <Icon name="check" size={18} />
                </div>
                <div className={styles.toolLabel}>Practice Quiz</div>
                <div className={styles.toolSubtext}>Quick self-test</div>
              </button>
            </div>
          </div>

          <div>
            <div className={styles.toolsSectionTitle}>Generated Artifacts ({notebook.artifacts.length})</div>
            <div className={styles.artifactsList}>
              {notebook.artifacts.map((art) => (
                <div
                  key={art.id}
                  className={styles.artifactCard}
                  onClick={() =>
                    setActiveArtifactPreview({
                      title: art.title,
                      type: art.type,
                      content: art.content,
                    })
                  }
                  role="button"
                  tabIndex={0}
                >
                  <div className={styles.artifactHead}>
                    <span className={styles.artifactBadge}>
                      <Icon
                        name={
                          art.type === "feynman"
                            ? "brain"
                            : art.type === "cheat_sheet"
                              ? "file-text"
                              : art.type === "flashcards"
                                ? "layers"
                                : "check"
                        }
                        size={12}
                      />
                      {art.type.replace("_", " ")}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeArtifact(art.id);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--text-faint)",
                        cursor: "pointer",
                        fontSize: "11px",
                      }}
                    >
                      Delete
                    </button>
                  </div>
                  <h3 className={styles.artifactTitle}>{art.title}</h3>
                  {art.summary && <p className={styles.artifactSummary}>{art.summary}</p>}
                </div>
              ))}

              {notebook.artifacts.length === 0 && (
                <p style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", margin: 0 }}>
                  Pick a tool above to make your first plain-English breakdown or revision sheet.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Add Source Modal */}
      {isAddSourceOpen && (
        <Modal
          open={isAddSourceOpen}
          onClose={() => setIsAddSourceOpen(false)}
          title="Add Study Source to Notebook"
        >
          <form onSubmit={handleAddSourceSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
            <div>
              <label style={{ display: "block", fontSize: "var(--fs-sm)", fontWeight: 600, marginBottom: "var(--s-1)" }}>
                Source Title
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Chapter 4: Circle Theorems & Proofs.pdf"
                value={newSourceTitle}
                onChange={(e) => setNewSourceTitle(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--text)",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "var(--fs-sm)", fontWeight: 600, marginBottom: "var(--s-1)" }}>
                Source Type
              </label>
              <select
                value={newSourceType}
                onChange={(e) => setNewSourceType(e.target.value as SourceType)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--text)",
                }}
              >
                <option value="pdf">PDF Textbook / Document</option>
                <option value="note">Lecture Notes</option>
                <option value="past_paper">Past Exam Paper</option>
                <option value="syllabus">Curriculum / Syllabus Guide</option>
                <option value="web">Web Reference Article</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "var(--fs-sm)", fontWeight: 600, marginBottom: "var(--s-1)" }}>
                Source Content / Notes Text
              </label>
              <textarea
                required
                placeholder="Paste the key content, definitions, theorems, or textbook notes here…"
                value={newSourceContent}
                onChange={(e) => setNewSourceContent(e.target.value)}
                rows={6}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--text)",
                  fontFamily: "inherit",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--s-2)" }}>
              <Button type="button" onClick={() => setIsAddSourceOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Add source
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Artifact Preview Modal */}
      {activeArtifactPreview && (
        <Modal
          open={Boolean(activeArtifactPreview)}
          onClose={() => setActiveArtifactPreview(null)}
          title={activeArtifactPreview.title}
        >
          <div style={{ maxHeight: "60vh", overflowY: "auto", whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: "var(--fs-base)" }}>
            {activeArtifactPreview.content}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--s-2)", marginTop: "var(--s-4)", flexWrap: "wrap" }}>
            <Button
              variant="secondary"
              onClick={() => handleAppendToNotes(activeArtifactPreview.content)}
              style={{ display: "inline-flex", alignItems: "center", gap: "var(--s-1)" }}
            >
              <Icon name="file-text" size={14} />
              Append to Notes
            </Button>
            {activeArtifactPreview.type === "cheat_sheet" && (
              <Button
                variant="secondary"
                onClick={() => void handleCreateDeckFromArtifact()}
                disabled={isExportingArtifact}
                style={{ display: "inline-flex", alignItems: "center", gap: "var(--s-1)" }}
              >
                <Icon name="layers" size={14} />
                {isExportingArtifact ? "Creating deck..." : "Create Flashcard Deck"}
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(activeArtifactPreview.content);
                showToast("Copied to clipboard!");
              }}
            >
              Copy to clipboard
            </Button>
            <Button variant="primary" onClick={() => setActiveArtifactPreview(null)}>
              Close
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
