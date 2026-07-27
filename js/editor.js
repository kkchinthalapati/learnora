import { $, UI, esc } from "./ui.js";
import { Notes } from "./api.js";
import { AI } from "./ai.js";

/* =========================================================================
   EDITOR MODULE — Turbo.ai-style split-pane Quill wrapper
   ========================================================================= */

export const Editor = {
  quill: null,
  materialId: null,
  noteId: null,
  saveTimer: null,
  dirty: false,
  _isSaving: false,

  /**
   * Initializes the Quill editor for a given note.
   * @param {string} materialId - ID of the material the notes belong to
   * @param {string} noteId - ID of the note record
   * @param {string} initialHtml - HTML content to load
   * @param {string} fallbackMarkdown - Markdown content to use if HTML is missing
   * @param {string} title - Title of the material to show in toolbar
   */
  init(materialId, noteId, initialHtml, fallbackMarkdown, title) {
    this.materialId = materialId;
    this.noteId = noteId;
    
    // Set title
    const titleEl = $("notes-doc-title");
    if (titleEl) titleEl.textContent = title;
    
    // Clear save status
    this._setSaveStatus("");

    // Initialize Quill only once
    if (!this.quill) {
      // Must use window.Quill because it's loaded via CDN script tag
      const Quill = window.Quill;
      if (!Quill) {
        console.error("Quill JS not loaded!");
        return;
      }

      this.quill = new Quill('#notes-quill-editor', {
        modules: {
          toolbar: '#notes-quill-toolbar'
        },
        theme: 'snow',
        placeholder: 'Start typing your notes here...'
      });

      // Hook up change events for auto-save
      this.quill.on('text-change', (delta, oldDelta, source) => {
        if (source === 'user') {
          this.dirty = true;
          this.scheduleSave();
        }
      });
    }

    // Load content
    if (initialHtml) {
      this.quill.root.innerHTML = initialHtml;
    } else if (fallbackMarkdown) {
      // Fall back to rendered markdown if no HTML is present (e.g., first time opened after generation)
      this.quill.root.innerHTML = AI.renderMarkdown(fallbackMarkdown);
    } else {
      this.quill.root.innerHTML = "";
    }
    
    this.dirty = false;
  },

  /**
   * Triggers an immediate save of the editor's HTML to the database.
   */
  async save() {
    if (!this.noteId || !this.dirty || this._isSaving) return;
    
    this._isSaving = true;
    this._setSaveStatus("Saving...");
    
    const htmlContent = this.quill.root.innerHTML;
    
    try {
      const updated = await Notes.updateHtml(this.noteId, htmlContent);
      if (updated) {
        this.dirty = false;
        this._setSaveStatus("Saved ✓");
        setTimeout(() => {
          if (!this.dirty) this._setSaveStatus("");
        }, 2000);
      } else {
        this._setSaveStatus("Failed to save");
      }
    } catch (e) {
      console.error("[Editor.save] error", e);
      this._setSaveStatus("Failed to save");
    } finally {
      this._isSaving = false;
    }
  },

  /**
   * Debounces the save function, called after every user edit.
   */
  scheduleSave() {
    this._setSaveStatus("Unsaved changes");
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.save();
    }, 2000);
  },

  /**
   * Cleans up the editor before navigating away.
   * Flushes any pending saves synchronously-ish.
   */
  destroy() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (this.dirty) {
      // Fire-and-forget save before we leave
      this.save();
    }
    this.materialId = null;
    this.noteId = null;
    if (this.quill) {
      this.quill.root.innerHTML = "";
    }
  },

  /**
   * Returns the plain text of the editor (used for AI context).
   */
  getPlainText() {
    if (!this.quill) return "";
    return this.quill.getText();
  },

  /**
   * Helper to set the status text in the UI
   */
  _setSaveStatus(text) {
    const el = $("notes-save-status");
    if (el) {
      el.textContent = text;
      if (text === "Saved ✓") {
        el.style.color = "var(--success)";
      } else if (text === "Unsaved changes") {
        el.style.color = "var(--warning)";
      } else if (text === "Failed to save") {
        el.style.color = "var(--danger)";
      } else {
        el.style.color = "var(--text-muted)";
      }
    }
  }
};
