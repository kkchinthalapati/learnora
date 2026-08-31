import type { Folder, Material, Note, Flashcard, FlashcardDeck, Quiz, QuizAttempt, Exam } from "../api/types";
import { parseStoredQuestions } from "../views/quiz/quizMeta";
import { daysUntil } from "../views/dashboard/analytics";

export type RelationshipType = "depends_on" | "related_to" | "part_of";

export interface KnowledgeGapDetails {
  gapScore: number; // 0 to 100 (higher = more urgent gap)
  quizDeficit: number; // contribution from low quiz scores (0-100)
  overdueCardsCount: number;
  examProximityDays: number | null;
  examName: string | null;
  urgency: "critical" | "high" | "medium" | "low" | "none";
  remediationReasons: string[];
}

export interface ConceptNode {
  id: string;
  label: string;
  folderId: string | null;
  folderName: string;
  folderColor: string;
  masteryScore: number; // 0 to 100
  isKnowledgeGap: boolean;
  gapScore?: number; // 0 to 100
  gapDetails?: KnowledgeGapDetails;
  notesCount: number;
  flashcardsCount: number;
  quizzesCount: number;
  materialsCount: number;
  overdueCardsCount?: number;
  examProximityDays?: number | null;
  degree: number;
  x: number;
  y: number;
  radius: number;
  noteSnippets: string[];
  relatedConcepts: string[];
  prerequisites: string[]; // Concept IDs this node depends on (must learn first)
  dependents: string[]; // Concept IDs that depend on this node (unlocked next)
  materialId?: string | null;
  deckId?: string | null;
  quizId?: string | null;
}

export interface ConceptEdge {
  id: string;
  source: string; // concept id
  target: string; // concept id
  relationship: RelationshipType;
  weight: number; // 1 to 5
}

export interface ConceptGraphStats {
  totalConcepts: number;
  totalEdges: number;
  knowledgeGapsCount: number;
  averageMastery: number;
  prerequisitesCount?: number;
  criticalGapsCount?: number;
}

export interface ConceptGraphData {
  nodes: ConceptNode[];
  edges: ConceptEdge[];
  stats: ConceptGraphStats;
}

export interface GraphFilterOptions {
  folderId?: string | "all" | null;
  searchQuery?: string;
  knowledgeGapsOnly?: boolean;
  prerequisitesOnly?: boolean;
  relationshipType?: RelationshipType | "all";
}

export interface BuildGraphInput {
  folders?: Folder[];
  materials?: Material[];
  notes?: Note[];
  flashcards?: Flashcard[];
  decks?: FlashcardDeck[];
  quizzes?: Quiz[];
  quizAttempts?: QuizAttempt[];
  exams?: Exam[];
  now?: Date;
}

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 800;

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be",
  "been", "being", "have", "has", "had", "do", "does", "did", "to", "from",
  "in", "out", "on", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "any",
  "both", "each", "few", "more", "most", "other", "some", "such", "no",
  "nor", "not", "only", "own", "same", "so", "than", "too", "very", "can",
  "will", "just", "should", "now", "what", "which", "who", "whom", "this",
  "that", "these", "those", "am", "it", "its", "they", "them", "their",
  "we", "our", "you", "your", "he", "him", "his", "she", "her", "i", "me",
  "my", "true", "false", "none", "overview", "summary", "definition",
  "concept", "question", "answer", "chapter", "section", "part", "example",
  "notes", "topic", "topics", "key", "point", "points", "step", "steps",
  "into", "with", "about", "against", "between", "through", "during", "before",
  "after", "above", "below", "up", "down", "for", "of", "off", "as", "by",
]);

