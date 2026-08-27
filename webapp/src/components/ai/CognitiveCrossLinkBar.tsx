import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Icon } from "../Icon";
import {
  CognitiveBridge,
  type CognitiveContextPayload,
  type CognitiveSourceTool,
  type CognitiveSeverity,
  type CognitiveSuggestedAction,
} from "../../lib/cognitiveBridge";
import styles from "./CognitiveCrossLinkBar.module.css";

export interface CognitiveCrossLinkBarProps {
  payload?: CognitiveContextPayload | null;
  subject?: string;
  topic?: string;
  concept?: string;
  sourceTool?: CognitiveSourceTool;
  sourceId?: string;
  evidencePrompt?: string;
  misconceptions?: string[];
  severity?: CognitiveSeverity;
  suggestedAction?: CognitiveSuggestedAction;
  currentTool?: "debugger" | "feynman" | "premortem" | "graph";
  compact?: boolean;
  className?: string;
  onNavigate?: (route: string, tool: "debugger" | "feynman" | "premortem" | "graph") => void;
  onClear?: () => void;
  showDismiss?: boolean;
}

const TOOL_CONFIGS: {
  id: "debugger" | "feynman" | "premortem" | "graph";
  label: string;
  route: string;
  icon: "zap" | "users" | "shield" | "network";
  action: CognitiveSuggestedAction;
}[] = [
  {
    id: "debugger",
    label: "Decompile in Debugger",
    route: "/debugger",
    icon: "zap",
    action: "debug_stack",
  },
  {
    id: "feynman",
    label: "Teach in Feynman",
    route: "/feynman",
    icon: "users",
    action: "teach_apprentice",
  },
  {
    id: "premortem",
    label: "Stress-Test in Pre-Mortem",
    route: "/premortem",
    icon: "shield",
    action: "run_premortem",
  },
  {
    id: "graph",
    label: "View in Concept Graph",
    route: "/graph",
    icon: "network",
    action: "inspect_graph",
  },
];

const SOURCE_TOOL_LABELS: Record<CognitiveSourceTool, string> = {
  debugger: "Debugger",
  feynman: "Feynman Apprentice",
  premortem: "Pre-Mortem Radar",
  graph: "Concept Graph",
  quiz: "Quiz Attempt",
  notes: "Study Notes",
};

