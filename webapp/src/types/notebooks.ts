export type SourceType =
  "pdf" | "note" | "web" | "textbook" | "syllabus" | "past_paper";

export interface NotebookSource {
  id: string;
  title: string;
  type: SourceType;
  content: string;
  url?: string;
  selected: boolean;
  uploadedAt: string;
}

export type ArtifactType =
  "feynman" | "cheat_sheet" | "flashcards" | "quiz" | "summary" | "diagram";

export interface NotebookArtifact {
  id: string;
  type: ArtifactType;
  title: string;
  content: string;
  summary?: string;
  createdAt: string;
}

export interface GroundedCitation {
  sourceId: string;
  sourceTitle: string;
  snippet: string;
}

export interface GroundedChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: GroundedCitation[];
  timestamp: string;
}

export interface Notebook {
  id: string;
  title: string;
  subject: string;
  color: string;
  description?: string;
  sources: NotebookSource[];
  notes: string;
  chatHistory: GroundedChatMessage[];
  artifacts: NotebookArtifact[];
  createdAt: string;
  updatedAt: string;
}
