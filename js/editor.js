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
        placeholder: 'Start typing your notes here...',
        // Explicit allowlist, mirroring what the toolbar actually offers.
        // Without it Quill keeps its full default format set, which includes
        // `video` — a blot that renders as an <iframe>. Stored HTML containing
        // an iframe survived clipboard.convert() as a video embed, giving a
        // same-origin frame of the app inside a note (clickjacking / spoofed
        // UI). Nothing in this editor needs embeds, so the format is dropped.
        formats: [
          'bold', 'italic', 'underline', 'strike',
          'font', 'size', 'color', 'background', 'script',
          'header', 'list', 'indent', 'align', 'blockquote',
          'code', 'code-block', 'formula', 'link', 'image'
        ]
      });

      // Hook up change events for auto-save
      this.quill.on('text-change', (delta, oldDelta, source) => {
        if (source === 'user') {
          this.dirty = true;
          this.scheduleSave();
        }
      });
    }

    // Load content.
    //
    // Never assign stored HTML straight to quill.root.innerHTML. html_content is
    // attacker-influenced — it round-trips through the DB and is seeded from
    // model output generated off an uploaded document — so assigning it builds
    // whatever DOM it describes. The app's CSP blocks inline handlers today, but
    // that is the last line of defence, not the first, and it does not stop
    // same-origin iframes, phishing anchors or spoofed UI chrome.
    //
    // clipboard.convert() parses the HTML into a Delta, keeping only the formats
    // Quill knows about and dropping every unknown tag, attribute and handler.
    // It also keeps Quill's document model in sync with the DOM, which a raw
    // innerHTML write does not — getPlainText() read stale/empty text right
    // after init, so the AI panel was being handed the wrong document context.
    this._setContentsFromHtml(
      initialHtml || (fallbackMarkdown ? AI.renderMarkdown(fallbackMarkdown) : "")
    );

    this.dirty = false;
    this._setReadOnly(!noteId);
  },

  /** Parse untrusted HTML through Quill's clipboard converter and load the
   *  resulting Delta. Anything Quill has no format for is discarded. */
  _setContentsFromHtml(html) {
    if (!this.quill) return;
    if (!html) {
      this.quill.setContents([], "silent");
      return;
    }
    const delta = this.quill.clipboard.convert({ html });
    this.quill.setContents(delta, "silent");
  },

  /** Notes that have no row yet cannot be saved — updateHtml() keys off the
   *  note id. Editing was silently discarded; lock the surface instead. */
  _setReadOnly(readOnly) {
    if (!this.quill) return;
    this.quill.enable(!readOnly);
    const toolbar = $("notes-quill-toolbar");
    if (toolbar) toolbar.classList.toggle("is-disabled", readOnly);
    const saveBtn = $("btn-save-notes");
    if (saveBtn) saveBtn.disabled = readOnly;
    if (readOnly) {
      this._setSaveStatus("Notes aren't ready to edit yet");
    }
  },

  /**
   * Triggers an immediate save of the editor's HTML to the database.
   */
  async save() {
    if (!this.noteId) {
      this._setSaveStatus("Notes aren't ready to edit yet");
      return;
    }
    if (this._isSaving) return;
    if (!this.dirty) {
      // Manual Save on an unchanged doc used to do nothing at all, which read
      // as a broken button. Acknowledge it instead.
      this._setSaveStatus("Saved");
      setTimeout(() => {
        if (!this.dirty) this._setSaveStatus("");
      }, 2000);
      return;
    }

    this._isSaving = true;
    this._setSaveStatus("Saving...");
    
    const htmlContent = this.quill.root.innerHTML;
    
    try {
      const updated = await Notes.updateHtml(this.noteId, htmlContent);
      if (updated) {
        this.dirty = false;
        this._setSaveStatus("Saved");
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
    this._setContentsFromHtml("");
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
      if (text === "Saved") {
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
