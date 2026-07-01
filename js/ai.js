import { supabase } from "./supabase.js";
import { UI, $, esc } from "./ui.js";
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

  async _callEdge(payload, retries = MAX_RETRIES) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const { data, error } = await supabase.functions.invoke("learnora-ai", {
          body: payload,
        });

        if (error) throw new Error(error.message || "Edge function error");
        if (!data || !data.text) throw new Error("Empty response from AI");

        return data;
      } catch (err) {
        const isLast = attempt === retries;
        const isRetryable = err.message?.includes("429") ||
                            err.message?.includes("503") ||
                            err.message?.includes("timeout") ||
                            err.message?.includes("fetch");

        if (isLast || !isRetryable) throw err;

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
      return `<pre class="glass-panel" style="padding:16px; margin:16px 0; overflow-x:auto; background:rgba(0,0,0,0.4); border-radius:var(--radius-md);"><code style="font-family:'Fira Code',monospace; color:#4AE283; font-size:0.9rem; line-height:1.5;">${code.trim()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`\n]+)`/g,
      '<code style="font-family:monospace; background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; color:var(--primary-color);">$1</code>');

    // Headers (process longest first to avoid conflicts)
    html = html.replace(/^#### (.*?)$/gm, '<h4 style="font-size:1.15rem; margin:20px 0 8px; color:var(--text-color); font-weight:600;">$1</h4>');
    html = html.replace(/^### (.*?)$/gm,  '<h3 style="font-size:1.3rem; margin:24px 0 10px; color:var(--text-color); font-weight:600;">$1</h3>');
    html = html.replace(/^## (.*?)$/gm,   '<h2 style="font-size:1.6rem; margin:28px 0 12px; color:var(--primary-color); font-weight:700;">$1</h2>');
    html = html.replace(/^# (.*?)$/gm,    '<h1 style="font-size:2rem; margin:32px 0 16px; color:var(--primary-color); font-weight:800;">$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Blockquotes
    html = html.replace(/^&gt; (.*?)$/gm,
      '<blockquote style="border-left:3px solid var(--primary-color); padding:8px 16px; margin:12px 0; opacity:0.85; font-style:italic;">$1</blockquote>');

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

    return html;
  },

  /* =========================================================================
     FLASHCARD JSON EXTRACTION — hardened parser with multiple fallbacks
     ========================================================================= */

  _extractFlashcardJSON(text) {
    if (!text) return [];

    // Strategy 1: Direct JSON.parse of trimmed text
    try {
      const trimmed = text.trim();
      if (trimmed.startsWith("[")) {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && parsed.length && parsed[0].front) return parsed;
      }
    } catch {}

    // Strategy 2: Strip markdown code fences
    try {
      let cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
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
        const parsed = JSON.parse(text.substring(start, end + 1));
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
          const decoded = atob(fileDataPayload.data);

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

      const data = await this._callEdge({
        history: [{ role: "user", content: prompt }],
        file: filePayload,
        settings: UI.loadSettings(),
      });

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
      pendingTasks = tasks.filter(t => !t.is_done).map(t => t.text).join(", ") || "None";
      upcomingExams = exams.map(e => `${e.exam_name} on ${e.exam_date}`).join(", ") || "None";
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
          const truncated = notes[0].markdown_content.substring(0, 3000);
          activeContext = `User is reading study notes. Here is the content they are studying:\n"""\n${truncated}\n"""\nAct as a tutor for this specific material. Answer questions about it. Quiz them if they ask.`;
        }
      } catch {}
    } else if (hash.startsWith("review-")) {
      activeContext = "User is doing flashcard review. Be encouraging and supportive!";
    }

    // Build the injected system context
    const systemContext = `[SYSTEM — Learnora AI Workspace Assistant]
You are Learnora AI, an expert study assistant embedded in the student's workspace.

WORKSPACE STATE:
- Pending Tasks: ${pendingTasks}
- Upcoming Exams: ${upcomingExams}

ACTIVE VIEW:
${activeContext}

