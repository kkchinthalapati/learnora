import { useEffect, useRef, useState, useCallback } from "react";
import { callEdge } from "../api/ai";
import type { Settings } from "../lib/settings";

export type StudyBuddyCheckType =
  | "logic_jump"
  | "contradiction"
  | "muddy_concept"
  | "exam_trap_risk";

export interface StudyBuddyCheckItem {
  id: string;
  type: StudyBuddyCheckType;
  title: string;
  friendlyMessage: string;
  highlightSnippet: string;
  suggestedFix: string;
  lineNumber?: number;
  relatedConcept?: string;
  trapId?: string;
}

interface UseStudyBuddyChecksOptions {
  enabled?: boolean;
  subject?: string;
  debounceMs?: number;
  settings?: Settings;
  onApplyFix?: (item: StudyBuddyCheckItem) => void;
}

/**
 * Offline heuristic scanner to detect logic jumps, contradictions, muddy concepts, and exam traps in note text.
 */
export function detectOfflineStudyBuddyChecks(
  text: string,
  _subject?: string
): StudyBuddyCheckItem[] {
  const items: StudyBuddyCheckItem[] = [];
  if (!text || text.trim().length < 15) {
    return items;
  }

  const lines = text.split("\n");

  // 1. Check for Contradictions
  const lower = text.toLowerCase();
  if (
    (lower.includes("constant velocity") && lower.includes("accelerat")) ||
    (lower.includes("increases") && lower.includes("decreases") && lower.includes("simultaneously")) ||
    (lower.includes("frictionless") && lower.includes("friction force"))
  ) {
    const matchedLine = lines.findIndex((l) =>
      /accelerat|decreases|friction force/i.test(l)
    );
    items.push({
      id: "check-contradiction-1",
      type: "contradiction",
      title: "Potential Contradiction",
      friendlyMessage:
        "Hey! Notice how your note mentions both constant velocity and acceleration in the same section. If velocity is constant, acceleration must be zero.",
      highlightSnippet:
        lines[matchedLine >= 0 ? matchedLine : 0]?.trim().slice(0, 70) ||
        "constant velocity ... accelerating",
      suggestedFix:
        "When velocity is constant, net acceleration is 0 (a = 0). Acceleration occurs only during speed or direction change.",
      lineNumber: matchedLine >= 0 ? matchedLine + 1 : 1,
      relatedConcept: "Kinematics & Newton's First Law",
    });
  }

  // 2. Check for Logic Jumps
  const logicJumpRegex =
    /\b(?:therefore obviously|clearly it follows that|hence trivially|it is easy to see that)\b/i;
  const jumpLineIdx = lines.findIndex((l) => logicJumpRegex.test(l));
  if (jumpLineIdx >= 0) {
    const match = lines[jumpLineIdx].match(logicJumpRegex);
    items.push({
      id: `check-jump-${jumpLineIdx}`,
      type: "logic_jump",
      title: "Missing Proof Step",
      friendlyMessage:
        "You wrote 'obviously / clearly' here! Professors often dock points when the bridging step or theorem condition is skipped.",
      highlightSnippet:
        match ? match[0] : lines[jumpLineIdx].trim().slice(0, 60),
      suggestedFix:
        "By applying [Theorem/Definition], we establish [Prerequisite Step], and thus...",
      lineNumber: jumpLineIdx + 1,
      relatedConcept: "Mathematical Rigor & Proof Steps",
    });
  }

  // 3. Check for Muddy Explanations
  const muddyRegex =
    /\b(?:stuff happens|somehow becomes|it just does|magic happens|thingy)\b/i;
  const muddyLineIdx = lines.findIndex((l) => muddyRegex.test(l));
  if (muddyLineIdx >= 0) {
    items.push({
      id: `check-muddy-${muddyLineIdx}`,
      type: "muddy_concept",
      title: "Muddy Explanation",
      friendlyMessage:
        "This description feels a little informal or fuzzy. Defining the precise mechanism will make your active recall and flashcards way more reliable.",
      highlightSnippet: lines[muddyLineIdx].trim().slice(0, 60),
      suggestedFix:
        "The underlying mechanism proceeds through [specific reagent / mathematical operation], resulting in [outcome].",
      lineNumber: muddyLineIdx + 1,
      relatedConcept: "Clarity & Technical Definitions",
    });
  }

  // 4. Check for Exam Trap Risks (e.g. division by zero, missing domain)
  const divideRegex =
    /(?:divide\s+both\s+sides\s+by\s+[a-zA-Z]|divided\s+by\s+[a-zA-Z]|\/\s*[a-zA-Z]\b)/i;
  const trapLineIdx = lines.findIndex((l) => divideRegex.test(l));
  if (trapLineIdx >= 0 && !lower.includes("≠ 0") && !lower.includes("!= 0")) {
    items.push({
      id: `check-trap-${trapLineIdx}`,
      type: "exam_trap_risk",
      title: "Exam Trap Risk: Zero Boundary",
      friendlyMessage:
        "Adversarial professors love setting traps on this! When dividing both sides by a variable, remember to state the prerequisite condition that it cannot be zero.",
      highlightSnippet: lines[trapLineIdx].trim().slice(0, 60),
      suggestedFix:
        "Note: Assuming the variable is non-zero (x ≠ 0), dividing both sides yields...",
      lineNumber: trapLineIdx + 1,
      relatedConcept: "Edge Case Hazards",
      trapId: "edge-case-hazards",
    });
  }

  // 5. Lookalike Term Confusion
  if (
    (lower.includes("speed") && lower.includes("vector")) ||
    (lower.includes("velocity") && lower.includes("scalar"))
  ) {
    items.push({
      id: "check-lookalike-1",
      type: "exam_trap_risk",
      title: "Lookalike Term Alert: Speed vs Velocity",
      friendlyMessage:
        "Careful! Speed is a scalar magnitude without direction, whereas velocity is a vector quantity having both speed and direction.",
      highlightSnippet: "speed is a vector / velocity is a scalar",
      suggestedFix:
        "Speed (scalar) represents magnitude only; velocity (vector) specifies magnitude and direction.",
      lineNumber: 1,
      relatedConcept: "Lookalike Terms & False Synonyms",
      trapId: "lookalike-terms",
    });
  }

  return items;
}

