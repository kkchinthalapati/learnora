import { useCallback, useState } from "react";
import type {
  Notebook,
  NotebookSource,
  NotebookArtifact,
  GroundedChatMessage,
} from "../types/notebooks";
import { Storage } from "../lib/storage";

const NOTEBOOKS_STORAGE_KEY = "learnora_notebooks_v1";

const INITIAL_DEMO_NOTEBOOKS: Notebook[] = [
  {
    id: "nb-maths-theorems",
    title: "Grade 9 Mathematics: Geometry & Circle Theorems",
    subject: "Mathematics",
    color: "#4A90E2",
    description: "Core theorems, tangent properties, circle chords and proof strategies.",
    createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    sources: [
      {
        id: "src-1",
        title: "NCERT Chapter 10: Circles & Proofs.pdf",
        type: "pdf",
        content: `Theorem 1 (Equal Chords Subtend Equal Angles): Equal chords of a circle subtend equal angles at the centre.
Theorem 2 (Perpendicular from Centre): The line drawn from the centre of a circle to bisect a chord is perpendicular to the chord.
Theorem 3 (Angle at Centre is Double): The angle subtended by an arc at the centre is double the angle subtended by it at any point on the remaining part of the circle.
Theorem 4 (Angles in Same Segment): Angles in the same segment of a circle are equal.
Cyclic Quadrilateral: The sum of either pair of opposite angles of a cyclic quadrilateral is 180 degrees.`,
        selected: true,
        uploadedAt: new Date(Date.now() - 3600000 * 48).toISOString(),
      },
      {
        id: "src-2",
        title: "Class Revision Notes - Tangents & Secants",
        type: "note",
        content: `A tangent to a circle is perpendicular to the radius through the point of contact.
The lengths of tangents drawn from an external point to a circle are equal (PA = PB).
Proof uses RHS congruence on triangles OPA and OPB where OP is common hypotenuse and OA = OB (radii).`,
        selected: true,
        uploadedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
      },
    ],
    notes: `<h2>Circle Theorems Revision</h2><p>Remember that when proving congruency for circle chords, joining the centre <strong>O</strong> to chord endpoints forms isosceles triangles with radius <em>r</em>.</p><ul><li>Angle at the centre is always 2× angle at circumference.</li><li>Opposite angles in a cyclic quadrilateral sum to 180°.</li></ul>`,
    chatHistory: [
      {
        id: "msg-1",
        role: "assistant",
        content: "Welcome to your Mathematics Notebook! Ask any question grounded in your 2 circle theorem sources or generate a Feynman breakdown on the right.",
        timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
      },
    ],
    artifacts: [
      {
        id: "art-1",
        type: "cheat_sheet",
        title: "Circle Theorems High-Yield Cheat Sheet",
        content: `### High-Yield Circle Theorems Cheat Sheet\n\n1. **Equal Chords**: Subtend equal angles at centre.\n2. **Angle at Centre**: Double the angle at the circumference ($2\\theta$ vs $\\theta$).\n3. **Cyclic Quadrilateral**: Opposite angles sum to $180^\\circ$.\n4. **Tangents from External Point**: Equal in length ($PA = PB$) and perpendicular to radius at point of contact.`,
        summary: "Essential equations and theorem rules for quick pre-exam review.",
        createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      },
    ],
  },
  {
    id: "nb-biology-cells",
    title: "A-Level Biology: Cell Structure & Transport",
    subject: "Biology",
    color: "#4AE283",
    description: "Organelles, fluid mosaic membrane, osmosis, active transport, and surface area ratios.",
    createdAt: new Date(Date.now() - 3600000 * 72).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    sources: [
      {
        id: "src-bio-1",
        title: "Eukaryotic vs Prokaryotic Cell Summary.pdf",
        type: "pdf",
        content: `Prokaryotes: 70S ribosomes, murein cell wall, circular plasmid DNA, no membrane-bound organelles.
Eukaryotes: 80S ribosomes, cellulose/chitin cell wall (plants/fungi), linear DNA with histones, mitochondria, ER, Golgi apparatus.`,
        selected: true,
        uploadedAt: new Date(Date.now() - 3600000 * 72).toISOString(),
      },
    ],
    notes: `<h2>Cell Membrane & Osmosis</h2><p>Phospholipid bilayer consists of hydrophilic phosphate heads and hydrophobic fatty acid tails.</p>`,
    chatHistory: [],
    artifacts: [],
  },
];

const NOTEBOOKS_SEEDED_KEY = "learnora_notebooks_seeded_v1";

function loadNotebooks(): Notebook[] {
  const isSeeded = Storage.get<boolean>(NOTEBOOKS_SEEDED_KEY, false);
  if (!isSeeded) {
    Storage.set(NOTEBOOKS_STORAGE_KEY, INITIAL_DEMO_NOTEBOOKS);
    Storage.set(NOTEBOOKS_SEEDED_KEY, true);
    return INITIAL_DEMO_NOTEBOOKS;
  }
  const stored = Storage.get<Notebook[]>(NOTEBOOKS_STORAGE_KEY, []);
  return Array.isArray(stored) ? stored : [];
}

