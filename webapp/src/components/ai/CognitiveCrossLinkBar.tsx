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
    label: "Find my mistake",
    route: "/debugger",
    icon: "zap",
    action: "debug_stack",
  },
  {
    id: "feynman",
    label: "Explain it simply",
    route: "/feynman",
    icon: "users",
    action: "teach_apprentice",
  },
  {
    id: "premortem",
    label: "What could go wrong",
    route: "/premortem",
    icon: "shield",
    action: "run_premortem",
  },
  {
    id: "graph",
    label: "How topics connect",
    route: "/graph",
    icon: "network",
    action: "inspect_graph",
  },
];

const SOURCE_TOOL_LABELS: Record<CognitiveSourceTool, string> = {
  debugger: "Find My Mistake",
  feynman: "Explain It Simply",
  premortem: "What Could Go Wrong",
  graph: "How Topics Connect",
  quiz: "a quiz",
  notes: "your notes",
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
      aria-label="Carry this topic into another Study Lab tool"
      data-testid="cognitive-cross-link-bar"
    >
      {/* Top row: topic, subject, where it came from, how bad */}
      <div className={styles.metaRow}>
        <div className={styles.conceptGroup}>
          <span className={styles.bridgeIcon} title="The topic you're carrying between tools">
            <Icon name="brain" size={compact ? 14 : 18} />
          </span>

          <span
            className={styles.conceptBadge}
            data-testid="cross-link-concept-badge"
            title={`Topic: ${activeConceptName}`}
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
            <span>From: {sourceLabel}</span>
          </span>

          {effectivePayload.severity && severityClass && (
            <span
              className={severityClass}
              data-testid="cross-link-severity-badge"
            >
              {effectivePayload.severity === "critical"
                ? "Needs work"
                : effectivePayload.severity === "moderate"
                ? "Worth a look"
                : "Nearly there"}
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
                {effectivePayload.misconceptions.length} thing
                {effectivePayload.misconceptions.length > 1 ? "s" : ""} to sort out
              </span>
            )}

          {showDismiss && (
            <button
              type="button"
              className={styles.dismissBtn}
              onClick={handleDismiss}
              aria-label="Stop carrying this topic between tools"
              data-testid="cross-link-dismiss-btn"
              title="Stop carrying this topic between tools"
            >
              <Icon name="x" size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className={styles.actionsRow} data-testid="cross-link-actions-row">
        <span className={styles.actionsLabel}>Take this to:</span>
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
              title={`Open this topic in ${tool.label}`}
            >
              <Icon name={tool.icon} size={14} />
              <span>{tool.label}</span>
              {isCurrent && (
                <span className={styles.activeBadge}>You’re here</span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