/** Normalize raw string into clean Concept Title Case */
export function normalizeConceptLabel(raw: string): string | null {
  if (!raw) return null;

  let cleaned = raw
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*`_~>[\]()]/g, " ")
    .replace(/^[•\-–—\d.)\s:]+/, "")
    .replace(/[:;?!,.]+$/, "")
    .trim();

  if (cleaned.length < 2 || cleaned.length > 50) return null;
  if (/^\d+$/.test(cleaned)) return null;

  const lower = cleaned.toLowerCase();
  if (STOP_WORDS.has(lower)) return null;

  // Handle acronyms (e.g. DNA, ATP, RNA, CSS, HTML, CPU, AWS)
  if (/^[A-Z0-9-]{2,6}$/.test(cleaned)) {
    return cleaned;
  }

  // Convert to Title Case
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 5) return null;

  const titleCased = words
    .map((word, idx) => {
      const wLower = word.toLowerCase();
      if (idx > 0 && STOP_WORDS.has(wLower)) {
        return wLower;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");

  return titleCased;
}

interface RawConceptCollector {
  id: string;
  label: string;
  folderId: string | null;
  materialId?: string | null;
  deckId?: string | null;
  quizId?: string | null;
  notesCount: number;
  flashcardsCount: number;
  quizzesCount: number;
  materialsCount: number;
  overdueFlashcardsCount: number;
  noteSnippets: Set<string>;
  flashcardMasteryList: number[];
  quizScoreList: number[];
  isWeakTopic: boolean;
  coOccurrences: Map<string, { count: number; hint: RelationshipType }>;
  prerequisites: Set<string>; // Concepts this node depends on
  dependents: Set<string>; // Concepts that depend on this node
}

/** Stable, collision-free node id. Distinct keys ("atp energy" vs
 *  "atp-energy") collapse to the same slug, so a base-36 hash of the full key
 *  is appended — duplicate ids would corrupt edge dedup and React keys. */
function conceptIdFor(key: string): string {
  const slug = key.replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "") || "x";
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return `concept-${slug}-${hash.toString(36)}`;
}

function getOrInitConcept(
  map: Map<string, RawConceptCollector>,
  label: string,
  folderId: string | null = null,
): RawConceptCollector {
  const norm = normalizeConceptLabel(label);
  const key = (norm || label).toLowerCase();

  let existing = map.get(key);
  if (!existing) {
    const id = conceptIdFor(key);
    existing = {
      id,
      label: norm || label,
      folderId,
      notesCount: 0,
      flashcardsCount: 0,
      quizzesCount: 0,
      materialsCount: 0,
      overdueFlashcardsCount: 0,
      noteSnippets: new Set<string>(),
      flashcardMasteryList: [],
      quizScoreList: [],
      isWeakTopic: false,
      coOccurrences: new Map(),
      prerequisites: new Set<string>(),
      dependents: new Set<string>(),
    };
    map.set(key, existing);
  } else if (!existing.folderId && folderId) {
    existing.folderId = folderId;
  }

  return existing;
}

function linkConcepts(
  c1: RawConceptCollector,
  c2: RawConceptCollector,
  hint: RelationshipType = "related_to",
) {
  if (c1.id === c2.id) return;

  const k1 = c2.id;
  const current1 = c1.coOccurrences.get(k1) || { count: 0, hint };
  current1.count += 1;
  if (hint !== "related_to") current1.hint = hint;
  c1.coOccurrences.set(k1, current1);

  const k2 = c1.id;
  const current2 = c2.coOccurrences.get(k2) || { count: 0, hint };
  current2.count += 1;
  if (hint !== "related_to") current2.hint = hint;
  c2.coOccurrences.set(k2, current2);

  if (hint === "depends_on") {
    // c1 depends on c2: c2 is prerequisite for c1
    c1.prerequisites.add(c2.id);
    c2.dependents.add(c1.id);
  } else if (hint === "part_of") {
    // c1 is part of c2 (c2 is parent topic)
    c1.prerequisites.add(c2.id);
    c2.dependents.add(c1.id);
  }
}

/** Mastery (0-100) of one flashcard from its SM-2 state: ease drives the
 *  base, interval the retention bonus. Shared by the deck-card and
 *  orphan-card paths, which used to drift apart and score the same card
 *  differently depending on whether its deck row had loaded. */
function flashcardMastery(card: Pick<Flashcard, "ease_factor" | "srs_interval">): number {
  const ease = card.ease_factor || 2.5;
  const interval = card.srs_interval || 0;
  return Math.min(
    100,
    Math.max(10, Math.round(((ease - 1.3) / 1.7) * 55 + Math.min(interval * 9, 45))),
  );
}

interface ParsedNoteEntity {
  term: string;
  snippet: string;
  isHeading?: boolean;
  headingLevel?: number;
  isDef?: boolean;
  prerequisiteTerms?: string[];
  dependsOnTerms?: string[];
  componentTerms?: string[];
}

/** Extracts concepts, snippets, and prerequisite/hierarchical relationships from notes */
function parseNotesContent(
  text: string,
): ParsedNoteEntity[] {
  if (!text) return [];
  const results: ParsedNoteEntity[] = [];

  const lines = text.split(/\r?\n/);
  let currentHeadingTerm: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 1. Headings (e.g. ## Enzymes)
    const headingMatch = trimmed.match(/^(#{1,4})\s+([^\n#]+)/);
    if (headingMatch && headingMatch[2]) {
      const headingTerm = normalizeConceptLabel(headingMatch[2]);
      if (headingTerm) {
        currentHeadingTerm = headingTerm;
        results.push({
          term: headingTerm,
          snippet: trimmed,
          isHeading: true,
          headingLevel: headingMatch[1].length,
        });
      }
    }

    // 2. Prerequisite keyword markers (e.g. "Prerequisites: Activation Energy, Catalysts" or "Requires: Cell Membrane")
    const prereqMatch = trimmed.match(/(?:prerequisite[s]?|requires|prereq[s]?|prior knowledge|foundation|depends on)[:\s]+([^\n;.]+)/i);
    if (prereqMatch && prereqMatch[1]) {
      const prereqParts = prereqMatch[1]
        .split(/[,&]/)
        .map((p) => normalizeConceptLabel(p))
        .filter((t): t is string => Boolean(t));

      if (prereqParts.length > 0 && currentHeadingTerm) {
        results.push({
          term: currentHeadingTerm,
          snippet: trimmed,
          dependsOnTerms: prereqParts,
        });
      }
    }

    // 3. Inline dependency sentences: "X is a prerequisite for Y" -> Y depends on X
    const isPrereqForMatch = trimmed.match(/([A-Za-z0-9\s-]{2,40})\s+(?:is a prerequisite (?:for|to)|is required for|leads into|is necessary for)\s+([A-Za-z0-9\s-]{2,40})/i);
    if (isPrereqForMatch && isPrereqForMatch[1] && isPrereqForMatch[2]) {
      const prereqTerm = normalizeConceptLabel(isPrereqForMatch[1]);
      const targetTerm = normalizeConceptLabel(isPrereqForMatch[2]);
      if (prereqTerm && targetTerm) {
        results.push({
          term: targetTerm,
          snippet: trimmed,
          dependsOnTerms: [prereqTerm],
        });
      }
    }

    // 4. Inline dependency sentences: "Y depends on X" or "Y builds upon X" -> Y depends on X
    const dependsOnMatch = trimmed.match(/([A-Za-z0-9\s-]{2,40})\s+(?:depends on|requires|builds upon|builds on|is based on|relies on)\s+([A-Za-z0-9\s-]{2,40})/i);
    if (dependsOnMatch && dependsOnMatch[1] && dependsOnMatch[2]) {
      const subjectTerm = normalizeConceptLabel(dependsOnMatch[1]);
      const prereqTerm = normalizeConceptLabel(dependsOnMatch[2]);
      if (subjectTerm && prereqTerm) {
        results.push({
          term: subjectTerm,
          snippet: trimmed,
          dependsOnTerms: [prereqTerm],
        });
      }
    }

    // 5. Component sentences: "X is part of Y" or "X is a component of Y"
    const partOfMatch = trimmed.match(/([A-Za-z0-9\s-]{2,40})\s+(?:is part of|is a component of|is a type of|is a subtopic of|is composed of)\s+([A-Za-z0-9\s-]{2,40})/i);
    if (partOfMatch && partOfMatch[1] && partOfMatch[2]) {
      const componentTerm = normalizeConceptLabel(partOfMatch[1]);
      const parentTerm = normalizeConceptLabel(partOfMatch[2]);
      if (componentTerm && parentTerm) {
        results.push({
          term: componentTerm,
          snippet: trimmed,
          componentTerms: [parentTerm],
        });
      }
    }

    // 6. Bold keywords (e.g. **activation energy** or <b>...</b>)
    const boldMatches = trimmed.matchAll(/(?:\*\*|__)(.+?)(?:\*\*|__)|<(?:b|strong|h[1-6]|mark)>([^<]+)<\/(?:b|strong|h[1-6]|mark)>/g);
    for (const match of boldMatches) {
      const rawTerm = match[1] || match[2];
      const term = normalizeConceptLabel(rawTerm);
      if (term) {
        results.push({ term, snippet: trimmed });
      }
    }

    // 7. Bullet definitions (e.g. - Active site: specific to the substrate)
    const defMatch = trimmed.match(/^[-*•]\s*([A-Za-z0-9\s-]{2,40}):\s*(.+)$/);
    if (defMatch && defMatch[1]) {
      const defTerm = normalizeConceptLabel(defMatch[1]);
      if (defTerm) {
        results.push({ term: defTerm, snippet: trimmed, isDef: true });
      }
    }

    // 8. Definition keywords in sentences
    const sentenceDef = trimmed.match(/(?:is defined as|refers to|means|is the process of|is a type of)\s+([A-Za-z0-9\s-]{3,40})/i);
    if (sentenceDef && sentenceDef[1]) {
      const term = normalizeConceptLabel(sentenceDef[1]);
      if (term) {
        results.push({ term, snippet: trimmed, isDef: true });
      }
    }
  }

  return results;
}

/** Extracts question terms from quiz questions */
function parseQuestionConcepts(questionText: string, topic?: string): string[] {
  const terms: string[] = [];
  if (topic) {
    const normTopic = normalizeConceptLabel(topic);
    if (normTopic) terms.push(normTopic);
  }

  // Look for bold or quoted keywords
  const quoteMatches = questionText.matchAll(/["']([^"']{3,35})["']|(?:\*\*|__)(.+?)(?:\*\*|__)/g);
  for (const qm of quoteMatches) {
    const raw = qm[1] || qm[2];
    const norm = normalizeConceptLabel(raw);
    if (norm) terms.push(norm);
  }

  // Look for question subject (e.g. "What is photosynthesis?" -> "Photosynthesis")
  const whatIsMatch = questionText.match(/(?:what is|define|explain|how does)\s+([A-Za-z0-9\s-]{3,35})\b/i);
  if (whatIsMatch && whatIsMatch[1]) {
    const norm = normalizeConceptLabel(whatIsMatch[1]);
    if (norm) terms.push(norm);
  }

  return terms;
}

/**
 * Computes multi-factor knowledge gap details incorporating low quiz scores,
 * overdue flashcards, and exam proximity.
 */
export function computeKnowledgeGapDetails(
  collector: RawConceptCollector,
  masteryScore: number,
  exams: Exam[] = [],
  now: Date = new Date(),
): KnowledgeGapDetails {
  const reasons: string[] = [];
  const hasCards = collector.flashcardMasteryList.length > 0;
  const hasQuizzes = collector.quizScoreList.length > 0;
  const hasEvidence = hasCards || hasQuizzes;

  let quizAvg: number | null = null;
  if (hasQuizzes) {
    quizAvg = Math.round(
      collector.quizScoreList.reduce((a, b) => a + b, 0) / collector.quizScoreList.length,
    );
  }

  let quizDeficit = 0;
  if (quizAvg !== null && quizAvg < 60) {
    quizDeficit = Math.round(60 - quizAvg);
    reasons.push(`Your quiz average here is ${quizAvg}%`);
  } else if (collector.isWeakTopic) {
    quizDeficit = 30;
    reasons.push("This came up as a weak spot in your recent quizzes");
  }

  const overdueCardsCount = collector.overdueFlashcardsCount || 0;
  if (overdueCardsCount > 0) {
    reasons.push(`${overdueCardsCount} flashcard${overdueCardsCount > 1 ? "s are" : " is"} overdue`);
  }

  let examProximityDays: number | null = null;
  let nearestExamName: string | null = null;

  const validExams = exams.filter((e) => {
    if (!e.exam_date || e.status === "Completed") return false;
    const du = daysUntil(e.exam_date, now);
    return du >= 0;
  });

  if (validExams.length > 0) {
    const sortedExams = [...validExams].sort(
      (a, b) => daysUntil(a.exam_date, now) - daysUntil(b.exam_date, now),
    );
    const closestExam = sortedExams[0];
    examProximityDays = daysUntil(closestExam.exam_date, now);
    nearestExamName = closestExam.exam_name;

    if (examProximityDays <= 3) {
      reasons.push(`${closestExam.exam_name} is ${examProximityDays === 0 ? "today" : `in ${examProximityDays} day${examProximityDays === 1 ? "" : "s"}`}`);
    } else if (examProximityDays <= 7) {
      reasons.push(`${closestExam.exam_name} is in ${examProximityDays} days`);
    }
  }

  // Calculate composite gap score (0 to 100)
  let rawGap = 0;
  if (hasEvidence || collector.isWeakTopic || overdueCardsCount > 0) {
    // 1. Mastery deficit (0 to 45 pts)
    if (masteryScore < 60) {
      rawGap += Math.round(((60 - masteryScore) / 60) * 45);
    }

    // 2. Quiz / Weak topic deficit (0 to 25 pts)
    if (collector.isWeakTopic) {
      rawGap += 25;
    } else if (quizDeficit > 0) {
      rawGap += Math.min(20, Math.round(quizDeficit * 0.5));
    }

    // 3. Overdue cards (0 to 20 pts)
    if (overdueCardsCount > 0) {
      rawGap += Math.min(20, overdueCardsCount * 8);
    }

    // 4. Exam proximity boost (0 to 20 pts)
    if (examProximityDays !== null) {
      if (examProximityDays <= 3) rawGap += 20;
      else if (examProximityDays <= 7) rawGap += 12;
      else if (examProximityDays <= 14) rawGap += 6;
    }
  }

  const gapScore = Math.min(100, Math.max(0, rawGap));

  let urgency: KnowledgeGapDetails["urgency"] = "none";
  if (gapScore >= 70 || (gapScore >= 50 && examProximityDays !== null && examProximityDays <= 3)) {
    urgency = "critical";
  } else if (gapScore >= 50) {
    urgency = "high";
  } else if (gapScore >= 30) {
    urgency = "medium";
  } else if (gapScore > 0) {
    urgency = "low";
  }

  return {
    gapScore,
    quizDeficit,
    overdueCardsCount,
    examProximityDays,
    examName: nearestExamName,
    urgency,
    remediationReasons: reasons,
  };
}

/** Main builder: extracts concepts from all Learnora study artifacts and computes graph layout */
export function buildConceptGraph(input: BuildGraphInput): ConceptGraphData {
  const folders = input.folders || [];
  const materials = input.materials || [];
  const notes = input.notes || [];
  const flashcards = input.flashcards || [];
  const decks = input.decks || [];
  const quizzes = input.quizzes || [];
  const quizAttempts = input.quizAttempts || [];
  const exams = input.exams || [];
  const now = input.now || new Date();

  const folderMap = new Map<string, Folder>();
  folders.forEach((f) => folderMap.set(f.id, f));

  const materialFolderMap = new Map<string, string | null>();
  materials.forEach((m) => materialFolderMap.set(m.id, m.folder_id));

  const deckFolderMap = new Map<string, string | null>();
  decks.forEach((d) => deckFolderMap.set(d.id, d.folder_id));

  const deckMap = new Map<string, FlashcardDeck>();
  decks.forEach((d) => deckMap.set(d.id, d));

  const conceptCollectors = new Map<string, RawConceptCollector>();

  // Set of weak topics from quiz attempts
  const weakTopicsSet = new Set<string>();
  quizAttempts.forEach((attempt) => {
    (attempt.weak_topics || []).forEach((t) => {
      const norm = normalizeConceptLabel(t);
      if (norm) weakTopicsSet.add(norm.toLowerCase());
    });
  });

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // 1. Process Materials
  for (const mat of materials) {
    const folderId = mat.folder_id;
    const titleConcepts = mat.title
      .split(/[-–—,:&|/]/)
      .map((part) => normalizeConceptLabel(part))
      .filter((t): t is string => Boolean(t));

    const collectors: RawConceptCollector[] = [];
    for (const term of titleConcepts) {
      const collector = getOrInitConcept(conceptCollectors, term, folderId);
      collector.materialsCount += 1;
      collector.materialId = mat.id;
      collectors.push(collector);
    }

    // Link concepts in same material title
    for (let i = 0; i < collectors.length; i++) {
      for (let j = i + 1; j < collectors.length; j++) {
        linkConcepts(collectors[i], collectors[j], "part_of");
      }
    }
  }

  // 2. Process Notes
  for (const note of notes) {
    const folderId = note.material_id ? materialFolderMap.get(note.material_id) || null : null;
    const content = `${note.markdown_content || ""}\n${note.html_content || ""}`;
    const parsed = parseNotesContent(content);

    const noteCollectors: RawConceptCollector[] = [];
    for (const item of parsed) {
      const collector = getOrInitConcept(conceptCollectors, item.term, folderId);
      collector.notesCount += 1;
      if (note.material_id) collector.materialId = note.material_id;
      if (item.snippet) collector.noteSnippets.add(item.snippet.slice(0, 180));
      noteCollectors.push(collector);

      // Connect explicit prerequisites found in note
      if (item.dependsOnTerms) {
        for (const prereqTerm of item.dependsOnTerms) {
          const prereqCollector = getOrInitConcept(conceptCollectors, prereqTerm, folderId);
          linkConcepts(collector, prereqCollector, "depends_on");
        }
      }

      // Connect subcomponents found in note
      if (item.componentTerms) {
        for (const parentTerm of item.componentTerms) {
          const parentCollector = getOrInitConcept(conceptCollectors, parentTerm, folderId);
          linkConcepts(collector, parentCollector, "part_of");
        }
      }
    }

    // Link co-occurring concepts in the same note
    for (let i = 0; i < noteCollectors.length; i++) {
      for (let j = i + 1; j < noteCollectors.length; j++) {
        const c1 = noteCollectors[i];
        const c2 = noteCollectors[j];
        const hint: RelationshipType = parsed[i]?.isHeading ? "part_of" : "related_to";
        linkConcepts(c1, c2, hint);
      }
    }
  }

  // 3. Process Flashcards & Decks
  for (const deck of decks) {
    const deckFolder = deck.folder_id;
    const deckTerm = normalizeConceptLabel(deck.title);
    let deckCollector: RawConceptCollector | null = null;
    if (deckTerm) {
      deckCollector = getOrInitConcept(conceptCollectors, deckTerm, deckFolder);
      deckCollector.deckId = deck.id;
    }

    const deckCards = flashcards.filter((c) => c.deck_id === deck.id);
    for (const card of deckCards) {
      const cardMastery = flashcardMastery(card);
      const isCardOverdue = Boolean(
        (card.next_review_date && card.next_review_date.slice(0, 10) < todayStr) ||
        (card.srs_interval === 0 && card.ease_factor < 2.0),
      );

      const frontTerms = parseQuestionConcepts(card.front);
      const backTerms = parseQuestionConcepts(card.back);
      const cardTerms = [...new Set([...frontTerms, ...backTerms])];

      const cardCollectors: RawConceptCollector[] = [];
      if (deckCollector) cardCollectors.push(deckCollector);

      for (const term of cardTerms) {
        const collector = getOrInitConcept(conceptCollectors, term, deckFolder);
        collector.flashcardsCount += 1;
        collector.deckId = deck.id;
        collector.flashcardMasteryList.push(cardMastery);
        if (isCardOverdue) collector.overdueFlashcardsCount += 1;
        cardCollectors.push(collector);
      }

      if (deckCollector) {
        deckCollector.flashcardsCount += 1;
        deckCollector.flashcardMasteryList.push(cardMastery);
        if (isCardOverdue) deckCollector.overdueFlashcardsCount += 1;
      }

      // Link card concepts
      for (let i = 0; i < cardCollectors.length; i++) {
        for (let j = i + 1; j < cardCollectors.length; j++) {
          linkConcepts(cardCollectors[i], cardCollectors[j], "related_to");
        }
      }
    }
  }

  // Catch flashcards not attached to a loaded deck
  const orphanCards = flashcards.filter((c) => !c.deck_id || !deckMap.has(c.deck_id));
  for (const card of orphanCards) {
    const terms = parseQuestionConcepts(card.front);
    const isCardOverdue = Boolean(
      (card.next_review_date && card.next_review_date.slice(0, 10) < todayStr) ||
      (card.srs_interval === 0 && card.ease_factor < 2.0),
    );
    for (const term of terms) {
      const collector = getOrInitConcept(conceptCollectors, term, null);
      collector.flashcardsCount += 1;
      collector.flashcardMasteryList.push(flashcardMastery(card));
      if (isCardOverdue) collector.overdueFlashcardsCount += 1;
    }
  }

  // 4. Process Quizzes & Attempts
  for (const quiz of quizzes) {
    const folderId = quiz.folder_id || (quiz.material_id ? materialFolderMap.get(quiz.material_id) || null : null);
    const questions = parseStoredQuestions(quiz.questions_json);

    // Calculate score percentage from attempts on this quiz
    const attempts = quizAttempts.filter((a) => a.quiz_id === quiz.id);
    const avgScore = attempts.length
      ? attempts.reduce((acc, a) => acc + (a.total > 0 ? (a.score / a.total) * 100 : 50), 0) / attempts.length
      : null;

    const quizCollectors: RawConceptCollector[] = [];

    // Quiz title concept
    const quizTitleTerm = normalizeConceptLabel(quiz.title);
    if (quizTitleTerm) {
      const qc = getOrInitConcept(conceptCollectors, quizTitleTerm, folderId);
      qc.quizzesCount += 1;
      qc.quizId = quiz.id;
      if (avgScore !== null) qc.quizScoreList.push(avgScore);
      quizCollectors.push(qc);
    }

    for (const q of questions) {
      const qTerms = parseQuestionConcepts(q.question, q.topic);
      for (const term of qTerms) {
        const collector = getOrInitConcept(conceptCollectors, term, folderId);
        collector.quizzesCount += 1;
        collector.quizId = quiz.id;
        if (avgScore !== null) collector.quizScoreList.push(avgScore);
        if (weakTopicsSet.has(collector.label.toLowerCase())) {
          collector.isWeakTopic = true;
        }
        quizCollectors.push(collector);
      }
    }

    // Link quiz concepts
    for (let i = 0; i < quizCollectors.length; i++) {
      for (let j = i + 1; j < quizCollectors.length; j++) {
        linkConcepts(quizCollectors[i], quizCollectors[j], "related_to");
      }
    }
  }

  // Compute final node mastery, gap metrics, and build nodes
  const nodes: ConceptNode[] = [];
  const edgeMap = new Map<string, ConceptEdge>();

  for (const collector of conceptCollectors.values()) {
    const folder = collector.folderId ? folderMap.get(collector.folderId) : undefined;
    const folderName = folder ? folder.name : "General knowledge";
    const folderColor = folder ? folder.color : "#0f766e";

    // Compute Mastery Score (0 - 100)
    let mastery = 50;
    const hasCards = collector.flashcardMasteryList.length > 0;
    const hasQuizzes = collector.quizScoreList.length > 0;

    if (hasCards && hasQuizzes) {
      const cardAvg = collector.flashcardMasteryList.reduce((a, b) => a + b, 0) / collector.flashcardMasteryList.length;
      const quizAvg = collector.quizScoreList.reduce((a, b) => a + b, 0) / collector.quizScoreList.length;
      mastery = Math.round(cardAvg * 0.5 + quizAvg * 0.5);
    } else if (hasCards) {
      mastery = Math.round(collector.flashcardMasteryList.reduce((a, b) => a + b, 0) / collector.flashcardMasteryList.length);
    } else if (hasQuizzes) {
      mastery = Math.round(collector.quizScoreList.reduce((a, b) => a + b, 0) / collector.quizScoreList.length);
    } else if (collector.notesCount > 0) {
      mastery = 45; // notes exist but untested
    }

    if (collector.isWeakTopic || weakTopicsSet.has(collector.label.toLowerCase())) {
      mastery = Math.max(15, mastery - 25);
    }

    mastery = Math.max(0, Math.min(100, mastery));

    // Multi-factor Knowledge Gap details computation
    const gapDetails = computeKnowledgeGapDetails(collector, mastery, exams, now);

    const hasEvidence = hasCards || hasQuizzes;
    const isKnowledgeGap =
      collector.isWeakTopic ||
      (hasEvidence && mastery < 60) ||
      (hasEvidence && gapDetails.gapScore >= 50) ||
      (collector.overdueFlashcardsCount > 0 && gapDetails.examProximityDays !== null && gapDetails.examProximityDays <= 7);

    const relatedList = Array.from(collector.coOccurrences.keys());

    nodes.push({
      id: collector.id,
      label: collector.label,
      folderId: collector.folderId,
      folderName,
      folderColor,
      masteryScore: mastery,
      isKnowledgeGap,
      gapScore: gapDetails.gapScore,
      gapDetails,
      notesCount: collector.notesCount,
      flashcardsCount: collector.flashcardsCount,
      quizzesCount: collector.quizzesCount,
      materialsCount: collector.materialsCount,
      overdueCardsCount: collector.overdueFlashcardsCount,
      examProximityDays: gapDetails.examProximityDays,
      degree: collector.coOccurrences.size,
      x: 0,
      y: 0,
      radius: 20,
      noteSnippets: Array.from(collector.noteSnippets).slice(0, 4),
      relatedConcepts: relatedList,
      prerequisites: Array.from(collector.prerequisites),
      dependents: Array.from(collector.dependents),
      materialId: collector.materialId,
      deckId: collector.deckId,
      quizId: collector.quizId,
    });

    // Register edges
    for (const [targetId, info] of collector.coOccurrences.entries()) {
      const isDirected = info.hint === "depends_on" || info.hint === "part_of";
      const edgeKey = isDirected
        ? `${collector.id}-->${targetId}`
        : [collector.id, targetId].sort().join("---");

      if (!edgeMap.has(edgeKey)) {
        edgeMap.set(edgeKey, {
          id: `edge-${edgeKey}`,
          source: collector.id,
          target: targetId,
          relationship: info.hint,
          weight: Math.min(5, Math.max(1, info.count)),
        });
      }
    }
  }

  // Filter edges to only those connecting existing nodes
  const MAX_EDGES = 400;
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = Array.from(edgeMap.values())
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_EDGES);

  // Compute degree from filtered edges
  const degreeCount = new Map<string, number>();
  for (const edge of edges) {
    degreeCount.set(edge.source, (degreeCount.get(edge.source) || 0) + 1);
    degreeCount.set(edge.target, (degreeCount.get(edge.target) || 0) + 1);
  }

  for (const node of nodes) {
    node.degree = degreeCount.get(node.id) || 0;
    node.radius = Math.round(
      18 + Math.min(node.degree * 2.5 + node.notesCount * 2 + node.flashcardsCount * 1.5, 20),
    );
  }

  // Compute Layout Coordinates
  applyClusterLayout(nodes, folders);

  // Calculate Overall Stats
  const totalMastery = nodes.reduce((acc, n) => acc + n.masteryScore, 0);
  const averageMastery = nodes.length ? Math.round(totalMastery / nodes.length) : 0;
  const knowledgeGapsCount = nodes.filter((n) => n.isKnowledgeGap).length;
  const prerequisitesCount = edges.filter((e) => e.relationship === "depends_on").length;
  const criticalGapsCount = nodes.filter((n) => n.gapDetails?.urgency === "critical").length;

  return {
    nodes,
    edges,
    stats: {
      totalConcepts: nodes.length,
      totalEdges: edges.length,
      knowledgeGapsCount,
      averageMastery,
      prerequisitesCount,
      criticalGapsCount,
    },
  };
}

/** Cluster Layout Algorithm for 1000x800 SVG canvas */
export function applyClusterLayout(nodes: ConceptNode[], _folders?: Folder[]): void {
  if (nodes.length === 0) return;

  const clusterGroups = new Map<string, ConceptNode[]>();
  for (const node of nodes) {
    const key = node.folderId || "unassigned";
    const group = clusterGroups.get(key) || [];
    group.push(node);
    clusterGroups.set(key, group);
  }

  const groupKeys = Array.from(clusterGroups.keys());
  const numGroups = groupKeys.length;

  const centerX = CANVAS_WIDTH / 2;
  const centerY = CANVAS_HEIGHT / 2;

  groupKeys.forEach((key, groupIdx) => {
    const groupNodes = clusterGroups.get(key) || [];
    // Sort highest degree first
    groupNodes.sort((a, b) => b.degree - a.degree);

    let clusterCenterX = centerX;
    let clusterCenterY = centerY;

    if (numGroups > 1) {
      const angle = (groupIdx / numGroups) * 2 * Math.PI - Math.PI / 2;
      const rx = numGroups === 2 ? 220 : 250;
      const ry = numGroups === 2 ? 160 : 180;
      clusterCenterX = centerX + Math.cos(angle) * rx;
      clusterCenterY = centerY + Math.sin(angle) * ry;
    }

    groupNodes.forEach((node, nodeIdx) => {
      if (nodeIdx === 0 && numGroups > 1) {
        node.x = clusterCenterX;
        node.y = clusterCenterY;
      } else {
        const phi = nodeIdx * 2.39996; // Golden angle spiral
        const dist = 38 + Math.sqrt(nodeIdx) * (36 + Math.min(groupNodes.length * 2, 35));
        node.x = clusterCenterX + Math.cos(phi) * dist;
        node.y = clusterCenterY + Math.sin(phi) * dist * 0.85;
      }
    });
  });

  // Force relaxation iterations to prevent overlaps and keep nodes inside bounds
  const iterations = 25;
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const n1 = nodes[i];
        const n2 = nodes[j];
        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const dist = Math.hypot(dx, dy) || 1;
        const minDist = n1.radius + n2.radius + 18;

        if (dist < minDist) {
          const overlap = (minDist - dist) / 2;
          const nx = (dx / dist) * overlap;
          const ny = (dy / dist) * overlap;
          n1.x -= nx;
          n1.y -= ny;
          n2.x += nx;
          n2.y += ny;
        }
      }
    }

    // Bounds clamp
    for (const node of nodes) {
      node.x = Math.max(node.radius + 30, Math.min(CANVAS_WIDTH - node.radius - 30, node.x));
      node.y = Math.max(node.radius + 30, Math.min(CANVAS_HEIGHT - node.radius - 30, node.y));
    }
  }
}

/** Filters nodes and edges based on user criteria */
export function filterConceptGraph(
  graphData: ConceptGraphData,
  filters: GraphFilterOptions,
): ConceptGraphData {
  const { folderId, searchQuery, knowledgeGapsOnly, prerequisitesOnly, relationshipType } = filters;
  const q = (searchQuery || "").trim().toLowerCase();

  const filteredNodes = graphData.nodes.filter((node) => {
    // 1. Folder filter
    if (folderId && folderId !== "all") {
      if (node.folderId !== folderId) return false;
    }

    // 2. Knowledge gap toggle
    if (knowledgeGapsOnly && !node.isKnowledgeGap) {
      return false;
    }

    // 3. Prerequisites filter
    if (prerequisitesOnly && node.prerequisites.length === 0 && node.dependents.length === 0) {
      return false;
    }

    // 4. Search query filter
    if (q) {
      const matchLabel = node.label.toLowerCase().includes(q);
      const matchFolder = node.folderName.toLowerCase().includes(q);
      const matchSnippets = node.noteSnippets.some((s) => s.toLowerCase().includes(q));
      if (!matchLabel && !matchFolder && !matchSnippets) {
        return false;
      }
    }

    return true;
  });

  const nodeIds = new Set(filteredNodes.map((n) => n.id));
  let filteredEdges = graphData.edges.filter(
    (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
  );

  if (relationshipType && relationshipType !== "all") {
    filteredEdges = filteredEdges.filter((e) => e.relationship === relationshipType);
  } else if (prerequisitesOnly) {
    filteredEdges = filteredEdges.filter((e) => e.relationship === "depends_on" || e.relationship === "part_of");
  }

  // Recalculate degree for filtered nodes
  const degreeMap = new Map<string, number>();
  for (const edge of filteredEdges) {
    degreeMap.set(edge.source, (degreeMap.get(edge.source) || 0) + 1);
    degreeMap.set(edge.target, (degreeMap.get(edge.target) || 0) + 1);
  }

  const nodesWithDegree = filteredNodes.map((n) => ({
    ...n,
    degree: degreeMap.get(n.id) || 0,
  }));

  const totalMastery = nodesWithDegree.reduce((acc, n) => acc + n.masteryScore, 0);
  const averageMastery = nodesWithDegree.length ? Math.round(totalMastery / nodesWithDegree.length) : 0;
  const knowledgeGapsCount = nodesWithDegree.filter((n) => n.isKnowledgeGap).length;
  const prerequisitesCount = filteredEdges.filter((e) => e.relationship === "depends_on").length;
  const criticalGapsCount = nodesWithDegree.filter((n) => n.gapDetails?.urgency === "critical").length;

  return {
    nodes: nodesWithDegree,
    edges: filteredEdges,
    stats: {
      totalConcepts: nodesWithDegree.length,
      totalEdges: filteredEdges.length,
      knowledgeGapsCount,
      averageMastery,
      prerequisitesCount,
      criticalGapsCount,
    },
  };
}

/** Built-in demo graph, offered explicitly by ConceptGraphView's empty state */
export function generateSampleGraph(folders: Folder[] = []): ConceptGraphData {
  const bioFolder = folders.find((f) => f.name.toLowerCase().includes("bio")) || {
    id: "f-bio",
    user_id: "",
    name: "Biology",
    color: "#4ade80",
    created_at: "",
  };

  const chemFolder = folders.find((f) => f.name.toLowerCase().includes("chem")) || {
    id: "f-chem",
    user_id: "",
    name: "Chemistry",
    color: "#60a5fa",
    created_at: "",
  };

  const sampleNodes: ConceptNode[] = [
    {
      id: "concept-enzymes",
      label: "Enzymes",
      folderId: bioFolder.id,
      folderName: bioFolder.name,
      folderColor: bioFolder.color,
      masteryScore: 84,
      isKnowledgeGap: false,
      gapScore: 15,
      gapDetails: {
        gapScore: 15,
        quizDeficit: 0,
        overdueCardsCount: 0,
        examProximityDays: 8,
        examName: "Biology Midterm",
        urgency: "low",
        remediationReasons: [],
      },
      notesCount: 3,
      flashcardsCount: 5,
      quizzesCount: 2,
      materialsCount: 1,
      degree: 4,
      x: 320,
      y: 280,
      radius: 32,
      noteSnippets: [
        "Enzymes lower the activation energy of biological reactions.",
        "Active site is highly specific to the substrate conformation.",
      ],
      relatedConcepts: ["concept-activation-energy", "concept-active-site", "concept-denaturation", "concept-catalysts"],
      prerequisites: ["concept-activation-energy"],
      dependents: ["concept-denaturation", "concept-active-site"],
    },
    {
      id: "concept-activation-energy",
      label: "Activation Energy",
      folderId: bioFolder.id,
      folderName: bioFolder.name,
      folderColor: bioFolder.color,
      masteryScore: 78,
      isKnowledgeGap: false,
      gapScore: 20,
      notesCount: 2,
      flashcardsCount: 3,
      quizzesCount: 1,
      materialsCount: 1,
      degree: 3,
      x: 240,
      y: 200,
      radius: 26,
      noteSnippets: ["Minimum energy requirement for reactant particles to collide successfully."],
      relatedConcepts: ["concept-enzymes", "concept-catalysts"],
      prerequisites: [],
      dependents: ["concept-enzymes"],
    },
    {
      id: "concept-active-site",
      label: "Active Site",
      folderId: bioFolder.id,
      folderName: bioFolder.name,
      folderColor: bioFolder.color,
      masteryScore: 90,
      isKnowledgeGap: false,
      gapScore: 10,
      notesCount: 2,
      flashcardsCount: 4,
      quizzesCount: 2,
      materialsCount: 1,
      degree: 2,
      x: 420,
      y: 220,
      radius: 24,
      noteSnippets: ["The 3D pocket where substrates bind and undergo catalytic transformation."],
      relatedConcepts: ["concept-enzymes", "concept-denaturation"],
      prerequisites: ["concept-enzymes"],
      dependents: ["concept-denaturation"],
    },
    {
      id: "concept-denaturation",
      label: "Denaturation",
      folderId: bioFolder.id,
      folderName: bioFolder.name,
      folderColor: bioFolder.color,
      masteryScore: 42,
      isKnowledgeGap: true,
      gapScore: 68,
      gapDetails: {
        gapScore: 68,
        quizDeficit: 25,
        overdueCardsCount: 2,
        examProximityDays: 8,
        examName: "Biology Midterm",
        urgency: "high",
        remediationReasons: ["You know about 42% of this", "2 flashcards are overdue"],
      },
      notesCount: 1,
      flashcardsCount: 2,
      quizzesCount: 0,
      materialsCount: 1,
      degree: 2,
      x: 390,
      y: 380,
      radius: 24,
      noteSnippets: ["High temperatures or extreme pH disrupt hydrogen bonds causing loss of shape."],
      relatedConcepts: ["concept-enzymes", "concept-active-site"],
      prerequisites: ["concept-enzymes", "concept-active-site"],
      dependents: [],
    },
    {
      id: "concept-catalysts",
      label: "Catalysts",
      folderId: chemFolder.id,
      folderName: chemFolder.name,
      folderColor: chemFolder.color,
      masteryScore: 72,
      isKnowledgeGap: false,
      gapScore: 22,
      notesCount: 2,
      flashcardsCount: 3,
      quizzesCount: 1,
      materialsCount: 1,
      degree: 3,
      x: 580,
      y: 320,
      radius: 28,
      noteSnippets: ["Substances that speed up chemical reaction rates without being consumed."],
      relatedConcepts: ["concept-enzymes", "concept-activation-energy", "concept-titration"],
      prerequisites: [],
      dependents: ["concept-activation-energy"],
    },
    {
      id: "concept-titration",
      label: "Titration",
      folderId: chemFolder.id,
      folderName: chemFolder.name,
      folderColor: chemFolder.color,
      masteryScore: 48,
      isKnowledgeGap: true,
      gapScore: 72,
      gapDetails: {
        gapScore: 72,
        quizDeficit: 20,
        overdueCardsCount: 2,
        examProximityDays: 4,
        examName: "Chemistry Final",
        urgency: "critical",
        remediationReasons: ["You know about 48% of this", "Exam in 4 days", "2 flashcards overdue"],
      },
      notesCount: 2,
      flashcardsCount: 2,
      quizzesCount: 0,
      materialsCount: 1,
      degree: 2,
      x: 690,
      y: 270,
      radius: 26,
      noteSnippets: ["Quantitative analytical method to determine unknown concentration of acid/base."],
      relatedConcepts: ["concept-catalysts", "concept-end-point"],
      prerequisites: ["concept-moles"],
      dependents: ["concept-end-point"],
    },
    {
      id: "concept-end-point",
      label: "End Point",
      folderId: chemFolder.id,
      folderName: chemFolder.name,
      folderColor: chemFolder.color,
      masteryScore: 35,
      isKnowledgeGap: true,
      gapScore: 78,
      gapDetails: {
        gapScore: 78,
        quizDeficit: 30,
        overdueCardsCount: 1,
        examProximityDays: 4,
        examName: "Chemistry Final",
        urgency: "critical",
        remediationReasons: ["You know about 35% of this", "Exam in 4 days"],
      },
      notesCount: 1,
      flashcardsCount: 1,
      quizzesCount: 0,
      materialsCount: 1,
      degree: 1,
      x: 770,
      y: 360,
      radius: 22,
      noteSnippets: ["The exact moment when the indicator changes color permanently."],
      relatedConcepts: ["concept-titration"],
      prerequisites: ["concept-titration"],
      dependents: [],
    },
    {
      id: "concept-moles",
      label: "Moles & Stoichiometry",
      folderId: chemFolder.id,
      folderName: chemFolder.name,
      folderColor: chemFolder.color,
      masteryScore: 88,
      isKnowledgeGap: false,
      gapScore: 12,
      notesCount: 3,
      flashcardsCount: 6,
      quizzesCount: 2,
      materialsCount: 1,
      degree: 1,
      x: 650,
      y: 450,
      radius: 28,
      noteSnippets: ["Avogadro constant and molar mass relationships for stoichiometry calculations."],
      relatedConcepts: ["concept-titration"],
      prerequisites: [],
      dependents: ["concept-titration"],
    },
  ];

  const sampleEdges: ConceptEdge[] = [
    { id: "e1", source: "concept-enzymes", target: "concept-activation-energy", relationship: "depends_on", weight: 3 },
    { id: "e2", source: "concept-enzymes", target: "concept-active-site", relationship: "part_of", weight: 4 },
    { id: "e3", source: "concept-enzymes", target: "concept-denaturation", relationship: "depends_on", weight: 2 },
    { id: "e4", source: "concept-enzymes", target: "concept-catalysts", relationship: "related_to", weight: 3 },
    { id: "e5", source: "concept-active-site", target: "concept-denaturation", relationship: "depends_on", weight: 2 },
    { id: "e6", source: "concept-catalysts", target: "concept-activation-energy", relationship: "depends_on", weight: 2 },
    { id: "e7", source: "concept-catalysts", target: "concept-titration", relationship: "related_to", weight: 2 },
    { id: "e8", source: "concept-titration", target: "concept-end-point", relationship: "part_of", weight: 4 },
    { id: "e9", source: "concept-titration", target: "concept-moles", relationship: "depends_on", weight: 3 },
  ];

  applyClusterLayout(sampleNodes, folders);

  const totalMastery = sampleNodes.reduce((acc, n) => acc + n.masteryScore, 0);
  const averageMastery = Math.round(totalMastery / sampleNodes.length);
  const knowledgeGapsCount = sampleNodes.filter((n) => n.isKnowledgeGap).length;
  const criticalGapsCount = sampleNodes.filter((n) => n.gapDetails?.urgency === "critical").length;
  const prerequisitesCount = sampleEdges.filter((e) => e.relationship === "depends_on").length;

  return {
    nodes: sampleNodes,
    edges: sampleEdges,
    stats: {
      totalConcepts: sampleNodes.length,
      totalEdges: sampleEdges.length,
      knowledgeGapsCount,
      averageMastery,
      prerequisitesCount,
      criticalGapsCount,
    },
  };
}

/**
 * Resolves prerequisite concepts that must be learned before a given concept.
 */
export function getPrerequisites(conceptId: string, graph: ConceptGraphData): ConceptNode[] {
  const node = graph.nodes.find((n) => n.id === conceptId);
  if (!node) return [];
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  const prereqIds = new Set<string>(node.prerequisites || []);
  graph.edges.forEach((edge) => {
    if (edge.relationship === "depends_on") {
      if (edge.source === conceptId) prereqIds.add(edge.target);
    }
  });

  return Array.from(prereqIds)
    .map((id) => nodeMap.get(id))
    .filter((n): n is ConceptNode => Boolean(n));
}

/**
 * Resolves dependent concepts unlocked after mastering a given concept.
 */
export function getDependents(conceptId: string, graph: ConceptGraphData): ConceptNode[] {
  const node = graph.nodes.find((n) => n.id === conceptId);
  if (!node) return [];
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  const depIds = new Set<string>(node.dependents || []);
  graph.edges.forEach((edge) => {
    if (edge.relationship === "depends_on") {
      if (edge.target === conceptId) depIds.add(edge.source);
    }
  });

  return Array.from(depIds)
    .map((id) => nodeMap.get(id))
    .filter((n): n is ConceptNode => Boolean(n));
}

/**
 * Resolves full prerequisite and component hierarchy for a node.
 */
export function getPrerequisiteHierarchy(
  conceptId: string,
  graph: ConceptGraphData,
): {
  prerequisites: ConceptNode[];
  dependents: ConceptNode[];
  components: ConceptNode[];
} {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const prerequisites = getPrerequisites(conceptId, graph);
  const dependents = getDependents(conceptId, graph);

  const componentIds = new Set<string>();
  graph.edges.forEach((edge) => {
    if (edge.relationship === "part_of") {
      if (edge.source === conceptId) componentIds.add(edge.target);
      if (edge.target === conceptId) componentIds.add(edge.source);
    }
  });

  const components = Array.from(componentIds)
    .map((id) => nodeMap.get(id))
    .filter((n): n is ConceptNode => Boolean(n));

  return {
    prerequisites,
    dependents,
    components,
  };
}

export interface RecoveryDrillQuestion {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  conceptTarget: string;
}

export interface RecoveryDrill {
  conceptId: string;
  conceptLabel: string;
  folderName: string;
  folderColor: string;
  gapScore: number;
  urgency: string;
  estimatedMinutes: number; // 5
  summaryTakeaway: string;
  prerequisiteReview: { id: string; label: string; masteryScore: number }[];
  highYieldQuestions: RecoveryDrillQuestion[];
  remediationReasons: string[];
}

/**
 * Generates a targeted 5-minute recovery drill and focused summary for a concept knowledge gap.
 */
export function generateRecoveryDrill(
  node: ConceptNode,
  allNodes: ConceptNode[] = [],
): RecoveryDrill {
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
  const prereqNodes = (node.prerequisites || [])
    .map((id) => nodeMap.get(id))
    .filter((n): n is ConceptNode => Boolean(n));

  let summaryTakeaway = "";
  if (node.noteSnippets && node.noteSnippets.length > 0) {
    summaryTakeaway = node.noteSnippets[0];
  } else {
    summaryTakeaway = `The main ideas behind ${node.label}, and where you use them.`;
  }

  const prereqHint = prereqNodes.length > 0
    ? prereqNodes.map((p) => p.label).join(", ")
    : "the basics";

  const questions: RecoveryDrillQuestion[] = [
    {
      id: 1,
      question: `What does ${node.label} actually mean?`,
      options: [
        node.noteSnippets[0]
          ? node.noteSnippets[0].slice(0, 85)
          : `The main idea behind ${node.label} in ${node.folderName}`,
        `Something unrelated from ${node.folderName}`,
        `Something that slows things down and does nothing else`,
        `A leftover that does nothing at all`,
      ],
      correctIndex: 0,
      explanation: `Start with what it means: ${node.noteSnippets[0] || `${node.label} is a key topic in ${node.folderName}.`}`,
      conceptTarget: node.label,
    },
    {
      id: 2,
      question: `What do you need to understand first, before ${node.label} makes sense?`,
      options: [
        `Nothing — it stands entirely on its own`,
        `It builds on things like ${prereqHint}`,
        `It only works once it has stopped working`,
        `Nothing — it ignores all the usual rules`,
      ],
      correctIndex: 1,
      explanation: `${node.label} rests on ${prereqHint}. Go over those and this gets much easier.`,
      conceptTarget: node.label,
    },
    {
      id: 3,
      question: `What is the best way to get ${node.label} to stick?`,
      options: [
        `Reading the chapter again without testing yourself`,
        `Testing yourself on it, and explaining it out loud`,
        `Leaving it until the morning of the exam`,
        `Memorising the words without knowing what they mean`,
      ],
      correctIndex: 1,
      explanation: `Testing yourself over a few days is what makes ${node.label} stick. Rereading it feels productive but does much less.`,
      conceptTarget: node.label,
    },
  ];

  return {
    conceptId: node.id,
    conceptLabel: node.label,
    folderName: node.folderName,
    folderColor: node.folderColor,
    gapScore: node.gapScore ?? (node.isKnowledgeGap ? 65 : 20),
    urgency: node.gapDetails?.urgency ?? (node.isKnowledgeGap ? "high" : "low"),
    estimatedMinutes: 5,
    summaryTakeaway,
    prerequisiteReview: prereqNodes.map((p) => ({
      id: p.id,
      label: p.label,
      masteryScore: p.masteryScore,
    })),
    highYieldQuestions: questions,
    remediationReasons:
      node.gapDetails?.remediationReasons && node.gapDetails.remediationReasons.length > 0
        ? node.gapDetails.remediationReasons
        : (node.isKnowledgeGap ? ["Retention mastery is below target (<60%)"] : []),
  };
}
