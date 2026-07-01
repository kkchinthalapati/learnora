import { supabase } from "./supabase.js";
import { UI, $, esc } from "./ui.js";
import { Tasks, Exams } from "./api.js";

/* =========================================================================
   AI MODULE — Chat, file handling, flashcard generation
   ========================================================================= */

export const AI = {
  chatHistory: [],
  currentFile: null,

  /* ------ File management ------ */

  setFile(fileData) {
    this.currentFile = fileData;
    const nameEl = $("file-name");
    const preview = $("file-preview-container");
    if (nameEl) nameEl.textContent = fileData ? fileData.name : "";
    preview?.classList.toggle("hidden", !fileData);
  },

  /* ------ Ingestion Orchestration (Phase 4) ------ */

  async generateStudyMaterial(material, folderId, fileDataPayload) {
    try {
      const { Notes, Decks, Flashcards } = await import("./api.js");
      
      let finalPrompt = `
[SYSTEM INSTRUCTION: You are processing a study material document for the user. 
Please read the provided file/text and generate TWO things exactly in this format:
1. Markdown structured notes summarizing the core concepts.
2. A special separator: "---FLASHCARDS---"
3. A JSON array of flashcards, e.g. [{"front": "Q1", "back": "A1"}]. Do NOT put markdown blocks around the JSON.
]
`;

      let filePayloadToSend = fileDataPayload;

      // Gemini inlineData does NOT support text/plain.
      // If it's a URL or raw text, we decode and append it directly to the text query.
      if (fileDataPayload && fileDataPayload.mimeType === "text/plain") {
        try {
          const decodedText = atob(fileDataPayload.data);
          finalPrompt += `\n\nStudy Material Content:\n${decodedText}`;
          filePayloadToSend = null; // Don't send as file attachment
        } catch (e) {
          console.error("Failed to decode text payload:", e);
        }
      }

      const { data, error } = await supabase.functions.invoke("learnora-ai", {
        body: {
          history: [{ role: "user", content: finalPrompt }], // Pass prompt as the last history item
          file: filePayloadToSend,
          settings: UI.loadSettings(),
        },
      });

      if (error) throw new Error("Learnora AI Edge Function failed: " + error.message);
      if (!data || !data.text) throw new Error("Empty response from AI.");

      const responseText = data.text;
      
      // Parse output
      const parts = responseText.split("---FLASHCARDS---");
      const markdownNotes = parts[0] ? parts[0].trim() : "No notes generated.";
      
      let flashcardsData = [];
      if (parts[1]) {
        try {
          // Attempt to parse the JSON array
          let rawJson = parts[1].trim();
          // Remove any stray markdown code blocks if the AI accidentally wrapped it
          if (rawJson.startsWith("```json")) {
            rawJson = rawJson.replace(/```json/g, "").replace(/```/g, "").trim();
          }
          flashcardsData = JSON.parse(rawJson);
        } catch (e) {
          console.error("Failed to parse flashcards JSON:", e, parts[1]);
        }
      }

      // Save Notes
      if (markdownNotes) {
        await Notes.add(material.id, markdownNotes);
      }

      // Save Flashcards
      if (flashcardsData && flashcardsData.length > 0) {
        const deck = await Decks.add(folderId, material.title + " Flashcards");
        await Flashcards.addBatch(deck.id, flashcardsData);
      }

      console.log("✅ Ingestion completely successful.");
    } catch (err) {
      console.error("🚨 Ingestion Pipeline Error:", err);
    }
  },

  processFile(file) {
    if (!file) return;

    // Size guard: 10MB max
    if (file.size > 10 * 1024 * 1024) {
      UI.showPopup("File too large. Maximum size is 10MB.", "Upload Error");
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      UI.showPopup("Failed to read file.", "Upload Error");
    };
    reader.onload = (e) => {
      this.setFile({
        name: file.name,
        mimeType: file.type,
        data: e.target.result.split(",")[1],
      });
    };
    reader.readAsDataURL(file);
  },

  /* ------ Chat send ------ */

  async send(query) {
    const msgBox = $("chat-messages");
    const typing = $("typing-indicator");
    if (!msgBox || !typing) return;

    // Fetch base workspace context
    const tasks = await Tasks.fetch();
    const exams = await Exams.fetch();
    const pendingTasks = tasks.filter(t => !t.is_done).map(t => t.text).join(", ") || "None";
    const upcomingExams = exams.map(e => `${e.exam_name} on ${e.exam_date}`).join(", ") || "None";

    // Determine active route context for true Turbo.ai feel
    let activeContextString = "User is on the general dashboard.";
    const hash = window.location.hash.replace("#", "");
    
    if (hash.startsWith("folder-")) {
      const folderId = hash.replace("folder-", "");
      activeContextString = `User is currently viewing Folder/Workspace ID: ${folderId}. They are studying this specific course/subject right now.`;
    } else if (hash.startsWith("notes-")) {
      const materialId = hash.replace("notes-", "");
      try {
        const { Notes } = await import("./api.js");
        const notes = await Notes.fetchByMaterial(materialId);
        if (notes && notes.length > 0) {
          activeContextString = `User is currently reading these specific study notes:\n"""\n${notes[0].markdown_content}\n"""\nAct as a tutor specifically for the content of these notes.`;
        }
      } catch(e) {}
    } else if (hash.startsWith("review-")) {
      activeContextString = "User is currently doing Spaced Repetition Flashcard review. Encourage them!";
    }

    const workspaceContext = `
[SYSTEM INSTRUCTION: You are a Turbo.ai-like specialized study assistant integrated directly into the user's workspace.
CURRENT WORKSPACE STATE:
- Pending Tasks: ${pendingTasks}
- Upcoming Exams: ${upcomingExams}

ACTIVE VIEW CONTEXT:
${activeContextString}

If the user asks you to create a task, you MUST output the exact string <ADD_TASK>task description here</ADD_TASK> anywhere in your response. We will parse this and add the task automatically. Do NOT say "I have added it" unless you output the tag. 
]

User query: ${query}
`;

    // Only store the original query in the visible history to avoid polluting context window too much over time
    this.chatHistory.push({ role: "user", content: query });

    // Render user bubble (XSS-safe)
    const userContent = this.currentFile
      ? `📎 <em>${esc(this.currentFile.name)}</em><br/><br/>${esc(query)}`
      : esc(query);
    this._appendBubble(userContent, "user-bubble", true);

    typing.classList.remove("hidden");
    msgBox.scrollTop = msgBox.scrollHeight;

    // Build the request history: Previous history + the context-injected current message at the end
    const requestHistory = [
      ...this.chatHistory.slice(0, -1),
      { role: "user", content: workspaceContext }
    ];

    try {
      const { data, error } = await supabase.functions.invoke("learnora-ai", {
        body: {
          history: requestHistory, // Send the full history with the final message holding the injected context
          file: this.currentFile,
          settings: UI.loadSettings(),
        },
      });

      if (error) throw new Error("Connection failed.");
      if (!data || !data.text) throw new Error("Empty response from AI.");

      typing.classList.add("hidden");

      let responseText = data.text;

      // Parse commands (Tool Calling)
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
      // Strip commands from output so user doesn't see them
      responseText = responseText.replace(addTaskRegex, "").trim();

      // Refresh UI if tasks were added
      if (tasksAdded > 0) {
        // We dispatch an event or rely on main.js reloading tasks.
        // Easiest is to force a re-render by calling the globally bound renderTasks if it exists,
        // but for now we just show a popup. The user will see them when they switch tabs.
        UI.showPopup(`Added ${tasksAdded} task(s) to your workspace!`, "Tasks Created");
      }

      // Attempt to detect flashcard JSON in the response
      if (this._tryRenderFlashcards(responseText)) return;

      this.chatHistory.push({ role: "model", content: responseText });
      if (responseText.trim().length > 0) {
        this._appendBubble(marked.parse(responseText), "ai-bubble", true);
      }
    } catch (err) {
      typing.classList.add("hidden");
      this._appendBubble(
        esc(err.message || "Something went wrong. Try again."),
        "ai-bubble ai-bubble-error",
        true,
      );
      this.chatHistory.pop();
    } finally {
      this.setFile(null);
    }
  },

  /* ------ Bubble rendering ------ */

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

  /* ------ Flashcard detection & rendering ------ */

  _tryRenderFlashcards(text) {
    try {
      const start = text.indexOf("[");
      const end = text.lastIndexOf("]");
      if (start === -1 || end === -1 || end <= start) return false;

      const parsed = JSON.parse(text.substring(start, end + 1));
      if (!Array.isArray(parsed) || !parsed.length || !parsed[0].front) return false;

      this._renderFlashcards(parsed);
      return true;
    } catch {
      return false;
    }
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

  /* ------ Drag & Drop + Draggable window ------ */

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

    // Touch support for mobile drag
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
