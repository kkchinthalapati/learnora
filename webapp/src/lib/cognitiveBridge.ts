/**
 * Cognitive Bridge Protocol & Cross-Tool State Orchestrator
 *
 * Facilitates context-rich transitions between AI learning instruments:
 * - Cognitive Root-Cause Debugger (/debugger)
 * - Feynman Active Apprentice (/feynman)
 * - Pre-Mortem Adversarial Radar (/premortem)
 */

export type CognitiveSourceTool =
  | "debugger"
  | "feynman"
  | "exam_detective"
  | "premortem"
  | "quiz"
  | "notes"
  | "sparring";

export type CognitiveSeverity = "critical" | "moderate" | "minor";

export type CognitiveSuggestedAction =
  | "debug_stack"
  | "teach_apprentice"
  | "exam_detective"
  | "run_premortem"
  | "spar_orally";

export interface CognitiveContextPayload {
  subject: string;
  topic: string;
  concept?: string;
  sourceTool: CognitiveSourceTool;
  sourceId?: string;
  evidencePrompt?: string;
  misconceptions?: string[];
  severity?: "critical" | "moderate" | "minor";
  suggestedAction?: CognitiveSuggestedAction;
}

export const COGNITIVE_BRIDGE_STORAGE_KEY = "learnora:cognitive_bridge_payload";
export const COGNITIVE_BRIDGE_EVENT = "learnora:cognitive_bridge_changed";

let inMemoryPayload: CognitiveContextPayload | null = null;
const listeners = new Set<() => void>();

function notifyListeners(): void {
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new Event(COGNITIVE_BRIDGE_EVENT));
    } catch {
      // ignore
    }
  }
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  });
}

function safeGetStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage || window.localStorage;
  } catch {
    return null;
  }
}

export const CognitiveBridge = {
  setPayload(payload: CognitiveContextPayload): void {
    inMemoryPayload = payload;
    const storage = safeGetStorage();
    if (storage) {
      try {
        storage.setItem(COGNITIVE_BRIDGE_STORAGE_KEY, JSON.stringify(payload));
      } catch (err) {
        console.warn("[CognitiveBridge] Failed to write payload to storage:", err);
      }
    }
    notifyListeners();
  },

  getPayload(): CognitiveContextPayload | null {
    const storage = safeGetStorage();
    if (storage) {
      try {
        const raw = storage.getItem(COGNITIVE_BRIDGE_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            inMemoryPayload = parsed as CognitiveContextPayload;
            return inMemoryPayload;
          }
        }
      } catch (err) {
        console.warn("[CognitiveBridge] Failed to read payload from storage:", err);
      }
    }
    return inMemoryPayload;
  },

  clear(): void {
    inMemoryPayload = null;
    const storage = safeGetStorage();
    if (storage) {
      try {
        storage.removeItem(COGNITIVE_BRIDGE_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    notifyListeners();
  },

  saveActiveTopic(topic: string, subject = "General"): void {
    const existing = CognitiveBridge.getPayload();
    CognitiveBridge.setPayload({
      subject: existing?.subject || subject,
      sourceTool: existing?.sourceTool || "notes",
      ...existing,
      topic,
    });
  },

  hasPayload(): boolean {
    return CognitiveBridge.getPayload() !== null;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    const handleStorage = (e: StorageEvent) => {
      if (e.key === COGNITIVE_BRIDGE_STORAGE_KEY || e.key === null) {
        listener();
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("storage", handleStorage);
    }

    return () => {
      listeners.delete(listener);
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", handleStorage);
      }
    };
  },

  getTargetRoute(tool: "debugger" | "feynman" | "exam_detective" | "premortem" | "sparring"): string {
    switch (tool) {
      case "debugger":
        return "/solver";
      case "feynman":
        return "/feynman";
      case "exam_detective":
      case "premortem":
        return "/exam-detective";
      case "sparring":
        return "/viva";
      default:
        return "/";
    }
  },
};

// Export individual helper methods as well for flexibility
export const setPayload = CognitiveBridge.setPayload;
export const getPayload = CognitiveBridge.getPayload;
export const clear = CognitiveBridge.clear;
