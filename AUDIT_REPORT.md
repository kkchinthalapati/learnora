# 🎓 Learnora Full Feature & UX Audit Report: The Brutal Student Verdict

> **Tester Persona**: Exhausted A-Level / University STEM student cramming at 1:30 AM. Zero patience for 4-click setup wizards, hates patronising clutter, but loves aesthetic, blazingly fast study tools that actually help ace exams.

---

## 1. Executive Student Verdict

**Overall Grade**: **A- (87/100)**  
**Summary**: *"An absolute powerhouse of a study platform with legitimate S-tier cognitive science under the hood, but holding itself back with duplicate dashboard buttons, a few multi-click friction traps, and a tab-switching split inside the new Notebooks Studio."*

---

## 2. What Hits Hard (The S-Tier Features) 🔥

These are the features that make students say *"I am deleting Anki, Notion, and Forest"*:

### ⚡ 1. The Distraction Scratchpad (`Alt+N`) & Focus HUD
- **File**: `webapp/src/views/timer/FocusStudyHUD.tsx:116-170`
- **Why it’s gold**: The floating dock with subject accent ring, countdown, `+5m` extender, and instant popup scratchpad solves the #1 study killer: getting derailed by stray thoughts. It auto-saves to local storage without leaving the current view.

### 🧠 2. Feynman AI Apprentice & Reactive Emotion Gauge
- **Files**: `webapp/src/views/feynman/FeynmanStudioView.tsx:356-400`, `webapp/src/views/feynman/FeynmanDebriefView.tsx:247-294`
- **Why it’s gold**: Teaching an AI student that harbors realistic misconceptions (*"Wait, so photons lose mass when they slow down in glass?"*) activates deep conceptual intuition. The reactive emotion badge (`🤔 Confused` → `💡 Lightbulb Moment`) and **1-click Export to Flashcard Deck** on the debrief screen are addictive.

### 🎧 3. Zero-Asset Web Audio Synthesized Soundscapes
- **File**: `webapp/src/views/room/StudyRoomView.tsx:14-21`, `webapp/src/views/room/audioAmbiance.ts`
- **Why it’s gold**: Synthesising Brown Noise, Rain, Cafe Murmur, and 10Hz Alpha Waves natively in real-time via the Web Audio API without buffering large external MP3 files means instant playback, zero battery lag, and full offline capability on flaky campus Wi-Fi.

### 📚 4. Grounded Notebook Studio with Verified Citations
- **File**: `webapp/src/views/notebooks/NotebookStudioView.tsx:97-130`
- **Why it’s gold**: Grounding answers strictly in the student's selected textbook chapters with numbered citation chips `[1]`, `[2]` prevents AI hallucinations before high-stakes exams.

---

## 3. What Misses the Mark (The Annoying Friction Points) 🛑

### 🛑 1. Dashboard Decision Paralysis (5 Competing Focus Buttons)
- **File**: `webapp/src/views/dashboard/DashboardView.tsx:32-145`
- **The Issue**: A student opening the dashboard is presented with **5 separate buttons** all offering to start a study/review session:
  1. *Header*: `"Start focus session"`
  2. *Priority Grid*: `"Start drill"` on `DailyDrillCard` + `"Review now"` on `TasksCard`
  3. *Current Work*: `"Resume"` on `ResumeLearningCard` + `"Start focus session"` on `FocusCard`
  4. *Adaptive Section*: `"Smart Adaptive Review"` on `AdaptiveHealthWidget`
- **Student Fix**: Merge these into one prominent **"Next Best Action" Spotlight** at the top of the dashboard:
  `[ ⚡ 25m Focus: Physics Paper 1 (3 Days Away) — Resume Ch.4 Notes ]`

---

