import { useState, useMemo, useRef, useCallback, useEffect, type MouseEvent } from "react";
import { useFolders } from "../../hooks/useFolders";
import { useMaterials } from "../../hooks/useMaterials";
import { useNotes } from "../../hooks/useNotes";
import { useFlashcards } from "../../hooks/useFlashcards";
import { useDecks } from "../../hooks/useDecks";
import { useQuizzes, useQuizAttempts } from "../../hooks/useQuizzes";
import { useExams } from "../../hooks/useExams";
import {
  buildConceptGraph,
  filterConceptGraph,
  generateSampleGraph,
  type ConceptNode,
} from "../../lib/conceptGraph";
import { CognitiveBridge } from "../../lib/cognitiveBridge";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { ConceptNodeDrawer } from "./ConceptNodeDrawer";
import styles from "./graph.module.css";

export function ConceptGraphView() {
  const {
    data: folders = [],
    isPending: foldersPending,
    isError: foldersError,
  } = useFolders();
  const {
    data: materials = [],
    isPending: materialsPending,
    isError: materialsError,
  } = useMaterials();
  const {
    data: notes = [],
    isPending: notesPending,
    isError: notesError,
  } = useNotes();
  const {
    data: flashcards = [],
    isPending: flashcardsPending,
    isError: flashcardsError,
  } = useFlashcards();
  const {
    data: decks = [],
    isPending: decksPending,
    isError: decksError,
  } = useDecks();
  const {
    data: quizzes = [],
    isPending: quizzesPending,
    isError: quizzesError,
  } = useQuizzes();
  const {
    data: quizAttempts = [],
    isPending: attemptsPending,
    isError: attemptsError,
  } = useQuizAttempts();
  const {
    data: exams = [],
    isPending: examsPending,
    isError: examsError,
  } = useExams();

  const isPending =
    foldersPending ||
    materialsPending ||
    notesPending ||
    flashcardsPending ||
    decksPending ||
    quizzesPending ||
    attemptsPending ||
    examsPending;
  const isError =
    foldersError ||
    materialsError ||
    notesError ||
    flashcardsError ||
    decksError ||
    quizzesError ||
    attemptsError ||
    examsError;

  // Filters State
  const [selectedFolder, setSelectedFolder] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [knowledgeGapsOnly, setKnowledgeGapsOnly] = useState<boolean>(false);
  const [prerequisitesOnly, setPrerequisitesOnly] = useState<boolean>(false);
  const [showDemo, setShowDemo] = useState(false);

  // Check for bridged cognitive context on mount
  useEffect(() => {
    const bridged = CognitiveBridge.getPayload();
    if (bridged && bridged.sourceTool !== "graph") {
      const target = bridged.concept || bridged.topic;
      if (target) {
        setSearchQuery(target);
      }
    }
  }, []);

  // Selection & Hover State
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [isDrillOpen, setIsDrillOpen] = useState<boolean>(false);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // SVG Pan & Zoom State
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // 1. Build Full Graph
  const rawGraph = useMemo(() => {
    return buildConceptGraph({
      folders,
      materials,
      notes,
      flashcards,
      decks,
      quizzes,
      quizAttempts,
      exams,
    });
  }, [folders, materials, notes, flashcards, decks, quizzes, quizAttempts, exams]);

  const demoGraph = useMemo(
    () => (showDemo ? generateSampleGraph(folders) : null),
    [showDemo, folders],
  );
  const activeGraph = demoGraph ?? rawGraph;

  // 2. Filter Graph
  const graphData = useMemo(() => {
    return filterConceptGraph(activeGraph, {
      folderId: selectedFolder,
      searchQuery,
      knowledgeGapsOnly,
      prerequisitesOnly,
    });
  }, [activeGraph, selectedFolder, searchQuery, knowledgeGapsOnly, prerequisitesOnly]);

  const nodeById = useMemo(
    () => new Map(graphData.nodes.map((n) => [n.id, n])),
    [graphData.nodes],
  );

  const selectedNode = useMemo(() => {
    return activeGraph.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [activeGraph.nodes, selectedNodeId]);

  const hoveredNode = useMemo(() => {
    return activeGraph.nodes.find((n) => n.id === hoveredNodeId) || null;
  }, [activeGraph.nodes, hoveredNodeId]);

  // Connected nodes to the hovered or selected node
  const activeNodeId = hoveredNodeId || selectedNodeId;
  const connectedNodeIds = useMemo(() => {
    if (!activeNodeId) return new Set<string>();
    const ids = new Set<string>([activeNodeId]);
    for (const edge of graphData.edges) {
      if (edge.source === activeNodeId) ids.add(edge.target);
      if (edge.target === activeNodeId) ids.add(edge.source);
    }
    return ids;
  }, [activeNodeId, graphData.edges]);

  // 1-Click Remediate Top Knowledge Gap handler
  const handleRemediateTopGap = useCallback(() => {
    const gapNodes = activeGraph.nodes.filter((n) => n.isKnowledgeGap);
    if (gapNodes.length === 0) return;
    const topGap = [...gapNodes].sort(
      (a, b) => (b.gapScore ?? (100 - b.masteryScore)) - (a.gapScore ?? (100 - a.masteryScore)),
    )[0];
    if (topGap) {
      setSelectedNodeId(topGap.id);
      setIsDrillOpen(true);
    }
  }, [activeGraph.nodes]);

  // Pan & Zoom Handlers
  const handleMouseDown = useCallback((e: MouseEvent<SVGSVGElement>) => {
    if ((e.target as HTMLElement).tagName === "svg" || (e.target as HTMLElement).tagName === "rect") {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: MouseEvent<SVGSVGElement>) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
    }
  }, [isPanning]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  useEffect(() => {
    if (!isPanning) return;
    const stop = () => setIsPanning(false);
    window.addEventListener("mouseup", stop);
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("blur", stop);
    };
  }, [isPanning]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      setZoom((prev) =>
        Math.min(2.8, Math.max(0.4, Number((prev * zoomFactor).toFixed(2)))),
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const handleZoomIn = () => setZoom((z) => Math.min(2.8, Number((z + 0.2).toFixed(1))));
  const handleZoomOut = () => setZoom((z) => Math.max(0.4, Number((z - 0.2).toFixed(1))));
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleNodeClick = (node: ConceptNode, e: MouseEvent) => {
    e.stopPropagation();
    setSelectedNodeId(node.id);
    setIsDrillOpen(false);
  };

  const handleNodeMouseEnter = (node: ConceptNode, e: MouseEvent) => {
    setHoveredNodeId(node.id);
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) {
      setTooltipPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  const handleNodeMouseLeave = () => {
    setHoveredNodeId(null);
    setTooltipPos(null);
  };

  if (isPending) {
    return (
      <div className={styles.container} aria-busy="true">
        <Skeleton label="Building your concept graph" height={480} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.container}>
        <p role="alert" className={styles.loadError}>
          Could not load your study data, so the concept map can&apos;t be
          built. Try refreshing the page.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Demo banner */}
      {demoGraph && (
        <div className={styles.demoBanner} role="note">
          <span>
            Demo data — a sample of how your own concept map will look as you
            add notes, decks, and quizzes.
          </span>
          <button
            type="button"
            className={styles.demoBannerExit}
            onClick={() => setShowDemo(false)}
          >
            Back to my graph
          </button>
        </div>
      )}

      {/* Header Toolbar */}
      <header className={styles.toolbar} role="region" aria-label="Concept Graph Controls">
        <div className={styles.filterGroup}>
          {/* Search Box */}
          <div className={styles.searchBox}>
            <Icon name="compass" size={16} className={styles.searchIcon} />
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search concepts or notes…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search concepts"
            />
          </div>

          {/* Folder Filter */}
          <select
            className={styles.folderSelect}
            value={selectedFolder}
            onChange={(e) => setSelectedFolder(e.target.value)}
            aria-label="Filter by subject folder"
          >
            <option value="all">All Subjects</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>

          {/* Knowledge Gap Toggle */}
          <button
            type="button"
            className={`${styles.gapToggleBtn} ${knowledgeGapsOnly ? styles.gapToggleBtnActive : ""}`}
            onClick={() => setKnowledgeGapsOnly((prev) => !prev)}
            aria-pressed={knowledgeGapsOnly}
          >
            <Icon name="alert-triangle" size={16} />
            <span>Knowledge Gaps</span>
            {rawGraph.stats.knowledgeGapsCount > 0 && (
              <span className={styles.gapBadge}>
                {rawGraph.stats.knowledgeGapsCount}
              </span>
            )}
          </button>

          {/* Prerequisite Hierarchy Filter */}
          <button
            type="button"
            className={`${styles.prereqToggleBtn} ${prerequisitesOnly ? styles.prereqToggleBtnActive : ""}`}
            onClick={() => setPrerequisitesOnly((prev) => !prev)}
            aria-pressed={prerequisitesOnly}
            title="Filter to prerequisite dependency hierarchy"
          >
            <Icon name="network" size={16} />
            <span>Prerequisites</span>
            {rawGraph.stats.prerequisitesCount !== undefined && rawGraph.stats.prerequisitesCount > 0 && (
              <span className={styles.gapBadge} style={{ backgroundColor: "var(--accent)" }}>
                {rawGraph.stats.prerequisitesCount}
              </span>
            )}
          </button>

          {/* 1-Click Remediate Knowledge Gap Action */}
          {rawGraph.stats.knowledgeGapsCount > 0 && (
            <button
              type="button"
              className={styles.remediateTopGapBtn}
              onClick={handleRemediateTopGap}
              title="Start targeted 5-minute recovery drill on top knowledge gap"
              aria-label="1-Click Remediate Top Gap"
            >
              <Icon name="zap" size={16} />
              <span>Remediate Top Gap</span>
            </button>
          )}
        </div>

        {/* Stats Row */}
        <div className={styles.statsRow}>
          <div className={styles.statItem} title="Total extracted concepts">
            <Icon name="network" size={14} />
            <span>Concepts:</span>
            <span className={styles.statValue}>{graphData.stats.totalConcepts}</span>
          </div>

          <div className={styles.statItem} title="Total semantic connections">
            <Icon name="share-2" size={14} />
            <span>Edges:</span>
            <span className={styles.statValue}>{graphData.stats.totalEdges}</span>
          </div>

          <div className={styles.statItem} title="Average retention mastery">
            <Icon name="target" size={14} />
            <span>Avg Mastery:</span>
            <span
              className={styles.statValue}
              style={{
                color:
                  graphData.stats.averageMastery >= 70
                    ? "var(--success)"
                    : graphData.stats.averageMastery >= 50
                      ? "var(--warning)"
                      : "var(--danger)",
              }}
            >
              {graphData.stats.averageMastery}%
            </span>
          </div>
        </div>
      </header>

      {/* SVG Canvas Area */}
      <main className={styles.canvasWrapper}>
        {graphData.nodes.length === 0 ? (
          activeGraph.nodes.length === 0 ? (
            <div className={styles.emptyState}>
              <Icon name="share-2" size={48} />
              <h2 className={styles.emptyStateTitle}>Your Concept Map Is Empty</h2>
              <p className={styles.emptyStateDesc}>
                Concepts appear here automatically as you add materials,
                notes, flashcard decks, quizzes, and exams — connected by prerequisites
                and the topics they share.
              </p>
              <button
                type="button"
                className={styles.gapToggleBtn}
                onClick={() => setShowDemo(true)}
              >
                Explore a Demo Graph
              </button>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <Icon name="share-2" size={48} />
              <h2 className={styles.emptyStateTitle}>No Concepts Match Your Filter</h2>
              <p className={styles.emptyStateDesc}>
                Try clearing your search query or toggling off the knowledge gaps or prerequisite filter to view all connected concepts.
              </p>
              <button
                type="button"
                className={styles.gapToggleBtn}
                onClick={() => {
                  setSearchQuery("");
                  setSelectedFolder("all");
                  setKnowledgeGapsOnly(false);
                  setPrerequisitesOnly(false);
                }}
              >
                Reset Filters
              </button>
            </div>
          )
        ) : (
          <>
            <svg
              ref={svgRef}
              className={styles.graphSvg}
              viewBox="0 0 1000 800"
              preserveAspectRatio="xMidYMid meet"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              role="group"
              aria-label="Interactive concept map. Use Tab to move between concept nodes; press Enter to open a node's details."
            >
              {/* Background Rect for Click-To-Pan */}
              <rect width="1000" height="800" fill="transparent" />

              {/* Transformation Group for Pan & Zoom */}
              <g
                transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
                style={{ transformOrigin: "500px 400px" }}
              >
                {/* SVG Definitions for Gradients, Glows & Arrow Markers */}
                <defs>
                  <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="var(--accent)" floodOpacity="0.4" />
                  </filter>
                  <filter id="gapGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#c2453a" floodOpacity="0.6" />
                  </filter>
                  <marker
                    id="arrowhead-highlight"
                    viewBox="0 0 10 10"
                    refX="22"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--accent)" />
                  </marker>
                  <marker
                    id="arrowhead"
                    viewBox="0 0 10 10"
                    refX="22"
                    refY="5"
                    markerWidth="5"
                    markerHeight="5"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--text-muted)" opacity="0.65" />
                  </marker>
                </defs>

                {/* 1. Render Edges */}
                <g className="edges-layer">
                  {graphData.edges.map((edge) => {
                    const sourceNode = nodeById.get(edge.source);
                    const targetNode = nodeById.get(edge.target);
                    if (!sourceNode || !targetNode) return null;

                    const isConnectedToHovered =
                      activeNodeId &&
                      (edge.source === activeNodeId || edge.target === activeNodeId);

                    const isDimmed = activeNodeId && !isConnectedToHovered;

                    const isPrerequisite = edge.relationship === "depends_on";
                    const isPartOf = edge.relationship === "part_of";

                    // Style edge line based on relationship type
                    const strokeDasharray = isPartOf
                      ? "4,4"
                      : isPrerequisite
                        ? "6,3"
                        : undefined;

                    return (
                      <line
                        key={edge.id}
                        x1={sourceNode.x}
                        y1={sourceNode.y}
                        x2={targetNode.x}
                        y2={targetNode.y}
                        stroke={
                          isConnectedToHovered
                            ? "var(--accent)"
                            : "var(--glass-border-subtle)"
                        }
                        strokeWidth={
                          isConnectedToHovered
                            ? 3.5
                            : Math.max(1.2, edge.weight * 1.1)
                        }
                        strokeDasharray={strokeDasharray}
                        strokeOpacity={isDimmed ? 0.15 : isConnectedToHovered ? 1 : 0.6}
                        markerEnd={
                          isPrerequisite
                            ? isConnectedToHovered
                              ? "url(#arrowhead-highlight)"
                              : "url(#arrowhead)"
                            : undefined
                        }
                        className={`${styles.edgeLine} ${
                          isConnectedToHovered ? styles.edgeHighlight : ""
                        } ${isDimmed ? styles.edgeDimmed : ""}`}
                      />
                    );
                  })}
                </g>

                {/* 2. Render Nodes */}
                <g className="nodes-layer">
                  {graphData.nodes.map((node) => {
                    const isSelected = node.id === selectedNodeId;
                    const isHovered = node.id === hoveredNodeId;
                    const isConnected = activeNodeId ? connectedNodeIds.has(node.id) : true;
                    const isDimmed = activeNodeId && !isConnected;

                    return (
                      <g
                        key={node.id}
                        transform={`translate(${node.x}, ${node.y})`}
                        className={`${styles.nodeGroup} ${
                          isSelected ? styles.nodeSelected : ""
                        } ${isDimmed ? styles.nodeDimmed : ""}`}
                        onClick={(e) => handleNodeClick(node, e)}
                        onMouseEnter={(e) => handleNodeMouseEnter(node, e)}
                        onMouseLeave={handleNodeMouseLeave}
                        role="button"
                        tabIndex={0}
                        aria-label={`Concept ${node.label}, mastery ${node.masteryScore}%`}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            setSelectedNodeId(node.id);
                          }
                        }}
                      >
                        {/* Knowledge Gap Pulsing Indicator Ring */}
                        {node.isKnowledgeGap && (
                          <circle
                            r={node.radius + 6}
                            fill="none"
                            stroke="var(--danger)"
                            strokeDasharray="4,3"
                            className={styles.nodeGapRing}
                          />
                        )}

                        {/* Node Outer Halo */}
                        <circle
                          r={node.radius + 2}
                          fill="rgba(0, 0, 0, 0.1)"
                        />

                        {/* Node Base Circle */}
                        <circle
                          r={node.radius}
                          fill={node.folderColor}
                          stroke={isSelected ? "var(--accent)" : "rgba(255, 255, 255, 0.85)"}
                          strokeWidth={isSelected ? 3.5 : 2}
                          className={styles.nodeCircle}
                          filter={node.isKnowledgeGap ? "url(#gapGlow)" : undefined}
                        />

                        {/* Mini Mastery Arc / Inner Center Badge */}
                        <circle
                          r={node.radius * 0.4}
                          fill={
                            node.masteryScore >= 75
                              ? "var(--success)"
                              : node.masteryScore >= 50
                                ? "var(--warning)"
                                : "var(--danger)"
                          }
                          stroke="#ffffff"
                          strokeWidth={1.5}
                        />

                        {/* Concept Label */}
                        <text
                          y={node.radius + 14}
                          className={styles.nodeText}
                          style={{
                            fontWeight: isSelected || isHovered ? 800 : 600,
                            fill: isHovered || isSelected ? "var(--accent-text)" : "var(--text)",
                          }}
                        >
                          {node.label.length > 18
                            ? `${node.label.slice(0, 16)}…`
                            : node.label}
                        </text>
                      </g>
                    );
                  })}
                </g>
              </g>
            </svg>

            {/* Hover Tooltip */}
            {hoveredNode && tooltipPos && (
              <div
                className={styles.tooltip}
                style={{
                  left: tooltipPos.x,
                  top: tooltipPos.y,
                }}
              >
                <div className={styles.tooltipLabel}>{hoveredNode.label}</div>
                <div className={styles.tooltipFolder}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      backgroundColor: hoveredNode.folderColor,
                    }}
                  />
                  {hoveredNode.folderName}
                </div>
                <div
                  className={styles.tooltipMastery}
                  style={{
                    color:
                      hoveredNode.masteryScore >= 75
                        ? "var(--success)"
                        : hoveredNode.masteryScore >= 50
                          ? "var(--warning)"
                          : "var(--danger)",
                  }}
                >
                  Mastery: {hoveredNode.masteryScore}%
                  {hoveredNode.isKnowledgeGap ? " (Gap)" : ""}
                </div>
                {hoveredNode.prerequisites && hoveredNode.prerequisites.length > 0 && (
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                    Prerequisites: {hoveredNode.prerequisites.length}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Legend Box */}
        <div className={styles.legend}>
          <span className={styles.legendTitle}>Graph Legend</span>
          <div className={styles.legendItem}>
            <span className={styles.legendGapDot} />
            <span>Knowledge Gap (&lt;60%)</span>
          </div>
          <div className={styles.legendItem}>
            <svg width="18" height="8">
              <line x1="0" y1="4" x2="14" y2="4" stroke="var(--text-muted)" strokeWidth="2" strokeDasharray="4,2" />
              <polygon points="12,1 18,4 12,7" fill="var(--text-muted)" />
            </svg>
            <span>Prerequisite (depends on)</span>
          </div>
          <div className={styles.legendItem}>
            <svg width="18" height="6">
              <line x1="0" y1="3" x2="18" y2="3" stroke="var(--text-muted)" strokeWidth="2" strokeDasharray="3,2" />
            </svg>
            <span>Part of (component)</span>
          </div>
          <div className={styles.legendItem}>
            <svg width="18" height="6">
              <line x1="0" y1="3" x2="18" y2="3" stroke="var(--text-muted)" strokeWidth="2" />
            </svg>
            <span>Related to</span>
          </div>
        </div>

        {/* Floating Zoom & Pan Controls */}
        <div className={styles.zoomControls}>
          <button
            type="button"
            className={styles.zoomBtn}
            onClick={handleZoomIn}
            title="Zoom In"
            aria-label="Zoom in"
          >
            <Icon name="plus" size={18} />
          </button>
          <button
            type="button"
            className={styles.zoomBtn}
            onClick={handleZoomOut}
            title="Zoom Out"
            aria-label="Zoom out"
          >
            <Icon name="x" size={18} />
          </button>
          <button
            type="button"
            className={styles.zoomBtn}
            onClick={handleResetView}
            title="Reset View"
            aria-label="Reset view"
          >
            <Icon name="refresh-cw" size={16} />
          </button>
        </div>
      </main>

      {/* Slide-Over Drawer */}
      <ConceptNodeDrawer
        node={selectedNode}
        allNodes={activeGraph.nodes}
        isOpen={Boolean(selectedNode)}
        onClose={() => {
          setSelectedNodeId(null);
          setIsDrillOpen(false);
        }}
        onSelectRelated={(id) => {
          setSelectedNodeId(id);
          setIsDrillOpen(false);
        }}
        initialDrillOpen={isDrillOpen}
      />
    </div>
  );
}

