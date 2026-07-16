# Learnora Bug Fixes & Improvements Summary

This document summarizes all the bugs fixed and enhancements implemented in the Learnora study planner app. 

---

## 🛠️ Summary of Changes by Bug / Feature

### 1. Splash Screen (Login Flash Screen)
- **Problem:** Opening the app would briefly show the login screen (`#auth-wall`) or a blank screen before `Auth.getSession()` finished checking the user session.
- **Root Cause:** The `#global-loader` element had a semi-transparent background (`rgba(10, 5, 20, 0.6)`), allowing the hidden layout or login layout to show through.
- **Fix:**
  - Upgraded `#global-loader` in `index.html` to a full-screen, solid-background (`var(--bg)`) splash screen styled with the Learnora logo, title, and a loader wheel.
  - Added a smooth pulse animation to the splash logo.

---

### 2. Ghost Teal Floating Element (Bug 1)
- **Problem:** When the AI panel expand button was clicked and later closed, a teal/cyan circle (pulse/streaming indicator) remained drifting on the screen, overlapping controls.
- **Root Cause:** The pulse element (`.streaming-pulse`) was appended to the DOM when streaming started but was never cleaned up or removed when the panel closed.
- **Fix:**
  - Added cleanup logic to the close button listener (`btn-ai-close`) in `js/main.js` to find and `.remove()` any remaining `.streaming-pulse` elements.

---

### 3. AI Actions Without Confirmation (Bug 2)
- **Problem:** When the AI responded with commands like `<ADD_TASK>`, `<START_TIMER>`, or `<SET_THEME>`, they executed immediately without confirming with the user.
- **Root Cause:** The HTML parser in `js/ai.js` executed actions instantly once the tags were rendered.
- **Fix:**
  - Wrapped these action handlers in `js/ai.js` inside a `UI.confirm(...)` call.
  - If the user clicks "Cancel" (No), it safely displays a "[Canceled]" notification message on the chat UI instead of executing the action.

---

### 4. Calendar Date Pre-fill Error (Bug 3)
- **Problem:** Clicking a date cell in the Calendar view opened the "New Exam" modal, but the date field was not pre-populated with the clicked date.
- **Root Cause:** The click event handler was trying to read an index instead of a calendar day date string.
- **Fix:**
  - Added `cell.dataset.date = dateStr;` in `js/main.js` `renderCalendar()`.
  - Updated the event listener to read `e.currentTarget.dataset.date` and pass it to `openExamModal(null, date)`.

---

### 5. Upload Page Full-Page Blur/Spinner (Bug 4)
- **Problem:** Navigating to the Upload tab triggered a global full-screen spinner.
- **Root Cause:** `router.js` called `UI.setGlobalLoading(true)` on every view switch, which is unnecessary for a static upload form.
- **Fix:**
  - Refactored `loadFolders(route)` in `js/router.js` to skip the global loading spinner when the target view is `upload`.

---

### 6. AI Streaming/Frozen Response (Bug 5)
- **Problem:** While the AI was typing/streaming a response, users could keep clicking "Send", leading to overlapping requests or freezing.
- **Root Cause:** The text area and send button were not disabled during processing.
- **Fix:**
  - Disabled the send button (`btn-send-chat`) and chat input field during streaming in `js/ai.js`.
  - Ensured they are re-enabled in a `finally` block once the stream finishes.

---

### 7. Task Input Validation & Shake Feedback (Bug 6)
- **Problem:** Users could submit empty tasks, and there was no visual error feedback.
- **Root Cause:** No validation check on inputs before saving to the database.
- **Fix:**
  - Added empty checks for task name inputs in both Dashboard quick-add and Task Manager view.
  - Added a `.input-error` class that triggers a CSS shake animation (`@keyframes shake-error`) in `style.css` to notify the user.

---

### 8. Validate New Folder Modal Input (Bug 7)
- **Problem:** Creating a new folder with an empty name closed the dialog anyway without creating anything.
- **Root Cause:** Dialog utility (`UI._dialog`) resolved the promise with empty strings.
- **Fix:**
  - Modified the prompt dialog confirmation in `js/ui.js` to validate that the input is not empty. If it is empty, it adds the `.input-error` shake animation and blocks completion.

---

### 9. New Exam Modal Missing Status Field (Bug 8)
- **Problem:** The "Status" field was missing when creating a new exam.
- **Root Cause:** The status form group was hidden programmatically during the modal initiation.
- **Fix:**
  - Updated `openExamModal` in `js/main.js` to keep the exam status field visible for both creation and editing.

---

### 10. Timer Auto-run Behavior (Bug 9)
- **Problem:** Clicking 90m/45m/20m presets automatically started the timer running.
- **Root Cause:** The preset buttons triggered `Timer.applyNow()` which immediately reset and activated the countdown.
- **Fix:**
  - Modified the preset button event handler in `js/main.js` to only populate the config input boxes (`config-focus`, `config-short`, etc.) and activate the Pomodoro tab option without triggering the timer run sequence.

---

### 11. Flashcards Page Entry Point (Bug 10)
- **Problem:** Flashcard decks generated by AI had no permanent page where they could be accessed once the chat closed.
- **Root Cause:** The router did not have a handler for the `#flashcards` hash route.
- **Fix:**
  - Added `fetchAll()` in `Decks` (in `js/api.js`) to load all of a user's decks.
  - Added `loadAllFlashcards()` in `js/router.js` to render the decks on the Flashcards page.

---

### 12. Task Deletion Undo (Bug 11)
- **Problem:** Deleting tasks was permanent with no safety net.
- **Root Cause:** Deletion immediately invoked the database delete command.
- **Fix:**
  - Replaced immediate deletion with a 5-second toast notification offering an "Undo" option.
  - If "Undo" is clicked, it cancels the scheduled deletion. Otherwise, it commits the deletion after 5 seconds.

---

### 13. Settings/Preferences Layout (Bug 12)
- **Problem:** The settings layout looked squished/broken when zoomed or on small viewports.
- **Root Cause:** The layout was using rigid flex layouts.
- **Fix:**
  - Converted `.setting-row` in `style.css` to use a flexible CSS Grid (`grid-template-columns: repeat(auto-fit, minmax(240px, 1fr))`) to handle column breaks cleanly.

---

### 14. Focus Time Stats Formatter (Bug 13)
- **Problem:** Focus time values were displayed inconsistently (e.g. `90m Focus` vs. `1.5h`).
- **Root Cause:** Different formats were coded inline in various widgets.
- **Fix:**
  - Built a centralized `formatFocusTime(minutes)` helper in `js/main.js` that formats durations consistently as `Xh Ym` (or `Xm` if under an hour).