CAPABILITIES:
- To create a task, output: <ADD_TASK>task text</ADD_TASK>
- Answer questions about the student's current study material
- Help with exam prep, concept explanations, and study strategies
- Be conversational, supportive, and concise

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
      const data = await this._callEdge({
        history: requestHistory,
        file: this.currentFile,
        settings: UI.loadSettings(),
      });

      typing.classList.add("hidden");

      let responseText = data.text;

      // Parse and execute tool calls
      const addTaskRegex = /<ADD_TASK>(.*?)<\/ADD_TASK>/g;
      let match;
      let tasksAdded = 0;
      while ((match = addTaskRegex.exec(responseText)) !== null) {
        const taskText = match[1].trim();
        if (taskText) {
          await Tasks.add(taskText);
          tasksAdded++;
        }
      }
      responseText = responseText.replace(addTaskRegex, "").trim();

      if (tasksAdded > 0) {
        UI.showPopup(`Added ${tasksAdded} task(s) to your workspace!`, "Tasks Created");
      }

      // Check if response is flashcard JSON
      if (this._tryRenderFlashcards(responseText)) return;

      // Store and render
      this.chatHistory.push({ role: "model", content: responseText });
      if (responseText.trim().length > 0) {
        // Use our local markdown renderer instead of unreliable global `marked`
        const rendered = typeof marked !== "undefined"
          ? marked.parse(responseText)
          : this.renderMarkdown(responseText);
        this._appendBubble(rendered, "ai-bubble", true);
      }
    } catch (err) {
      typing.classList.add("hidden");
      this._appendBubble(
        esc(err.message || "Something went wrong. Please try again."),
        "ai-bubble ai-bubble-error",
        true,
      );
      this.chatHistory.pop(); // Remove the failed user message
    } finally {
      this.setFile(null);
    }
  },

  /* =========================================================================
     BUBBLE RENDERING
     ========================================================================= */

  _appendBubble(content, className, isHTML = false) {
    const msgBox = $("chat-messages");
    if (!msgBox) return;

    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${className}`;
    bubble.setAttribute("role", "log");

    if (isHTML) {
      bubble.innerHTML = content;
    } else {
      bubble.textContent = content;
    }

    msgBox.appendChild(bubble);
    requestAnimationFrame(() => {
      msgBox.scrollTop = msgBox.scrollHeight;
    });
  },

  /* =========================================================================
     FLASHCARD DETECTION & RENDERING (from chat)
     ========================================================================= */

  _tryRenderFlashcards(text) {
    const cards = this._extractFlashcardJSON(text);
    if (cards.length === 0) return false;
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
    $("turbo-chat")?.classList.add("hidden");
    UI.showPopup(`${cards.length} flashcards ready!`, "Success");
  },

  /* =========================================================================
     DRAG & DROP + DRAGGABLE WINDOW
     ========================================================================= */

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
      let newLeft = initX + (e.clientX - startX);
      let newTop = initY + (e.clientY - startY);
      const maxLeft = window.innerWidth - modal.offsetWidth;
      const maxTop = window.innerHeight - modal.offsetHeight;
      newLeft = Math.max(0, Math.min(newLeft, maxLeft));
      newTop = Math.max(0, Math.min(newTop, maxTop));
      modal.style.left = `${newLeft}px`;
      modal.style.top = `${newTop}px`;
      modal.style.bottom = "auto";
      modal.style.right = "auto";
    };

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
      let newLeft = initX + (touch.clientX - startX);
      let newTop = initY + (touch.clientY - startY);
      const maxLeft = window.innerWidth - modal.offsetWidth;
      const maxTop = window.innerHeight - modal.offsetHeight;
      newLeft = Math.max(0, Math.min(newLeft, maxLeft));
      newTop = Math.max(0, Math.min(newTop, maxTop));
      modal.style.left = `${newLeft}px`;
      modal.style.top = `${newTop}px`;
      modal.style.bottom = "auto";
      modal.style.right = "auto";
    }, { passive: true });

    header.addEventListener("touchend", () => {
      isDragging = false;
    }, { passive: true });
  },
};
