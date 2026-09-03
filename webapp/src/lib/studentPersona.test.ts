import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_STUDENT_PERSONA,
  PERSONA_STORAGE_KEY,
  buildPersonaSystemPrompt,
  getStudentPersona,
  resetStudentPersona,
  saveStudentPersona,
  type StudentPersonaPreferences,
} from "./studentPersona";
import { Storage } from "./storage";

describe("studentPersona", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("Defaults and retrieval", () => {
    it("returns default persona when storage is empty", () => {
      const persona = getStudentPersona();
      expect(persona).toEqual(DEFAULT_STUDENT_PERSONA);
      expect(persona.depth).toBe(3);
      expect(persona.style).toBe("visual_intuitive");
      expect(persona.sourceMode).toBe("hybrid");
      expect(persona.autoAdapt).toBe(true);
      expect(persona.customInstructions).toBeUndefined();
    });

    it("resets persona back to defaults via resetStudentPersona", () => {
      saveStudentPersona({ depth: 5, style: "concise_key_points", customInstructions: "Test" });
      expect(getStudentPersona().depth).toBe(5);

      const reset = resetStudentPersona();
      expect(reset).toEqual(DEFAULT_STUDENT_PERSONA);
      expect(getStudentPersona()).toEqual(DEFAULT_STUDENT_PERSONA);
    });
  });

  describe("Persistence and manual offsets", () => {
    it("applies partial updates while preserving existing settings", () => {
      const p1 = saveStudentPersona({ depth: 1 });
      expect(p1.depth).toBe(1);
      expect(p1.style).toBe("visual_intuitive");
      expect(p1.sourceMode).toBe("hybrid");
      expect(p1.autoAdapt).toBe(true);

      const p2 = saveStudentPersona({ style: "exam_trap_focused" });
      expect(p2.depth).toBe(1); // preserved
      expect(p2.style).toBe("exam_trap_focused");
      expect(p2.sourceMode).toBe("hybrid");

      const p3 = saveStudentPersona({
        sourceMode: "web",
        customInstructions: "Prepare for IB HL Physics exams",
      });
      expect(p3.depth).toBe(1);
      expect(p3.style).toBe("exam_trap_focused");
      expect(p3.sourceMode).toBe("web");
      expect(p3.customInstructions).toBe("Prepare for IB HL Physics exams");

      // Verify persistent round-trip
      const reloaded = getStudentPersona();
      expect(reloaded).toEqual(p3);
    });

    it("sanitizes invalid or corrupt depth values", () => {
      // Clamps depth > 5 to 5
      const high = saveStudentPersona({ depth: 10 as any });
      expect(high.depth).toBe(5);

      // Clamps depth < 1 to 1
      const low = saveStudentPersona({ depth: -3 as any });
      expect(low.depth).toBe(1);

      // Falls back if corrupted in storage
      Storage.set(PERSONA_STORAGE_KEY, { depth: "not-a-number", style: "unknown_style" });
      const recovered = getStudentPersona();
      expect(recovered.depth).toBe(DEFAULT_STUDENT_PERSONA.depth);
      expect(recovered.style).toBe(DEFAULT_STUDENT_PERSONA.style);
    });

    it("sanitizes invalid styles or source modes", () => {
      const saved = saveStudentPersona({
        style: "invalid_style_name" as any,
        sourceMode: "unsupported_mode" as any,
      });
      expect(saved.style).toBe(DEFAULT_STUDENT_PERSONA.style);
      expect(saved.sourceMode).toBe(DEFAULT_STUDENT_PERSONA.sourceMode);
    });
  });

  describe("buildPersonaSystemPrompt", () => {
    it("generates prompt for Depth 1 (ELI5)", () => {
      const persona: StudentPersonaPreferences = {
        depth: 1,
        style: "visual_intuitive",
        sourceMode: "hybrid",
        autoAdapt: true,
      };
      const prompt = buildPersonaSystemPrompt(persona);
      expect(prompt).toContain("Level 1 (ELI5 / Intuitive Simplicity)");
      expect(prompt).toContain("5-year-old");
      expect(prompt).toContain("everyday metaphor");
      expect(prompt).toContain("Visual & Intuitive");
      expect(prompt).toContain("Adaptive Calibration");
    });

    it("generates prompt for Depth 5 (Deep Academic)", () => {
      const persona: StudentPersonaPreferences = {
        depth: 5,
        style: "rigorous_step_by_step",
        sourceMode: "notebook",
        autoAdapt: false,
      };
      const prompt = buildPersonaSystemPrompt(persona);
      expect(prompt).toContain("Level 5 (Deep Academic & Theoretical)");
      expect(prompt).toContain("research-grade");
      expect(prompt).toContain("full mathematical or formal derivations");
      expect(prompt).toContain("Rigorous Step-by-Step");
      expect(prompt).toContain("Student Notebook Only");
      expect(prompt).toContain("Disabled (fixed depth)");
      expect(prompt).not.toContain("## Adaptive Calibration:");
    });

    it("supports all study styles", () => {
      const promptVisual = buildPersonaSystemPrompt({
        ...DEFAULT_STUDENT_PERSONA,
        style: "visual_intuitive",
      });
      expect(promptVisual).toContain("mental models");

      const promptStep = buildPersonaSystemPrompt({
        ...DEFAULT_STUDENT_PERSONA,
        style: "rigorous_step_by_step",
      });
      expect(promptStep).toContain("numbered sequential steps");

      const promptTrap = buildPersonaSystemPrompt({
        ...DEFAULT_STUDENT_PERSONA,
        style: "exam_trap_focused",
      });
      expect(promptTrap).toContain("common student traps");
      expect(promptTrap).toContain("examiner trick points");

      const promptConcise = buildPersonaSystemPrompt({
        ...DEFAULT_STUDENT_PERSONA,
        style: "concise_key_points",
      });
      expect(promptConcise).toContain("bullet points");
      expect(promptConcise).toContain("cheat-sheets");
    });

    it("supports all source modes", () => {
      const promptWeb = buildPersonaSystemPrompt({
        ...DEFAULT_STUDENT_PERSONA,
        sourceMode: "web",
      });
      expect(promptWeb).toContain("Web Intelligence");

      const promptNotebook = buildPersonaSystemPrompt({
        ...DEFAULT_STUDENT_PERSONA,
        sourceMode: "notebook",
      });
      expect(promptNotebook).toContain("Student Notebook Only");

      const promptHybrid = buildPersonaSystemPrompt({
        ...DEFAULT_STUDENT_PERSONA,
        sourceMode: "hybrid",
      });
      expect(promptHybrid).toContain("Hybrid (Notebook + Web Intelligence)");
    });

    it("injects subject-specific instructions when subject is provided", () => {
      const prompt = buildPersonaSystemPrompt(DEFAULT_STUDENT_PERSONA, "Organic Chemistry");
      expect(prompt).toContain("## Subject Context (Organic Chemistry):");
      expect(prompt).toContain("Organic Chemistry");
    });

    it("fences and includes custom instructions safely", () => {
      const personaWithCustom: StudentPersonaPreferences = {
        ...DEFAULT_STUDENT_PERSONA,
        customInstructions: "Always write LaTeX for chemical equations and mention delta G.",
      };
      const prompt = buildPersonaSystemPrompt(personaWithCustom);
      expect(prompt).toContain("## Student Custom Directives:");
      expect(prompt).toContain("Always write LaTeX for chemical equations and mention delta G.");
      expect(prompt).toContain('"""');
    });
  });
});