export function useStudyBuddyChecks(
  text: string,
  options: UseStudyBuddyChecksOptions = {}
) {
  const {
    enabled = true,
    subject = "General STEM",
    debounceMs = 3000,
    settings,
    onApplyFix,
  } = options;

  const [checks, setChecks] = useState<StudyBuddyCheckItem[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScannedAt, setLastScannedAt] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProcessedTextRef = useRef<string>("");

  const performScan = useCallback(
    async (noteContent: string) => {
      if (!enabled || !noteContent || noteContent.trim().length < 15) {
        setChecks([]);
        setIsScanning(false);
        return;
      }

      setIsScanning(true);

      // Attempt AI Edge scan if settings are active
      if (settings) {
        try {
          const prompt = `You are a friendly, encouraging study buddy reviewing a student's notes on "${subject}":
"""
${noteContent.slice(0, 2500)}
"""
Identify up to 3 helpful friendly tips:
- Logic jumps (missing proofs or intermediate steps)
- Contradictions (statements that conflict)
- Muddy explanations (vague language like 'stuff happens')
- Exam trap risks (edge case hazards or false synonyms)

Return a JSON array where each object has:
- "id": string
- "type": "logic_jump" | "contradiction" | "muddy_concept" | "exam_trap_risk"
- "title": string
- "friendlyMessage": string (warm peer tone)
- "highlightSnippet": string
- "suggestedFix": string
- "lineNumber": number
- "relatedConcept": string
- "trapId": string (optional, e.g. "edge-case-hazards")`;

          const response = await callEdge({
            history: [{ role: "user", content: prompt }],
            mode: "quiz",
            settings,
          });

          if (response.text) {
            const match = response.text.match(/\[[\s\S]*\]/);
            if (match) {
              const parsed = JSON.parse(match[0]);
              if (Array.isArray(parsed) && parsed.length > 0) {
                setChecks(parsed);
                setLastScannedAt(new Date());
                setIsScanning(false);
                return;
              }
            }
          }
        } catch {
          // Fall through to offline heuristics
        }
      }

      // Offline heuristics fallback
      const detected = detectOfflineStudyBuddyChecks(noteContent, subject);
      setChecks(detected);
      setLastScannedAt(new Date());
      setIsScanning(false);
    },
    [enabled, settings, subject]
  );

  useEffect(() => {
    if (!enabled) {
      setChecks([]);
      return;
    }

    if (text === lastProcessedTextRef.current) {
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      lastProcessedTextRef.current = text;
      void performScan(text);
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [text, enabled, debounceMs, performScan]);

  const dismissCheck = useCallback((id: string) => {
    setChecks((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const applyCheckFix = useCallback(
    (item: StudyBuddyCheckItem) => {
      onApplyFix?.(item);
      dismissCheck(item.id);
    },
    [onApplyFix, dismissCheck]
  );

  const recheck = useCallback(() => {
    void performScan(text);
  }, [performScan, text]);

  return {
    checks,
    isScanning,
    lastScannedAt,
    dismissCheck,
    applyCheckFix,
    recheck,
  };
}