export function CognitiveCrossLinkBar({
  payload: propPayload,
  subject: propSubject,
  topic: propTopic,
  concept: propConcept,
  sourceTool: propSourceTool,
  sourceId: propSourceId,
  evidencePrompt: propEvidencePrompt,
  misconceptions: propMisconceptions,
  severity: propSeverity,
  suggestedAction: propSuggestedAction,
  currentTool,
  compact = false,
  className = "",
  onNavigate,
  onClear,
  showDismiss = true,
}: CognitiveCrossLinkBarProps) {
  const navigate = useNavigate();
  const [, setBridgeVersion] = useState(0);

  // Subscribe to bridge changes so we stay reactive if using persisted state
  useEffect(() => {
    return CognitiveBridge.subscribe(() => {
      setBridgeVersion((v) => v + 1);
    });
  }, []);

  // Compute effective payload from props or fallback to storage
  const hasPropInput = Boolean(
    propPayload || propTopic || propConcept || propSubject || propSourceTool
  );

  const effectivePayload: CognitiveContextPayload | null = hasPropInput
    ? {
        subject: propPayload?.subject || propSubject || "General",
        topic: propPayload?.topic || propTopic || propConcept || "",
        concept: propPayload?.concept || propConcept,
        sourceTool:
          propPayload?.sourceTool ||
          propSourceTool ||
          currentTool ||
          "debugger",
        sourceId: propPayload?.sourceId || propSourceId,
        evidencePrompt: propPayload?.evidencePrompt || propEvidencePrompt,
        misconceptions: propPayload?.misconceptions || propMisconceptions,
        severity: propPayload?.severity || propSeverity,
        suggestedAction: propPayload?.suggestedAction || propSuggestedAction,
      }
    : CognitiveBridge.getPayload();

  if (!effectivePayload || (!effectivePayload.topic && !effectivePayload.concept)) {
    return null;
  }

  const activeConceptName =
    effectivePayload.concept || effectivePayload.topic || "Unknown Concept";
  const sourceLabel =
    SOURCE_TOOL_LABELS[effectivePayload.sourceTool] || effectivePayload.sourceTool;

  const handleToolClick = (tool: (typeof TOOL_CONFIGS)[0]) => {
    const nextPayload: CognitiveContextPayload = {
      subject: effectivePayload.subject || "General",
      topic: effectivePayload.topic || activeConceptName,
      concept: effectivePayload.concept || activeConceptName,
      sourceTool:
        currentTool || effectivePayload.sourceTool || (tool.id as CognitiveSourceTool),
      sourceId: effectivePayload.sourceId,
      evidencePrompt: effectivePayload.evidencePrompt,
      misconceptions: effectivePayload.misconceptions,
      severity: effectivePayload.severity,
      suggestedAction: tool.action,
    };

    CognitiveBridge.setPayload(nextPayload);

    if (onNavigate) {
      onNavigate(tool.route, tool.id);
    } else {
      navigate(tool.route);
    }
  };

  const handleDismiss = () => {
    CognitiveBridge.clear();
    if (onClear) {
      onClear();
    }
  };

  const severityClass =
    effectivePayload.severity === "critical"
      ? styles.severityCritical
      : effectivePayload.severity === "moderate"
      ? styles.severityModerate
      : effectivePayload.severity === "minor"
      ? styles.severityMinor
      : undefined;

  return (
    <nav
      className={`${styles.container} ${compact ? styles.compact : ""} ${className}`}
      aria-label="Cognitive Bridge Cross-Tool AI Actions"
      data-testid="cognitive-cross-link-bar"
    >
      {/* Top Metadata Row: Active Concept, Subject, Origin, Severity */}
      <div className={styles.metaRow}>
        <div className={styles.conceptGroup}>
          <span className={styles.bridgeIcon} title="Cognitive Bridge Active Link">
            <Icon name="brain" size={compact ? 14 : 18} />
          </span>

          <span
            className={styles.conceptBadge}
            data-testid="cross-link-concept-badge"
            title={`Active Concept: ${activeConceptName}`}
          >
            {activeConceptName}
          </span>

          {effectivePayload.subject && (
            <span className={styles.subjectBadge} data-testid="cross-link-subject-badge">
              {effectivePayload.subject}
            </span>
          )}

          <span className={styles.sourceBadge} data-testid="cross-link-source-badge">
            <Icon name="link" size={12} />
            <span>Origin: {sourceLabel}</span>
          </span>

          {effectivePayload.severity && severityClass && (
            <span
              className={severityClass}
              data-testid="cross-link-severity-badge"
            >
              {effectivePayload.severity === "critical"
                ? "Critical Gap"
                : effectivePayload.severity === "moderate"
                ? "Moderate Risk"
                : "Minor Nuance"}
            </span>
          )}
        </div>

        <div className={styles.metaRight}>
          {effectivePayload.misconceptions &&
            effectivePayload.misconceptions.length > 0 && (
              <span
                className={styles.misconceptionCount}
                data-testid="cross-link-misconceptions-count"
              >
                {effectivePayload.misconceptions.length} identified gap
                {effectivePayload.misconceptions.length > 1 ? "s" : ""}
              </span>
            )}

          {showDismiss && (
            <button
              type="button"
              className={styles.dismissBtn}
              onClick={handleDismiss}
              aria-label="Clear active cognitive context"
              data-testid="cross-link-dismiss-btn"
              title="Clear cognitive bridge context"
            >
              <Icon name="x" size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Action Buttons Row: 1-Click Cross-Launch */}
      <div className={styles.actionsRow} data-testid="cross-link-actions-row">
        <span className={styles.actionsLabel}>Cross-Tool Actions:</span>
        {TOOL_CONFIGS.map((tool) => {
          const isCurrent = (currentTool || effectivePayload.sourceTool) === tool.id;

          return (
            <button
              key={tool.id}
              type="button"
              className={`${styles.toolButton} ${isCurrent ? styles.activeTool : ""}`}
              onClick={() => handleToolClick(tool)}
              data-testid={`cross-link-${tool.id}-btn`}
              aria-label={tool.label}
              title={`Switch context to ${tool.label}`}
            >
              <Icon name={tool.icon} size={14} />
              <span>{tool.label}</span>
              {isCurrent && (
                <span className={styles.activeBadge}>Current</span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