export function useNotebooks() {
  const [notebooks, setNotebooks] = useState<Notebook[]>(() => loadNotebooks());

  const saveAll = useCallback((nextNotebooks: Notebook[]) => {
    setNotebooks(nextNotebooks);
    Storage.set(NOTEBOOKS_STORAGE_KEY, nextNotebooks);
  }, []);

  const createNotebook = useCallback(
    (data: { title: string; subject: string; color?: string; description?: string }): Notebook => {
      const newNotebook: Notebook = {
        id: `nb-${Date.now()}`,
        title: data.title.trim() || "Untitled Notebook",
        subject: data.subject.trim() || "General Study",
        color: data.color || "#4A90E2",
        description: data.description?.trim() || "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sources: [],
        notes: "<h2>Study Notes</h2><p>Start writing notes or upload study materials on the left.</p>",
        chatHistory: [],
        artifacts: [],
      };
      const updated = [newNotebook, ...notebooks];
      saveAll(updated);
      return newNotebook;
    },
    [notebooks, saveAll],
  );

  const deleteNotebook = useCallback(
    (id: string) => {
      const updated = notebooks.filter((nb) => nb.id !== id);
      saveAll(updated);
    },
    [notebooks, saveAll],
  );

  const updateNotebook = useCallback(
    (id: string, partial: Partial<Notebook>) => {
      const updated = notebooks.map((nb) => {
        if (nb.id !== id) return nb;
        return {
          ...nb,
          ...partial,
          updatedAt: new Date().toISOString(),
        };
      });
      saveAll(updated);
    },
    [notebooks, saveAll],
  );

  return {
    notebooks,
    createNotebook,
    deleteNotebook,
    updateNotebook,
  };
}

export function useNotebook(notebookId: string) {
  const { notebooks, updateNotebook } = useNotebooks();
  const notebook = notebooks.find((nb) => nb.id === notebookId) ?? null;

  const updateTitle = useCallback(
    (title: string) => {
      if (!notebook) return;
      updateNotebook(notebook.id, { title });
    },
    [notebook, updateNotebook],
  );

  const updateNotes = useCallback(
    (notes: string) => {
      if (!notebook) return;
      updateNotebook(notebook.id, { notes });
    },
    [notebook, updateNotebook],
  );

  const addSource = useCallback(
    (sourceData: Omit<NotebookSource, "id" | "uploadedAt" | "selected">) => {
      if (!notebook) return;
      const newSource: NotebookSource = {
        ...sourceData,
        id: `src-${Date.now()}`,
        selected: true,
        uploadedAt: new Date().toISOString(),
      };
      updateNotebook(notebook.id, {
        sources: [...notebook.sources, newSource],
      });
    },
    [notebook, updateNotebook],
  );

  const toggleSource = useCallback(
    (sourceId: string) => {
      if (!notebook) return;
      const updatedSources = notebook.sources.map((s) =>
        s.id === sourceId ? { ...s, selected: !s.selected } : s,
      );
      updateNotebook(notebook.id, { sources: updatedSources });
    },
    [notebook, updateNotebook],
  );

  const removeSource = useCallback(
    (sourceId: string) => {
      if (!notebook) return;
      const updatedSources = notebook.sources.filter((s) => s.id !== sourceId);
      updateNotebook(notebook.id, { sources: updatedSources });
    },
    [notebook, updateNotebook],
  );

  const addArtifact = useCallback(
    (artifactData: Omit<NotebookArtifact, "id" | "createdAt">) => {
      if (!notebook) return;
      const newArtifact: NotebookArtifact = {
        ...artifactData,
        id: `art-${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
      updateNotebook(notebook.id, {
        artifacts: [newArtifact, ...notebook.artifacts],
      });
    },
    [notebook, updateNotebook],
  );

  const removeArtifact = useCallback(
    (artifactId: string) => {
      if (!notebook) return;
      const updatedArtifacts = notebook.artifacts.filter((a) => a.id !== artifactId);
      updateNotebook(notebook.id, { artifacts: updatedArtifacts });
    },
    [notebook, updateNotebook],
  );

  const addChatMessage = useCallback(
    (message: Omit<GroundedChatMessage, "id" | "timestamp">) => {
      if (!notebook) return;
      const newMsg: GroundedChatMessage = {
        ...message,
        id: `msg-${Date.now()}`,
        timestamp: new Date().toISOString(),
      };
      updateNotebook(notebook.id, {
        chatHistory: [...notebook.chatHistory, newMsg],
      });
    },
    [notebook, updateNotebook],
  );

  const clearChat = useCallback(() => {
    if (!notebook) return;
    updateNotebook(notebook.id, { chatHistory: [] });
  }, [notebook, updateNotebook]);

  return {
    notebook,
    updateTitle,
    updateNotes,
    addSource,
    toggleSource,
    removeSource,
    addArtifact,
    removeArtifact,
    addChatMessage,
    clearChat,
  };
}
