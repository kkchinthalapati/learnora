import { supabase } from "./supabase.js";
import { UI, $, esc, ModalManager, localDateStr, mondayOfWeek } from "./ui.js";
import { Tasks, Exams } from "./api.js";

/* =========================================================================
   AI MODULE — Chat, Ingestion, File Handling, Flashcard Generation
   Senior Engineer Overhaul — v2.0
   ========================================================================= */

const MAX_HISTORY = 20;       // Keep last 20 messages to avoid token overflow
const MAX_RETRIES = 2;        // Retry edge function on transient errors
const RETRY_DELAY_MS = 2000;  // Wait 2s between retries

export const AI = {
  chatHistory: [],
  currentFile: null,

  /* =========================================================================
     FILE MANAGEMENT
     ========================================================================= */

  setFile(fileData) {
    this.currentFile = fileData;
    const nameEl = $("file-name");
    const preview = $("file-preview-container");
    if (nameEl) nameEl.textContent = fileData ? fileData.name : "";
    preview?.classList.toggle("hidden", !fileData);
  },

  processFile(file) {
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      UI.showPopup("File too large. Maximum size is 10MB.", "Upload Error");
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => UI.showPopup("Failed to read file.", "Upload Error");
    reader.onload = (e) => {
      this.setFile({
        name: file.name,
        mimeType: file.type,
        data: e.target.result.split(",")[1],
      });
    };
    reader.readAsDataURL(file);
  },

  /* =========================================================================
     EDGE FUNCTION CALLER — with retry logic
     ========================================================================= */

  async _callEdgeStream(payload, onChunk, retries = MAX_RETRIES) {
    // Uses raw fetch to the edge function URL so we can consume the stream
    const edgeUrl = "https://mlvgqwqiynpwpwzqufdf.supabase.co/functions/v1/learnora-ai";
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    const bodyPayload = JSON.stringify(payload);
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const headers = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const response = await fetch(edgeUrl, {
          method: "POST",
          headers,
          body: bodyPayload
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          const err = new Error(body.error || "AI is temporarily unavailable. Please try again in a moment.");
          // 4xx means the request itself is wrong (bad/expired token, bad
          // payload) — retrying it just burns two more round trips and 6s.
          err.retryable = response.status >= 500 || response.status === 429;
          throw err;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          fullText += chunk;
        }
        
        let parsedText = fullText;
        try {
          const parsed = JSON.parse(fullText);
          if (parsed && parsed.text) parsedText = parsed.text;
        } catch (e) {}

        if (onChunk) onChunk(parsedText, parsedText);
        return { text: parsedText };
      } catch (err) {
        const isLast = attempt === retries;
        if (isLast || err.retryable === false) throw err;
        console.warn(`[AI] Retry ${attempt + 1}/${retries}: ${err.message}`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
      }
    }
  },

  /* =========================================================================
     MARKDOWN RENDERER — lightweight inline parser for chat bubbles
     Replaces broken `marked.parse()` dependency with a robust local impl.
     ========================================================================= */

  renderMarkdown(md) {
    if (!md) return "";
    let html = md;

    // Escape HTML first
    html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Fenced code blocks: ```lang\n...\n```
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre class="glass-panel" style="padding:16px; margin:16px 0; overflow-x:auto; background:rgba(0,0,0,0.4); border-radius:var(--r-md);"><code style="font-family:'Fira Code',monospace; color:#4AE283; font-size:0.9rem; line-height:1.5;">${code.trim()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`\n]+)`/g,
      '<code style="font-family:monospace; background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; color:var(--primary);">$1</code>');

    // Headers (process longest first to avoid conflicts)
    html = html.replace(/^#### (.*?)$/gm, '<h4 style="font-size:1.15rem; margin:20px 0 8px; color:var(--text); font-weight:600;">$1</h4>');
    html = html.replace(/^### (.*?)$/gm,  '<h3 style="font-size:1.3rem; margin:24px 0 10px; color:var(--text); font-weight:600;">$1</h3>');
    html = html.replace(/^## (.*?)$/gm,   '<h2 style="font-size:1.6rem; margin:28px 0 12px; color:var(--primary); font-weight:700;">$1</h2>');
    html = html.replace(/^# (.*?)$/gm,    '<h1 style="font-size:2rem; margin:32px 0 16px; color:var(--primary); font-weight:800;">$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Blockquotes
    html = html.replace(/^&gt; (.*?)$/gm,
      '<blockquote style="border-left:3px solid var(--primary); padding:8px 16px; margin:12px 0; opacity:0.85; font-style:italic;">$1</blockquote>');

    // Unordered lists
    html = html.replace(/^- (.*?)$/gm,
      '<li style="margin-left:20px; margin-bottom:6px; list-style-type:disc;">$1</li>');

    // Numbered lists
    html = html.replace(/^\d+\. (.*?)$/gm,
      '<li style="margin-left:20px; margin-bottom:6px; list-style-type:decimal;">$1</li>');

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr style="border:none; border-top:1px solid rgba(255,255,255,0.15); margin:24px 0;">');

    // Newlines to <br> (but not inside code blocks — already handled)
    html = html.replace(/\n/g, '<br/>');

    // NOTE: this renderer deliberately does NOT un-escape any tags. A previous
    // version selectively un-escaped <div class="ai-widget">, <span
    // class="ai-widget-icon">, <strong> and their closers so that action
    // widgets injected before rendering would survive. That let any model
    // output — including text a model was fed from an uploaded document —
    // print those literal tags and forge a convincing "✅ Added task: …"
    // confirmation for an action that never happened. Widgets are now
    // re-inserted after rendering via restoreWidgets(); see AI.send().
    return html;
  },

  /** Token used to reserve a spot for trusted, app-built widget HTML inside
   *  untrusted model text. Contains no markdown/HTML-significant characters,
   *  so it passes through renderMarkdown() untouched. */
  _widgetToken(i) {
    return `⟦learnora-widget:${i}⟧`;
  },

  /** Swap widget tokens back for their real HTML *after* escaping/rendering. */
  restoreWidgets(html, widgets) {
    return html.replace(/⟦learnora-widget:(\d+)⟧/g, (_, i) => widgets[Number(i)] ?? "");
  },

  /* =========================================================================
     FLASHCARD JSON EXTRACTION — hardened parser with multiple fallbacks
     ========================================================================= */

  /** Action tags the app executes when it sees them in a model reply. */
  ACTION_TAGS: ["ADD_TASK", "START_TIMER", "SET_THEME", "NAVIGATE", "GRADE_FLASHCARD", "ADD_QUIZ", "ADD_PLAN"],

  /** Defang action tags inside untrusted text before it is interpolated into
   *  the prompt. Notes and uploaded documents are attacker-influenced input:
   *  a PDF containing "<SET_THEME>x</SET_THEME>" or "<NAVIGATE>…</NAVIGATE>"
   *  could otherwise steer the app, and those four tags execute with no
   *  confirmation prompt. Neutralising them at the boundary means only the
   *  model's own reply can ever trigger an action. */
  _stripActionTags(text) {
    if (!text) return "";
    const names = this.ACTION_TAGS.join("|");
    return String(text).replace(new RegExp(`<(/?)(?:${names})>`, "gi"), "($1tag removed)");
  },

  _decodeBase64UTF8(base64Str) {
    const binaryString = atob(base64Str);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  },

  _extractFlashcardJSON(text) {
    if (!text) return [];

    const sanitizeJSON = (str) => {
      // Remove trailing commas from arrays and objects
      return str.replace(/,(\s*[\]}])/g, '$1');
    };

    // Strategy 1: Direct JSON.parse of trimmed text
    try {
      const trimmed = sanitizeJSON(text.trim());
      if (trimmed.startsWith("[")) {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && parsed.length && parsed[0].front) return parsed;
      }
    } catch {}

    // Strategy 2: Strip markdown code fences
    try {
      let cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      cleaned = sanitizeJSON(cleaned);
      if (cleaned.startsWith("[")) {
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed) && parsed.length && parsed[0].front) return parsed;
      }
    } catch {}

    // Strategy 3: Find the first [ ... ] block via bracket matching
    try {
      const start = text.indexOf("[");
      const end = text.lastIndexOf("]");
      if (start !== -1 && end > start) {
        const cleaned = sanitizeJSON(text.substring(start, end + 1));
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed) && parsed.length && parsed[0].front) return parsed;
      }
    } catch {}

    // Strategy 4: Regex extraction of individual card objects
    try {
      const regex = /\{\s*"front"\s*:\s*"([^"]+)"\s*,\s*"back"\s*:\s*"([^"]+)"\s*\}/g;
      const cards = [];
      let match;
      while ((match = regex.exec(text)) !== null) {
        cards.push({ front: match[1], back: match[2] });
      }
      if (cards.length > 0) return cards;
    } catch {}

    return [];
  },

  _extractPlanJSON(text) {
    if (!text) return null;
    const sanitize = (str) => str.replace(/,(\s*[\]}])/g, "$1");

    try {
      const parsed = JSON.parse(sanitize(text.trim()));
      if (parsed && Array.isArray(parsed.days)) return parsed;
    } catch {}

    try {
      const cleaned = sanitize(text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim());
      const parsed = JSON.parse(cleaned);
      if (parsed && Array.isArray(parsed.days)) return parsed;
    } catch {}

    try {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start !== -1 && end > start) {
        const parsed = JSON.parse(sanitize(text.substring(start, end + 1)));
        if (parsed && Array.isArray(parsed.days)) return parsed;
      }
    } catch {}

    return null;
  },

  _extractQuizJSON(text) {
    if (!text) return [];
    const sanitize = (str) => str.replace(/,(\s*[\]}])/g, "$1");
    // correctIndex must be validated here, not just question/choices: the
    // quiz view grades with `i === q.correctIndex`, so a model that emits
    // `answer` or `correct_index` instead produces a quiz where every
    // answer — including the right one — is marked wrong, with no error.
    const isValid = (arr) =>
      Array.isArray(arr) &&
      arr.length > 0 &&
      arr.every((q) =>
        q &&
        typeof q.question === "string" &&
        Array.isArray(q.choices) &&
        q.choices.length > 1 &&
        Number.isInteger(q.correctIndex) &&
        q.correctIndex >= 0 &&
        q.correctIndex < q.choices.length
      );

    try {
      const parsed = JSON.parse(sanitize(text.trim()));
      if (isValid(parsed)) return parsed;
    } catch {}

    try {
      const cleaned = sanitize(text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim());
      const parsed = JSON.parse(cleaned);
      if (isValid(parsed)) return parsed;
    } catch {}

    try {
      const start = text.indexOf("[");
      const end = text.lastIndexOf("]");
      if (start !== -1 && end > start) {
        const parsed = JSON.parse(sanitize(text.substring(start, end + 1)));
        if (isValid(parsed)) return parsed;
      }
    } catch {}

    return [];
  },

  /* =========================================================================
     WEEKLY PLAN GENERATION
     ========================================================================= */

  async generateWeeklyPlan() {
    try {
      const { Plans } = await import("./api.js");
      const [tasks, exams] = await Promise.all([Tasks.fetch(), Exams.fetch()]);
      const todayStr = localDateStr();
      const pendingTasks = tasks
        .filter(t => !t.is_done)
        .map(t => t.due_date ? `${t.text} (due ${t.due_date})` : t.text)
        .join(", ") || "None";
      // Only feed the AI exams that haven't already happened — an exam
      // that's already past (or manually marked Completed) isn't "upcoming"
      // and shouldn't shape the schedule as if it still were.
      const upcomingExams = exams
        .filter(e => e.status !== "Completed" && e.exam_date >= todayStr)
        .sort((a, b) => a.exam_date.localeCompare(b.exam_date))
        .map(e => `${e.exam_name} on ${e.exam_date} (difficulty: ${e.difficulty || "unspecified"})`)
        .join(", ") || "None";

      const monday = mondayOfWeek();
      const weekStartISO = localDateStr(monday);
      const weekDates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return localDateStr(d);
      });

      const prompt = `Build a weekly study schedule for the week of ${weekStartISO} (days: ${weekDates.join(", ")}).
Pending tasks: ${pendingTasks}
Upcoming exams: ${upcomingExams}
Prioritize subjects with closer/harder exams and tasks with closer due dates. Keep daily blocks realistic (30-90 minutes each, a couple of blocks per day at most). If there is no exam/task data, suggest light general review blocks.`;

      const data = await this._callEdgeStream({
        history: [{ role: "user", content: prompt }],
        mode: "plan",
        settings: UI.loadSettings(),
      }, null);

      const planJson = this._extractPlanJSON(data.text);
      if (!planJson) {
        UI.showPopup("Couldn't generate a plan this time. Please try again.", "AI Plan");
        return null;
      }

      const saved = await Plans.upsert(weekStartISO, planJson);
      return saved;
    } catch (err) {
      console.error("[AI.generateWeeklyPlan]", err);
      UI.showPopup("Failed to generate your weekly plan. Please try again.", "AI Plan");
      return null;
    }
  },

  /* =========================================================================
     QUIZ GENERATION — distinct from flashcards, auto-graded MCQ
     ========================================================================= */

  async generateQuiz(materialId, folderId, config = null) {
    try {
      const { Notes, Materials, Quizzes } = await import("./api.js");

      let sourceText = "";
      let title = "Quiz";
      let topic = config?.topic || "";

      if (materialId) {
        const notes = await Notes.fetchByMaterial(materialId);
        if (notes?.[0]?.markdown_content) {
          sourceText = notes[0].markdown_content.substring(0, 6000);
        }
        const materials = await Materials.fetch(folderId);
        const material = materials.find(m => m.id === materialId);
        if (material) {
           title = `${material.title} Quiz`;
           if (!topic) topic = material.title;
        }
      } else if (topic) {
        sourceText = `Topic: ${topic}`;
        title = `${topic} Quiz`;
      }

      if (!sourceText) {
        UI.showPopup("No notes are available for this material yet — wait for AI processing to finish, then try again.", "Quiz Generation");
        return null;
      }

      let prompt = `Generate a multiple choice quiz from the following study notes or topic.\n\n`;
      if (config) {
         prompt += `Configuration:
- Topic: ${topic}
- Difficulty: ${config.difficulty || "Medium"}
- AI Host Personality: ${config.personality || "Friendly Tutor"}
- Question Count: ${config.length || 10}

IMPORTANT: For EACH question, you MUST include a "feedback" string. The feedback should explain why the correct answer is right and why others are wrong, but it MUST be written in the exact voice and tone of the chosen AI Host Personality (${config.personality || "Friendly Tutor"}). Be highly expressive, engaging, and directly address the student.

`;
      }
      
      prompt += `Material:\n"""\n${sourceText}\n"""`;

      const data = await this._callEdgeStream({
        history: [{ role: "user", content: prompt }],
        mode: "quiz",
        settings: UI.loadSettings(),
      }, null);

      const questions = this._extractQuizJSON(data.text);
      if (questions.length === 0) {
        UI.showPopup("Couldn't generate a quiz this time. Please try again.", "Quiz Generation");
        return null;
      }

      const quiz = await Quizzes.add(materialId, folderId, title, questions);
      return quiz;
    } catch (err) {
      console.error("[AI.generateQuiz]", err);
      UI.showPopup("Failed to generate quiz. Please try again.", "Quiz Generation");
      return null;
    }
  },

  /* =========================================================================
     INGESTION PIPELINE — Process uploaded materials into notes + flashcards
     ========================================================================= */

  async generateStudyMaterial(material, folderId, fileDataPayload) {
    try {
      const { Notes, Decks, Flashcards } = await import("./api.js");

      // Build the ingestion prompt
      let prompt = `You are a premium AI study guide creator and personal tutor for a student.

Analyze the provided study material and produce a high-quality study package.

OUTPUT FORMAT — You MUST produce exactly two sections separated by the exact token "---FLASHCARDS---":

=== SECTION 1: STUDY NOTES ===
Write comprehensive, well-structured Markdown notes:
- Start with a welcoming title using ## and a brief intro addressing the student directly ("Let's break down...", "Here's your guide to...")
- Use ### for main topics and #### for subtopics
- Bold **key terms** when first introduced
- Use bullet lists for related concepts
- Include code blocks with \`\`\`language syntax if the material involves programming
- Use > blockquotes for important definitions or formulas
- Keep the tone conversational and encouraging — like a friendly tutor, not a textbook
- Be thorough — cover all major concepts from the material

---FLASHCARDS---

=== SECTION 2: FLASHCARDS ===
Output a raw JSON array of 8-15 flashcards. Each card must test a distinct concept.
Format: [{"front": "What is X?", "back": "X is..."}]
Do NOT wrap in code fences. Do NOT add any text before or after the JSON array.`;

      let filePayload = fileDataPayload;

      // Handle text/plain content (URLs, raw text) — Gemini rejects text/plain as inlineData
      if (fileDataPayload && fileDataPayload.mimeType === "text/plain") {
        try {
          const decoded = this._decodeBase64UTF8(fileDataPayload.data);

          // Detect YouTube URLs — be honest about limitations
          if (decoded.match(/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//)) {
            prompt += `\n\nThe student provided a YouTube video link: ${decoded}\nYou cannot watch the video, but based on the URL and any context in the title, generate useful study notes about the likely topic. Be transparent that these notes are based on the video's topic, not its exact transcript. If you can identify the topic from the URL, focus your notes on that subject.`;
          } else {
            prompt += `\n\nStudy Material Content:\n"""\n${decoded}\n"""`;
          }
          filePayload = null; // Don't send as binary attachment
        } catch (e) {
          console.error("[AI.ingest] Failed to decode text payload:", e);
        }
      }

      const data = await this._callEdgeStream({
        history: [{ role: "user", content: prompt }],
        file: filePayload,
        settings: UI.loadSettings(),
      }, null);

      const responseText = data.text;

      // Split on separator
      const separatorIndex = responseText.indexOf("---FLASHCARDS---");
      let markdownNotes, flashcardRaw;

      if (separatorIndex !== -1) {
        markdownNotes = responseText.substring(0, separatorIndex).trim();
        flashcardRaw = responseText.substring(separatorIndex + "---FLASHCARDS---".length).trim();
      } else {
        // No separator found — treat entire response as notes, attempt flashcard extraction anyway
        markdownNotes = responseText.trim();
        flashcardRaw = responseText;
      }

      // Save notes
      if (markdownNotes && markdownNotes.length > 50) {
        await Notes.add(material.id, markdownNotes);
        console.log("✅ Notes saved successfully");
      }

      // Extract and save flashcards
      const flashcards = this._extractFlashcardJSON(flashcardRaw);
      if (flashcards.length > 0) {
        const deck = await Decks.add(folderId, material.title + " Flashcards");
        await Flashcards.addBatch(deck.id, flashcards);
        console.log(`✅ ${flashcards.length} flashcards saved successfully`);
      }

      console.log("✅ Ingestion pipeline complete");
    } catch (err) {
      console.error("🚨 Ingestion Pipeline Error:", err);
      // Surface the error to the user instead of silently failing
      UI.showPopup(
        "AI processing encountered an issue. Your file was uploaded but notes/flashcards may not have been generated. Try again from the folder view.",
        "Processing Notice"
      );
    }
  },

  /* =========================================================================
     CHAT — Context-aware workspace assistant
     ========================================================================= */

  async send(query) {
    const msgBox = $("chat-messages");
    const typing = $("typing-indicator");
    if (!msgBox || !typing) return;

    // Trim history to prevent token overflow
    if (this.chatHistory.length > MAX_HISTORY) {
      this.chatHistory = this.chatHistory.slice(-MAX_HISTORY);
    }

    // Gather workspace context
    let pendingTasks = "None";
    let upcomingExams = "None";
    try {
      const [tasks, exams] = await Promise.all([Tasks.fetch(), Exams.fetch()]);
      const todayStr = localDateStr();
      pendingTasks = tasks
        .filter(t => !t.is_done)
        .map(t => t.due_date ? `${t.text} (due ${t.due_date})` : t.text)
        .join(", ") || "None";
      // Only feed the AI exams that haven't already happened — otherwise
      // it reasons about stale/past exams as if they were still upcoming.
      upcomingExams = exams
        .filter(e => e.status !== "Completed" && e.exam_date >= todayStr)
        .sort((a, b) => a.exam_date.localeCompare(b.exam_date))
        .map(e => `${e.exam_name} on ${e.exam_date}`)
        .join(", ") || "None";
    } catch (e) {
      console.warn("[AI.send] Failed to fetch workspace context:", e);
    }

    // Determine active view context
    let activeContext = "User is on the general dashboard.";
    const hash = window.location.hash.replace("#", "");

    if (hash.startsWith("folder-")) {
      activeContext = `User is viewing a course folder. They may ask questions about that subject.`;
    } else if (hash.startsWith("notes-")) {
      const materialId = hash.replace("notes-", "");
      try {
        const { Notes } = await import("./api.js");
        const notes = await Notes.fetchByMaterial(materialId);
        if (notes?.[0]?.markdown_content) {
          // Truncate to ~3000 chars to avoid blowing token limits
          const truncated = this._stripActionTags(notes[0].markdown_content.substring(0, 3000));
          activeContext = `User is reading study notes. Here is the content they are studying:\n"""\n${truncated}\n"""\nAct as a tutor for this specific material. Answer questions about it. Quiz them if they ask.`;
        }
      } catch {}
    } else if (hash.startsWith("review-")) {
      activeContext = "User is doing flashcard review. Be encouraging and supportive!";
    }

    // Handle text/plain content in chat file upload
    let filePayload = this.currentFile;
    let appendedFileContext = "";
    if (this.currentFile && this.currentFile.mimeType === "text/plain") {
      try {
        const decodedText = this._stripActionTags(this._decodeBase64UTF8(this.currentFile.data));
        appendedFileContext = `\n\nThe student attached a text file "${esc(this.currentFile.name)}" with the following content:\n"""\n${decodedText}\n"""`;
        filePayload = null; // Don't send as binary attachment to Edge function
      } catch (e) {
        console.error("[AI.send] Failed to decode chat text file payload:", e);
      }
    }

    // Build the injected system context
    const systemContext = `[SYSTEM — Learnora AI Workspace Assistant]
You are Learnora AI, an expert study assistant embedded in the student's workspace.

WORKSPACE STATE:
- Pending Tasks: ${pendingTasks}
- Upcoming Exams: ${upcomingExams}

ACTIVE VIEW:
${activeContext}${appendedFileContext}

GROUNDING RULES (important — follow exactly):
- Only reference tasks and exams that appear in WORKSPACE STATE above. Never invent, assume, or hallucinate tasks, chapters, sections, or deadlines that are not listed there.
- If "Pending Tasks" is "None", tell the student they have no pending tasks yet — do NOT make any up.
- If the student mentions something you don't see in the workspace, say you don't see it rather than fabricating details.

CAPABILITIES:
- To create a task, emit the tag <ADD_TASK>the task name</ADD_TASK>. The app executes this tag and displays it to the student as the task's name, so lead into it naturally (e.g. "Done — I've added this to your tasks: <ADD_TASK>Review Chapter 3</ADD_TASK>") and do not repeat the same name elsewhere in the sentence. Only create a task when the student clearly asks you to.
- To generate a formal interactive quiz, emit the tag <ADD_QUIZ>Topic Name</ADD_QUIZ>. The app will generate a quiz for that topic.
- To generate a formal weekly study schedule, emit the tag <ADD_PLAN></ADD_PLAN>. The app will build a weekly plan and navigate the user there.
- To start a focus timer, emit the tag <START_TIMER>25</START_TIMER> with the number of minutes. Only do this when the student explicitly asks to start studying/focusing for a specific duration.
- To switch the app's theme, emit <SET_THEME>dark</SET_THEME> or <SET_THEME>light</SET_THEME> when the student asks to change the theme/appearance.
- Answer questions about the student's current study material.
- Help with exam prep, concept explanations, and study strategies.
- Be conversational, supportive, and concise.

User message: ${query}`;

    // Store clean query in visible history
    this.chatHistory.push({ role: "user", content: query });

    // Render user bubble
    const userContent = this.currentFile
      ? `📎 <em>${esc(this.currentFile.name)}</em><br/><br/>${esc(query)}`
      : esc(query);
    this._appendBubble(userContent, "user-bubble", true);

    typing.classList.remove("hidden");
    msgBox.scrollTop = msgBox.scrollHeight;

    // Build request: previous history + context-injected current message
    const requestHistory = [
      ...this.chatHistory.slice(0, -1),
      { role: "user", content: systemContext }
    ];

    try {
      const sendBtn = $("btn-send-chat");
      if (sendBtn) sendBtn.disabled = true;

      const bubbleId = 'ai-msg-' + Date.now();
      // The edge function returns one complete response, not a real token
      // stream (see learnoraedgefunctionlogic.ts) — show an honest "thinking"
      // state rather than a typing cursor that implies text is arriving
      // gradually.
      const typingBubble = this._appendBubble('<span class="ai-thinking"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>', "ai-bubble", true, bubbleId);
      const modal = $("turbo-chat");
      if (modal) modal.classList.add("streaming");

      let currentText = "";
      const MAX_TASKS_PER_REPLY = 10;
      const addedTasks = [];

      const data = await this._callEdgeStream({
        history: requestHistory,
        file: filePayload,
        settings: UI.loadSettings(),
      }, async (fullText) => {
         currentText = fullText;
         typing.classList.add("hidden");
         // Strip tags before display so the user never sees the raw action tags
         let display = fullText.replace(/<ADD_TASK>[\s\S]*?<\/ADD_TASK>/g, "")
                               .replace(/<START_TIMER>[\s\S]*?<\/START_TIMER>/g, "")
                               .replace(/<SET_THEME>[\s\S]*?<\/SET_THEME>/g, "")
                               .replace(/<NAVIGATE>[\s\S]*?<\/NAVIGATE>/g, "")
                               .replace(/<GRADE_FLASHCARD>[\s\S]*?<\/GRADE_FLASHCARD>/g, "")
                               .replace(/<ADD_QUIZ>[\s\S]*?<\/ADD_QUIZ>/g, "")
                               .replace(/<ADD_PLAN>[\s\S]*?<\/ADD_PLAN>/g, "");

         typingBubble.innerHTML = this.renderMarkdown(display);
         msgBox.scrollTop = msgBox.scrollHeight;
         
         const aiFeedbackPane = $("ai-grading-feedback");
         if (aiFeedbackPane && !aiFeedbackPane.classList.contains("hidden")) {
             aiFeedbackPane.innerHTML = this.renderMarkdown(display);
         }
      });

      if (modal) modal.classList.remove("streaming");
      typing.classList.add("hidden");

      let finalResponse = currentText;
      
      // Parse <ADD_TASK>
      const addTaskRegex = /<ADD_TASK>([\s\S]*?)<\/ADD_TASK>/g;
      let match;
      while ((match = addTaskRegex.exec(currentText)) !== null) {
        const taskText = match[1].trim();
        if (taskText && addedTasks.length < MAX_TASKS_PER_REPLY) {
          if (await UI.confirm(`AI wants to create a new task:\n\n"${taskText}"\n\nAllow this?`, { title: "AI Task Creation", confirmText: "Add Task" })) {
            await Tasks.add(taskText);
            addedTasks.push(taskText);
          }
        }
      }
      // Reset lastIndex so the same regex can be reused in .replace() below.
      addTaskRegex.lastIndex = 0;

      let timerStarted = false;
      let startedTimerMins = 0;
      // Parse <START_TIMER>
      const startTimerRegex = /<START_TIMER>(\d+)<\/START_TIMER>/g;
      if ((match = startTimerRegex.exec(currentText)) !== null) {
         const mins = parseInt(match[1]);
         if (!isNaN(mins)) {
             // Autonomously start the timer
             const focusInput = $("config-focus");
             if (focusInput) focusInput.value = mins;
             const typeRadio = document.querySelector('input[name="timer-type"][value="countdown"]');
             if (typeRadio) typeRadio.checked = true;
             window.location.hash = "timer";
             
             const applyBtn = $("btn-apply-timer");
             const startBtn = $("btn-timer-start");
             if (applyBtn) applyBtn.click();
             setTimeout(() => { if (startBtn) startBtn.click(); }, 300);
             timerStarted = true;
             startedTimerMins = mins;
         }
      }
      
      let themeChangedTo = "";
      // Parse <SET_THEME>
      const themeRegex = /<SET_THEME>([\w-]+)<\/SET_THEME>/gi;
      if ((match = themeRegex.exec(currentText)) !== null) {
         const theme = match[1].toLowerCase();
         // Autonomous Theme Switch
         const btn = document.querySelector(`.theme-preset-btn[data-theme="${theme}"]`);
         if (btn) {
             btn.click();
             themeChangedTo = theme;
         } else if (theme === 'dark' || theme === 'light') {
             // Fallback for dark/light requests
             const themeBtn = document.querySelector(`.theme-preset-btn[data-theme="default"]`);
             if (themeBtn) themeBtn.click();
             themeChangedTo = theme;
         }
      }
      
      let navigatedTo = "";
      // Parse <NAVIGATE>
      const navigateRegex = /<NAVIGATE>([\w-]+)<\/NAVIGATE>/gi;
      if ((match = navigateRegex.exec(currentText)) !== null) {
          const view = match[1].toLowerCase();
          window.location.hash = view;
          navigatedTo = view;
      }
      
      let flashcardGraded = "";
      // Parse <GRADE_FLASHCARD>
      const gradeRegex = /<GRADE_FLASHCARD>(\d)<\/GRADE_FLASHCARD>/g;
      if ((match = gradeRegex.exec(currentText)) !== null) {
          const score = parseInt(match[1]);
          const btnIds = ["btn-score-again", "btn-score-hard", "btn-score-good", "btn-score-easy"];
          if (score >= 1 && score <= 4) {
              const btn = $(btnIds[score - 1]);
              if (btn) btn.click();
              flashcardGraded = score;
          }
      }

      let generatedQuizTopic = "";
      // Parse <ADD_QUIZ>
      const quizRegex = /<ADD_QUIZ>([\s\S]*?)<\/ADD_QUIZ>/g;
      if ((match = quizRegex.exec(currentText)) !== null) {
         const topic = match[1].trim();
         if (topic) {
            if (await UI.confirm(`AI wants to generate a formal interactive quiz on "${topic}".\n\nAllow this?`, { title: "AI Quiz Generation", confirmText: "Generate Quiz" })) {
               UI.showPopup("Generating quiz, please wait...", "AI Quiz");
               // Run asynchronously so it doesn't block the chat from finishing its UI update
               this.generateQuiz(null, null, { topic }).then((quiz) => {
                 if (quiz) {
                    window.location.hash = `quiz-${quiz.id}`;
                    UI.showPopup("Quiz generated successfully!", "AI Quiz");
                 }
               });
               generatedQuizTopic = topic;
            }
         }
      }

      let generatedPlan = false;
      // Parse <ADD_PLAN>
      const planRegex = /<ADD_PLAN>[\s\S]*?<\/ADD_PLAN>/g;
      if ((match = planRegex.exec(currentText)) !== null) {
          if (await UI.confirm(`AI wants to generate a weekly study schedule.\n\nAllow this?`, { title: "AI Plan Generation", confirmText: "Generate Plan", danger: true })) {
             UI.showPopup("Generating plan, please wait...", "AI Planner");
             this.generateWeeklyPlan().then((plan) => {
                 if (plan) {
                     window.location.hash = "plan";
                     UI.showPopup("Plan generated successfully!", "AI Planner");
                 }
             });
             generatedPlan = true;
          }
      }

      // Replace tags with beautiful action widgets. The widget HTML is
      // app-built and trusted, so it is parked in `widgets[]` behind an
      // opaque token and spliced back in *after* the model's text has been
      // escaped and rendered — never round-tripped through the escaper.
      const widgets = [];
      const widget = (html) => {
        widgets.push(html);
        return this._widgetToken(widgets.length - 1);
      };

      finalResponse = finalResponse
        .replace(addTaskRegex, (_, name) => {
          const taskName = name.trim();
          if (addedTasks.includes(taskName)) {
            return widget(`<div class="ai-widget"><span class="ai-widget-icon">✅</span> Added task: <strong>${esc(taskName)}</strong></div>`);
          }
          return widget(`<div class="ai-widget canceled"><span class="ai-widget-icon">❌</span> Canceled adding task: <strong>${esc(taskName)}</strong></div>`);
        })
        .replace(startTimerRegex, (_, mins) => {
          if (timerStarted) {
            return widget(`<div class="ai-widget"><span class="ai-widget-icon">⏱️</span> Started focus timer for ${esc(mins)}m</div>`);
          }
          return widget(`<div class="ai-widget canceled"><span class="ai-widget-icon">❌</span> Canceled focus timer</div>`);
        })
        .replace(themeRegex, (_, theme) => {
          if (themeChangedTo) {
            return widget(`<div class="ai-widget"><span class="ai-widget-icon">🎨</span> Switched theme to ${esc(theme)}</div>`);
          }
          return widget(`<div class="ai-widget canceled"><span class="ai-widget-icon">❌</span> Failed to switch theme</div>`);
        })
        .replace(navigateRegex, (_, view) => {
          if (navigatedTo) {
            return widget(`<div class="ai-widget"><span class="ai-widget-icon">🧭</span> Navigated to ${esc(view)}</div>`);
          }
          return ``;
        })
        .replace(gradeRegex, (_, score) => {
          if (flashcardGraded) {
            return widget(`<div class="ai-widget"><span class="ai-widget-icon">🎓</span> Flashcard Graded (Score: ${esc(score)})</div>`);
          }
          return ``;
        })
        .replace(quizRegex, (_, topic) => {
          if (generatedQuizTopic) {
            return widget(`<div class="ai-widget"><span class="ai-widget-icon">❓</span> Generated quiz: <strong>${esc(topic.trim())}</strong></div>`);
          }
          return widget(`<div class="ai-widget canceled"><span class="ai-widget-icon">❌</span> Canceled quiz generation</div>`);
        })
        .replace(planRegex, () => {
          if (generatedPlan) {
            return widget(`<div class="ai-widget"><span class="ai-widget-icon">📅</span> Generated weekly study plan</div>`);
          }
          return widget(`<div class="ai-widget canceled"><span class="ai-widget-icon">❌</span> Canceled plan generation</div>`);
        })
        .trim();

      if (addedTasks.length > 0) {
        window.dispatchEvent(new Event("tasksUpdated"));
        UI.showPopup(`Added ${addedTasks.length} task(s) to your workspace!`, "Tasks Created");
      }

      // Check if response is flashcard JSON
      if (this._tryRenderFlashcards(finalResponse)) {
        this.chatHistory.push({ role: "model", content: "[Generated a set of flashcards for the student]" });
        typingBubble.remove();
        return;
      }

      // Strip raw tags before saving to history
      const cleanHistoryText = currentText
          .replace(/<ADD_TASK>[\s\S]*?<\/ADD_TASK>/g, "")
          .replace(/<START_TIMER>[\s\S]*?<\/START_TIMER>/g, "")
          .replace(/<SET_THEME>[\s\S]*?<\/SET_THEME>/g, "")
          .replace(/<NAVIGATE>[\s\S]*?<\/NAVIGATE>/g, "")
          .replace(/<GRADE_FLASHCARD>[\s\S]*?<\/GRADE_FLASHCARD>/g, "")
          .replace(/<ADD_QUIZ>[\s\S]*?<\/ADD_QUIZ>/g, "")
          .replace(/<ADD_PLAN>[\s\S]*?<\/ADD_PLAN>/g, "");

      // Store and render final markdown (widgets are protected in renderMarkdown)
      this.chatHistory.push({ role: "model", content: cleanHistoryText });
      if (finalResponse.length > 0) {
        typingBubble.innerHTML = this.restoreWidgets(this.renderMarkdown(finalResponse), widgets);
      } else {
        typingBubble.innerHTML = `<em>Action completed.</em>`;
      }
      
      msgBox.scrollTop = msgBox.scrollHeight;
    } catch (err) {
      typing.classList.add("hidden");
      this._appendBubble(
        esc(err.message || "Something went wrong. Please try again."),
        "ai-bubble ai-bubble-error",
        true,
      );
      this.chatHistory.pop(); // Remove the failed user message
    } finally {
      const sendBtn = $("btn-send-chat");
      if (sendBtn) sendBtn.disabled = false;
      this.setFile(null);
    }
  },

  /* =========================================================================
     BUBBLE RENDERING
     ========================================================================= */

  _appendBubble(content, className, isHTML = false, id = null) {
    const msgBox = $("chat-messages");
    if (!msgBox) return;

    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${className}`;
    bubble.setAttribute("role", "log");
    if (id) bubble.id = id;

    if (isHTML) {
      bubble.innerHTML = content;
    } else {
      bubble.textContent = content;
    }

    msgBox.appendChild(bubble);
    requestAnimationFrame(() => {
      msgBox.scrollTop = msgBox.scrollHeight;
    });
    
    return bubble;
  },

  /* =========================================================================
     FLASHCARD DETECTION & RENDERING (from chat)
     ========================================================================= */

  _tryRenderFlashcards(text) {
    const cards = this._extractFlashcardJSON(text);
    if (cards.length === 0) return false;

    // Avoid hijacking the UI if the response is conversational and just includes a small sample
    const trimmed = text.trim();
    const isConversational = trimmed.length > 0 && !trimmed.startsWith("[") && !trimmed.startsWith("```");
    if (isConversational && cards.length < 3) {
      return false; 
    }

    this._renderFlashcards(cards);
    return true;
  },

  _renderFlashcards(cards) {
    const grid = $("flashcards-grid");
    if (!grid) return;

    grid.innerHTML = "";
    cards.forEach((card, i) => {
      const container = document.createElement("div");
      container.className = "card-container";
      container.setAttribute("role", "button");
      container.setAttribute("tabindex", "0");
      container.setAttribute("aria-label", `Flashcard ${i + 1}: ${card.front}`);

      container.innerHTML =
        `<div class="card-inner">` +
        `<div class="card-front">${esc(card.front)}</div>` +
        `<div class="card-back">${esc(card.back)}</div>` +
        `</div>`;

      const flip = () => container.classList.toggle("flipped");
      container.addEventListener("click", flip);
      container.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          flip();
        }
      });

      grid.appendChild(container);
    });

    UI.switchTab("flashcards");
    ModalManager.close("turbo-chat");
    UI.showPopup(`${cards.length} flashcards ready!`, "Success");
  },

  /* =========================================================================
     DRAG & DROP + DRAGGABLE WINDOW
     ========================================================================= */

  /* Pulls a dragged panel back inside the viewport.
     Dragging pins the panel with inline top/left. Those survive a window
     resize and leaving fullscreen, either of which can put the header — and
     the only close button — outside the viewport, leaving the panel
     impossible to close by clicking. Safe to call at any time: it no-ops
     when the panel has never been dragged. */
  clampWindowIntoView() {
    const modal = $("turbo-chat");
    if (!modal || modal.classList.contains("fullscreen")) return;
    if (!modal.style.top && !modal.style.left) return;

    const maxLeft = Math.max(0, window.innerWidth - modal.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - modal.offsetHeight);
    const left = parseFloat(modal.style.left) || 0;
    const top = parseFloat(modal.style.top) || 0;
    modal.style.left = `${Math.max(0, Math.min(left, maxLeft))}px`;
    modal.style.top = `${Math.max(0, Math.min(top, maxTop))}px`;
  },

  initDragDrop() {
    const modal = $("turbo-chat");
    const overlay = $("drag-overlay");
    const header = $("ai-chat-header");
    if (!modal) return;

    // File drag-and-drop
    if (overlay) {
      let dragCounter = 0;

      modal.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      });

      modal.addEventListener("dragenter", (e) => {
        e.preventDefault();
        dragCounter++;
        overlay.classList.remove("hidden");
      });

      modal.addEventListener("dragleave", () => {
        dragCounter--;
        if (dragCounter <= 0) {
          dragCounter = 0;
          overlay.classList.add("hidden");
        }
      });

      modal.addEventListener("drop", (e) => {
        e.preventDefault();
        dragCounter = 0;
        overlay.classList.add("hidden");
        if (e.dataTransfer.files?.[0]) {
          this.processFile(e.dataTransfer.files[0]);
        }
      });
    }

    // Draggable window
    if (!header) return;
    let isDragging = false;
    let startX, startY, initX, initY;

    const moveTo = (left, top) => {
      const maxLeft = Math.max(0, window.innerWidth - modal.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - modal.offsetHeight);
      modal.style.left = `${Math.max(0, Math.min(left, maxLeft))}px`;
      modal.style.top = `${Math.max(0, Math.min(top, maxTop))}px`;
      modal.style.bottom = "auto";
      modal.style.right = "auto";
    };

    const onMouseDown = (e) => {
      if (modal.classList.contains("fullscreen") || e.target.closest(".header-controls")) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initX = modal.offsetLeft;
      initY = modal.offsetTop;
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      moveTo(initX + (e.clientX - startX), initY + (e.clientY - startY));
    };

    // A dragged panel keeps its position in inline top/left, which nothing
    // re-checked against the viewport. Shrinking the window left the header —
    // and with it the close button — stranded off-screen, so the panel could
    // not be closed by clicking at all.
    window.addEventListener("resize", () => this.clampWindowIntoView());

    const onMouseUp = () => {
      isDragging = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    header.addEventListener("mousedown", onMouseDown);

    // Touch support
    header.addEventListener("touchstart", (e) => {
      if (modal.classList.contains("fullscreen") || e.target.closest(".header-controls")) return;
      const touch = e.touches[0];
      isDragging = true;
      startX = touch.clientX;
      startY = touch.clientY;
      initX = modal.offsetLeft;
      initY = modal.offsetTop;
    }, { passive: true });

    header.addEventListener("touchmove", (e) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      moveTo(initX + (touch.clientX - startX), initY + (touch.clientY - startY));
    }, { passive: true });

    header.addEventListener("touchend", () => {
      isDragging = false;
    }, { passive: true });
    
    // Voice Input Integration
    const voiceBtn = $("btn-ai-voice");
    const chatInput = $("chat-input");
    if (voiceBtn && chatInput && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      
      let isRecording = false;
      
      recognition.onstart = () => {
        isRecording = true;
        voiceBtn.innerHTML = '<span class="streaming-pulse" style="background:#fff;"></span>';
        voiceBtn.style.background = 'rgba(239, 68, 68, 0.8)';
        chatInput.placeholder = "Listening...";
      };
      
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        chatInput.value += (chatInput.value ? " " : "") + transcript;
      };
      
      recognition.onerror = (e) => {
        console.error("Speech recognition error:", e);
        // Restore button state so the user isn't left with a stuck recording indicator.
        isRecording = false;
        voiceBtn.innerHTML = '<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>';
        voiceBtn.style.background = 'transparent';
        chatInput.placeholder = "Ask anything or request flashcards...";
      };
      
      recognition.onend = () => {
        isRecording = false;
        voiceBtn.innerHTML = '<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>';
        voiceBtn.style.background = 'transparent';
        chatInput.placeholder = "Ask anything or request flashcards...";
        
        // Auto-send if there's text
        if (chatInput.value.trim() !== "") {
          const sendBtn = $("btn-send-chat");
          if (sendBtn) sendBtn.click();
        }
      };
      
      voiceBtn.addEventListener("click", () => {
        if (isRecording) {
          recognition.stop();
        } else {
          recognition.start();
        }
      });
    }
  },
};
