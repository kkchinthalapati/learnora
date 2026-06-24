import { supabase } from "./supabase.js";
import { UI } from "./ui.js";

export const AI = {
  chatHistory: [],
  currentFile: null,

  setFile(fileData) {
    this.currentFile = fileData;
    if (document.getElementById("file-name"))
      document.getElementById("file-name").innerText = fileData
        ? fileData.name
        : "";
    document
      .getElementById("file-preview-container")
      ?.classList.toggle("hidden", !fileData);
  },

  async send(query) {
    const msgBox = document.getElementById("chat-messages");
    const typing = document.getElementById("typing-indicator");

    this.chatHistory.push({ role: "user", content: query });
    let bubbleContent = this.currentFile
      ? `📎 <em>${this.currentFile.name}</em><br/><br/>${query}`
      : query;
    this.appendBubble(bubbleContent, "user-bubble", true);

    typing.classList.remove("hidden");
    msgBox.scrollTop = msgBox.scrollHeight;

    try {
      const { data, error } = await supabase.functions.invoke("learnora-ai", {
        body: {
          query,
          history: this.chatHistory,
          file: this.currentFile,
          settings: UI.loadSettings(),
        },
      });

      if (error) throw new Error("Connection failed.");
      typing.classList.add("hidden");

      // Hardened JSON Check
      try {
        let jsonStr = data.text;
        // Find array bounds if markdown wraps it
        const start = jsonStr.indexOf("[");
        const end = jsonStr.lastIndexOf("]");
        if (start !== -1 && end !== -1) {
          const parsed = JSON.parse(jsonStr.substring(start, end + 1));
          if (Array.isArray(parsed) && parsed[0].front) {
            this.renderFlashcards(parsed);
            return; // Halt chat render
          }
        }
      } catch (e) {
        /* Fallback to chat */
      }

      this.chatHistory.push({ role: "model", content: data.text });
      this.appendBubble(marked.parse(data.text), "ai-bubble", true);
    } catch (err) {
      typing.classList.add("hidden");
      this.appendBubble(
        err.message || "I need a breather. Try again.",
        "ai-bubble ai-bubble-error",
      );
      this.chatHistory.pop();
    }

    this.setFile(null); // Clear after sending
  },

  appendBubble(content, className, isHTML = false) {
    const msgBox = document.getElementById("chat-messages");
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${className}`;
    if (isHTML) bubble.innerHTML = content;
    else bubble.innerText = content;
    msgBox.appendChild(bubble);
    msgBox.scrollTop = msgBox.scrollHeight;
  },

  renderFlashcards(cards) {
    const grid = document.getElementById("flashcards-grid");
    if (!grid) return;
    grid.innerHTML = "";
    cards.forEach((card) => {
      const div = document.createElement("div");
      div.className = "card-container";
      div.onclick = () => div.classList.toggle("flipped");
      div.innerHTML = `<div class="card-inner"><div class="card-front">${card.front}</div><div class="card-back">${card.back}</div></div>`;
      grid.appendChild(div);
    });
    UI.switchTab("flashcards");
    document.getElementById("turbo-chat")?.classList.add("hidden");
    UI.showPopup("Flashcards ready!", "Success");
  },

  initDragDrop() {
    const modal = document.getElementById("turbo-chat");
    const overlay = document.getElementById("drag-overlay");
    const header = document.getElementById("ai-chat-header");

    if (modal && overlay) {
      modal.addEventListener("dragover", (e) => {
        e.preventDefault();
        overlay.classList.remove("hidden");
      });
      modal.addEventListener("dragleave", (e) => {
        if (e.target === overlay) overlay.classList.add("hidden");
      });
      modal.addEventListener("drop", (e) => {
        e.preventDefault();
        overlay.classList.add("hidden");
        if (e.dataTransfer.files?.[0])
          this.processFile(e.dataTransfer.files[0]);
      });
    }

    // Draggable window logic
    let isDragging = false,
      startX,
      startY,
      initX,
      initY;
    header?.addEventListener("mousedown", (e) => {
      if (
        modal.classList.contains("fullscreen") ||
        e.target.closest(".header-controls")
      )
        return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initX = modal.offsetLeft;
      initY = modal.offsetTop;
      document.addEventListener("mousemove", drag);
      document.addEventListener("mouseup", stop);
    });

    const drag = (e) => {
      if (!isDragging) return;
      modal.style.left = `${initX + (e.clientX - startX)}px`;
      modal.style.top = `${initY + (e.clientY - startY)}px`;
      modal.style.bottom = "auto";
      modal.style.right = "auto";
    };
    const stop = () => {
      isDragging = false;
      document.removeEventListener("mousemove", drag);
      document.removeEventListener("mouseup", stop);
    };
  },

  processFile(file) {
    const reader = new FileReader();
    reader.onload = (e) =>
      this.setFile({
        name: file.name,
        mimeType: file.type,
        data: e.target.result.split(",")[1],
      });
    reader.readAsDataURL(file);
  },
};