### 🛑 2. Notebooks Studio Tab Switch Hides Your Notes
- **File**: `webapp/src/views/notebooks/NotebookStudioView.tsx:371-413`
- **The Issue**: In the centre panel, switching between **"Grounded AI Tutor"** (Chat) and **"Notes Canvas"** hides your notes completely while you are chatting with the AI.
- **Student Fix**: Split the centre panel into side-by-side **Notes Editor** and **AI Tutor Assistant** so students can write and consult their sources simultaneously without tab toggling.

---

### 🛑 3. Timer "Apply & Reset" Requirement & Task Dropdown
- **File**: `webapp/src/views/timer/TimerView.tsx:208-213, 321-364`
- **The Issue**:
  - Typing a new focus duration (e.g. 45 mins) does not update the clock until you scroll down and click a separate `"Apply & Reset"` button.
  - The task selector is a plain HTML `<select>`: if you have 30 tasks, finding the right one is tedious.
- **Student Fix**: Auto-update the staging clock on preset/input change, and replace `<select>` with the searchable `Combobox`.

---

### 🛑 4. Artifact Previews are Read-Only Modals
- **File**: `webapp/src/views/notebooks/NotebookStudioView.tsx:705-729`
- **The Issue**: Generating a "Revision Cheat Sheet" or "Feynman Breakdown" opens a static modal with unformatted text and only a "Copy to clipboard" button.
- **Student Fix**: Allow 1-click **"Insert into Notes Canvas"** and **"Create Flashcard Deck from Cheat Sheet"**.

---

## 4. 'Too Flashy vs Actually Useful' Breakdown ⚖️

| Feature | Utility Rating | Verdict |
| :--- | :---: | :--- |
| **`Alt+N` Distraction Scratchpad** | 🟢 **10/10** | Essential. Keeps wandering thoughts off social media. |
| **Grounded Citations in Notebooks** | 🟢 **9.5/10** | Game-changer for exam trust. |
| **Feynman Misconception Arena** | 🟢 **9/10** | Far superior to generic ChatGPT prompt wrappers. |
| **Synthesized Audio Ambiance** | 🟢 **9/10** | Offline, instantaneous, zero battery impact. |
| **Custom Theme Studio (3-colour blend)** | 🟡 **6/10** | Neat, but can be distracting during intense revision. |
| **Liquid Mesh Atmospheric Gradient** | 🔴 **4/10** | Drains laptop battery during late-night library sessions; needs a pure OLED Dark Mode toggle. |
| **Notebook Studio Tab Switching** | 🔴 **3/10** | Hiding notes while chatting breaks the study flow. |

---

## 5. Technical & Edge-Case Vulnerabilities Found

1. **Broken Route in Flashcard Recap (404 Bug)**:
   - `webapp/src/views/review/ReviewView.tsx:1530`: Navigates to `/library/subject/${folderId}` instead of `/folders/${folderId}`.
2. **Demo Notebooks Resurrecting on Delete**:
   - `webapp/src/hooks/useNotebooks.ts:90-97`: Deleting all notebooks re-seeds the default demo notebooks upon page reload.
3. **Mobile Feature Lockout in Notebook Studio (<860px)**:
   - `webapp/src/views/notebooks/notebooks.module.css:701-709`: Both Sources Desk and Studio Tools are set to `display: none` on mobile without providing a bottom drawer/tabs toggle.
4. **Unhandled AI Timeout in Feynman Debrief**:
   - `webapp/src/views/feynman/FeynmanDebriefView.tsx:42-55`: Missing `.catch()` causes the view to hang indefinitely on `"Loading Debrief Report..."` if the API times out.
5. **Focus Trap Escape Vulnerability**:
   - `webapp/src/hooks/useFocusTrap.ts:33-46`: Pressing `Shift+Tab` when focus is on a container element allows focus to escape to background elements.
6. **British English Leftovers**:
   - `"Analyzing..."` in `webapp/src/views/feynman/FeynmanDebriefView.tsx:64` → **`Analysing`**
   - `"Action Center"` in `webapp/src/views/debugger/CognitiveDebuggerView.tsx:441` → **`Action Centre`**
