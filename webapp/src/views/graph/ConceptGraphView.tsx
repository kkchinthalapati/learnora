import { useState, useMemo, useRef, useCallback, type MouseEvent, type WheelEvent } from "react";
import { useFolders } from "../../hooks/useFolders";
import { useMaterials } from "../../hooks/useMaterials";
import { useNotes } from "../../hooks/useNotes";
import { useFlashcards } from "../../hooks/useFlashcards";
import { useDecks } from "../../hooks/useDecks";
import { useQuizzes, useQuizAttempts } from "../../hooks/useQuizzes";
import {
  buildConceptGraph,
  filterConceptGraph,
  type ConceptNode,
} from "../../lib/conceptGraph";
import { Icon } from "../../components/Icon";
import { ConceptNodeDrawer } from "./ConceptNodeDrawer";
import styles from "./graph.module.css";

export function ConceptGraphView() {
  const { data: folders = [] } = useFolders();
  const { data: materials = [] } = useMaterials();
  const { data: notes = [] } = useNotes();
  const { data: flashcards = [] } = useFlashcards();
  const { data: decks = [] } = useDecks();
  const { data: quizzes = [] } = useQuizzes();
  const { data: quizAttempts = [] } = useQuizAttempts();

  // Filters State
  const [selectedFolder, setSelectedFolder] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [knowledgeGapsOnly, setKnowledgeGapsOnly] = useState<boolean>(false);

  // Selection & Hover State
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
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
    });
  }, [folders, materials, notes, flashcards, decks, quizzes, quizAttempts]);

  // 2. Filter Graph
  const graphData = useMemo(() => {
    return filterConceptGraph(rawGraph, {
      folderId: selectedFolder,
      searchQuery,
      knowledgeGapsOnly,
    });
  }, [rawGraph, selectedFolder, searchQuery, knowledgeGapsOnly]);

  const selectedNode = useMemo(() => {
    return rawGraph.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [rawGraph.nodes, selectedNodeId]);

  const hoveredNode = useMemo(() => {
    return rawGraph.nodes.find((n) => n.id === hoveredNodeId) || null;
  }, [rawGraph.nodes, hoveredNodeId]);

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

  // --- Pan & Zoom Handlers ---
  const handleMouseDown = useCallback((e: MouseEvent<SVGSVGElement>) => {
    // Only pan on background click, not node click
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

  const handleWheel = useCallback((e: WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((prev) => Math.min(2.8, Math.max(0.4, Number((prev * zoomFactor).toFixed(2)))));
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

  return (
    <div className={styles.container}>
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
          <div className={styles.emptyState}>
            <Icon name="share-2" size={48} />
            <h2 className={styles.emptyStateTitle}>No Concepts Match Your Filter</h2>
            <p className={styles.emptyStateDesc}>
              Try clearing your search query or toggling off the knowledge gaps filter to view all connected concepts in your study graph.
            </p>
            <button
              type="button"
              className={styles.gapToggleBtn}
              onClick={() => {
                setSearchQuery("");
                setSelectedFolder("all");
                setKnowledgeGapsOnly(false);
              }}
            >
              Reset Filters
            </button>
          </div>
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
              onWheel={handleWheel}
              role="img"
              aria-label="Interactive concept map visualization"
            >
              {/* Background Rect for Click-To-Pan */}
              <rect width="1000" height="800" fill="transparent" />

              {/* Transformation Group for Pan & Zoom */}
              <g
                transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
                style={{ transformOrigin: "500px 400px" }}
              >
                {/* SVG Definitions for Gradients & Filters */}
                <defs>
                  <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="var(--accent)" floodOpacity="0.4" />
                  </filter>
                  <filter id="gapGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#c2453a" floodOpacity="0.6" />
                  </filter>
                </defs>

                {/* 1. Render Edges */}
                <g className="edges-layer">
                  {graphData.edges.map((edge) => {
                    const sourceNode = graphData.nodes.find((n) => n.id === edge.source);
                    const targetNode = graphData.nodes.find((n) => n.id === edge.target);
                    if (!sourceNode || !targetNode) return null;

                    const isConnectedToHovered =
                      activeNodeId &&
                      (edge.source === activeNodeId || edge.target === activeNodeId);

                    const isDimmed = activeNodeId && !isConnectedToHovered;

                    // Style edge line based on relationship type
                    const strokeDasharray =
                      edge.relationship === "part_of"
                        ? "4,4"
                        : edge.relationship === "depends_on"
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

                        {/* Node Outer Halo / Shadow */}
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
            <svg width="18" height="6">
              <line x1="0" y1="3" x2="18" y2="3" stroke="var(--text-muted)" strokeWidth="2" />
            </svg>
            <span>Related to</span>
          </div>
          <div className={styles.legendItem}>
            <svg width="18" height="6">
              <line x1="0" y1="3" x2="18" y2="3" stroke="var(--text-muted)" strokeWidth="2" strokeDasharray="3,2" />
            </svg>
            <span>Part of / Depends</span>
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
        allNodes={rawGraph.nodes}
        isOpen={Boolean(selectedNode)}
        onClose={() => setSelectedNodeId(null)}
        onSelectRelated={(id) => setSelectedNodeId(id)}
      />
    </div>
  );
}
