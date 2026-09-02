import React from "react";
import type { CognitiveLayer, LayerStatus } from "../../api/aiDebugger";
import { Icon } from "../../components/Icon";
import styles from "./KnowledgeCircuit.module.css";

interface KnowledgeCircuitProps {
  layers: CognitiveLayer[];
  selectedLevel?: number;
  onSelectLevel?: (level: number) => void;
  isRepairing?: boolean;
}

export function KnowledgeCircuit({
  layers,
  selectedLevel,
  onSelectLevel,
  isRepairing = false,
}: KnowledgeCircuitProps) {
  // Sort layers level 1 (bottom/source) to level 3 (top/surface)
  const sortedLayers = [...layers].sort((a, b) => a.level - b.level);

  const level1 = sortedLayers.find((l) => l.level === 1) || {
    level: 1,
    concept: "The basics underneath",
    status: "severed" as LayerStatus,
    explanation: "The bit you need before anything else",
  };

  const level2 = sortedLayers.find((l) => l.level === 2) || {
    level: 2,
    concept: "The step in between",
    status: "shaky" as LayerStatus,
    explanation: "How the basics turn into the method",
  };

  const level3 = sortedLayers.find((l) => l.level === 3) || {
    level: 3,
    concept: "The question you got wrong",
    status: "severed" as LayerStatus,
    explanation: "The mistake you actually saw",
  };

  const isCircuitBroken =
    level1.status === "severed" ||
    level2.status === "severed" ||
    level3.status === "severed";

  const isAllHealthy =
    level1.status === "healthy" &&
    level2.status === "healthy" &&
    level3.status === "healthy";

  const getNodeCardClass = (status: LayerStatus, level: number) => {
    const isSelected = selectedLevel === level;
    let base = styles.nodeCardSevered;
    if (status === "healthy") base = styles.nodeCardHealthy;
    else if (status === "shaky") base = styles.nodeCardShaky;

    return `${styles.nodeCard} ${base} ${isSelected ? styles.nodeCardSelected : ""}`;
  };

  const truncateText = (text: string, maxLen: number) => {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen - 1) + "…";
  };

  const handleKeyDown = (e: React.KeyboardEvent, level: number) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelectLevel?.(level);
    }
  };

  return (
    <div
      className={`${styles.circuitContainer} ${isRepairing ? styles.repairPulseEffect : ""}`}
      data-testid="knowledge-circuit"
      aria-label="Map of how the three steps connect"
    >
      <div className={styles.circuitHeader}>
        <div className={styles.circuitTitle}>
          <Icon name="activity" size={18} />
          <span>How the steps connect</span>
        </div>
        <div
          className={`${styles.signalStatus} ${
            isAllHealthy
              ? styles.statusHealthy
              : isCircuitBroken
              ? styles.statusSevered
              : styles.statusShaky
          }`}
          data-testid="circuit-signal-status"
        >
          <Icon
            name={isAllHealthy ? "check" : isCircuitBroken ? "alert-triangle" : "refresh-cw"}
            size={14}
          />
          <span>
            {isAllHealthy
              ? "All three steps hold up"
              : isCircuitBroken
              ? "Missing link"
              : "Needs work"}
          </span>
        </div>
      </div>

      <div className={styles.svgWrapper}>
        <svg
          viewBox="0 0 680 200"
          className={styles.circuitSvg}
          role="img"
          aria-label="Diagram showing how the basics lead to the step in between, and on to the question you got wrong"
        >
          <defs>
            {/* Glow filters */}
            <filter id="glow-green" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <filter id="glow-red" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Background Circuit Grid Lines */}
          <g opacity="0.15" stroke="currentColor">
            <line x1="20" y1="30" x2="660" y2="30" strokeWidth="1" strokeDasharray="4 8" />
            <line x1="20" y1="100" x2="660" y2="100" strokeWidth="1" strokeDasharray="4 8" />
            <line x1="20" y1="170" x2="660" y2="170" strokeWidth="1" strokeDasharray="4 8" />
          </g>

          {/* Conduit Wire 1 -> 2 */}
          <path
            d="M 190 100 L 250 100"
            className={
              level1.status === "healthy" && level2.status === "healthy"
                ? styles.conduitHealthy
                : level1.status === "severed"
                ? styles.conduitSevered
                : styles.conduitShaky
            }
          />

          {/* Conduit Wire 2 -> 3 */}
          <path
            d="M 430 100 L 490 100"
            className={
              level2.status === "healthy" && level3.status === "healthy"
                ? styles.conduitHealthy
                : level2.status === "severed" || level3.status === "severed"
                ? styles.conduitSevered
                : styles.conduitShaky
            }
          />

          {/* Crack marker if wire 1->2 or 2->3 is severed */}
          {level1.status === "severed" && (
            <g transform="translate(220, 100)" className={styles.crackMarker}>
              <circle cx="0" cy="0" r="10" fill="#ef4444" opacity="0.2" />
              <path
                d="M -5 -6 L 0 -1 L -3 2 L 4 7"
                stroke="#ef4444"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
              />
            </g>
          )}

          {level2.status === "severed" && level1.status !== "severed" && (
            <g transform="translate(460, 100)" className={styles.crackMarker}>
              <circle cx="0" cy="0" r="10" fill="#ef4444" opacity="0.2" />
              <path
                d="M -5 -6 L 0 -1 L -3 2 L 4 7"
                stroke="#ef4444"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
              />
            </g>
          )}

          {/* NODE 1: the basics (Left: X=20 to 190) */}
          <g
            className={styles.nodeGroup}
            role="button"
            tabIndex={0}
            aria-label={`Step 1, the basics: ${level1.concept}, ${level1.status}`}
            onClick={() => onSelectLevel?.(1)}
            onKeyDown={(e) => handleKeyDown(e, 1)}
          >
            <rect
              x="20"
              y="40"
              width="170"
              height="120"
              rx="10"
              className={getNodeCardClass(level1.status, 1)}
            />
            {/* Level Badge */}
            <rect x="32" y="52" width="64" height="20" rx="4" fill="rgba(255,255,255,0.12)" />
            <text x="38" y="66" fill="#a5b4fc" className={styles.nodeBadgeText}>
              STEP 1: BASICS
            </text>

            {/* Concept text */}
            <text x="32" y="94" className={styles.nodeConceptText}>
              {truncateText(level1.concept, 19)}
            </text>
            <text x="32" y="112" fill="#9ca3af" fontSize="10px">
              What it rests on
            </text>

            {/* Status Pill */}
            <rect
              x="32"
              y="126"
              width="90"
              height="20"
              rx="10"
              fill={
                level1.status === "healthy"
                  ? "rgba(34, 197, 94, 0.2)"
                  : "rgba(239, 68, 68, 0.2)"
              }
              stroke={level1.status === "healthy" ? "#22c55e" : "#ef4444"}
              strokeWidth="1"
            />
            <text
              x="42"
              y="140"
              fill={level1.status === "healthy" ? "#4ade80" : "#f87171"}
              className={styles.nodeStatusText}
            >
              {level1.status === "healthy" ? "● Solid" : "▲ Missing"}
            </text>
          </g>

          {/* NODE 2: the step in between (Middle: X=260 to 430) */}
          <g
            className={styles.nodeGroup}
            role="button"
            tabIndex={0}
            aria-label={`Step 2, the step in between: ${level2.concept}, ${level2.status}`}
            onClick={() => onSelectLevel?.(2)}
            onKeyDown={(e) => handleKeyDown(e, 2)}
          >
            <rect
              x="260"
              y="40"
              width="170"
              height="120"
              rx="10"
              className={getNodeCardClass(level2.status, 2)}
            />
            {/* Level Badge */}
            <rect x="272" y="52" width="76" height="20" rx="4" fill="rgba(255,255,255,0.12)" />
            <text x="278" y="66" fill="#fed7aa" className={styles.nodeBadgeText}>
              STEP 2: LINK
            </text>

            {/* Concept text */}
            <text x="272" y="94" className={styles.nodeConceptText}>
              {truncateText(level2.concept, 19)}
            </text>
            <text x="272" y="112" fill="#9ca3af" fontSize="10px">
              How it joins up
            </text>

            {/* Status Pill */}
            <rect
              x="272"
              y="126"
              width="90"
              height="20"
              rx="10"
              fill={
                level2.status === "healthy"
                  ? "rgba(34, 197, 94, 0.2)"
                  : level2.status === "shaky"
                  ? "rgba(245, 158, 11, 0.2)"
                  : "rgba(239, 68, 68, 0.2)"
              }
              stroke={
                level2.status === "healthy"
                  ? "#22c55e"
                  : level2.status === "shaky"
                  ? "#f59e0b"
                  : "#ef4444"
              }
              strokeWidth="1"
            />
            <text
              x="282"
              y="140"
              fill={
                level2.status === "healthy"
                  ? "#4ade80"
                  : level2.status === "shaky"
                  ? "#fbbf24"
                  : "#f87171"
              }
              className={styles.nodeStatusText}
            >
              {level2.status === "healthy"
                ? "● Solid"
                : level2.status === "shaky"
                ? "◆ Shaky"
                : "▲ Missing"}
            </text>
          </g>

          {/* NODE 3: the question you got wrong (Right: X=500 to 670) */}
          <g
            className={styles.nodeGroup}
            role="button"
            tabIndex={0}
            aria-label={`Step 3, the question you got wrong: ${level3.concept}, ${level3.status}`}
            onClick={() => onSelectLevel?.(3)}
            onKeyDown={(e) => handleKeyDown(e, 3)}
          >
            <rect
              x="500"
              y="40"
              width="160"
              height="120"
              rx="10"
              className={getNodeCardClass(level3.status, 3)}
            />
            {/* Level Badge */}
            <rect x="512" y="52" width="80" height="20" rx="4" fill="rgba(255,255,255,0.12)" />
            <text x="518" y="66" fill="#fca5a5" className={styles.nodeBadgeText}>
              STEP 3: THE SLIP
            </text>

            {/* Concept text */}
            <text x="512" y="94" className={styles.nodeConceptText}>
              {truncateText(level3.concept, 18)}
            </text>
            <text x="512" y="112" fill="#9ca3af" fontSize="10px">
              Where you saw it
            </text>

            {/* Status Pill */}
            <rect
              x="512"
              y="126"
              width="90"
              height="20"
              rx="10"
              fill={
                level3.status === "healthy"
                  ? "rgba(34, 197, 94, 0.2)"
                  : "rgba(239, 68, 68, 0.2)"
              }
              stroke={level3.status === "healthy" ? "#22c55e" : "#ef4444"}
              strokeWidth="1"
            />
            <text
              x="522"
              y="140"
              fill={level3.status === "healthy" ? "#4ade80" : "#f87171"}
              className={styles.nodeStatusText}
            >
              {level3.status === "healthy" ? "● Sorted" : "▲ Still wrong"}
            </text>
          </g>
        </svg>
      </div>

      <div className={styles.propagationFooter}>
        <strong>How it snowballed: </strong>
        {level1.status === "severed"
          ? `You never quite got [${level1.concept}], so [${level2.concept}] never made proper sense either — and that\u2019s why [${level3.concept}] went wrong. Sort out the first one and the rest follows.`
          : isAllHealthy
          ? `All three steps hold up now. The basics are solid, so the harder stuff has something to stand on.`
          : `The middle step is still a bit shaky. Go over it once more and it should stick.`}
      </div>
    </div>
  );
}
