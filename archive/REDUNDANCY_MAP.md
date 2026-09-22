# REDUNDANCY_MAP.md

Functional-overlap audit of the 22 view folders in `webapp/src/views/`.
Branch `revamp/identity-2026`. **Proposal only — nothing was deleted.**

LOC figures are non-test `.tsx` + `.ts` + `.css` per folder, measured with
`wc -l`. Route counts are from `webapp/src/routes.tsx`.

| Folder | LOC | Folder | LOC |
|---|---|---|---|
| dashboard | 3,738 | debugger | 2,152 |
| settings | 3,570 | notebooks | 2,050 |
| review | 3,316 | timer | 1,988 |
| library | 2,687 | analytics | 1,820 |
| premortem | 2,675 | quiz | 1,662 |
| room | 2,666 | plan | 1,645 |
| notes | 2,558 | tasks | 1,610 |
| feynman | 2,537 | auth | 1,235 |
| graph | 2,486 | achievements | 984 |
| exams | 2,386 | friends | 853 |
| | | terms | 464 |
| | | not-found | 219 |

**Total: 44,301 LOC across 22 folders and 30 routes.**

---

## Cluster 1 — Notebooks vs Notes vs Library

### What each actually does

**`views/library/` (2,687 LOC, 3 routes: `/library`, `/library/:tab`, `/folders/:folderId`)**
A tabbed browser over four real backend collections. `LibraryView.tsx:20-24`:
```ts
const PANELS = { folders: FoldersPanel, materials: MaterialsPanel,
                 flashcards: FlashcardsPanel, quizzes: QuizzesPanel };
```
Backed by `api/folders.ts`, `api/materials.ts`, `api/flashcards.ts`,
`api/quizzes.ts`. Also owns `LibrarySearch` (451 LOC), the app's only
cross-collection search. **This is the system of record.**

**`views/notes/` (2,558 LOC, 1 route: `/notes/:materialId`)**
A rich-text editor for one *material*. `NotesView.tsx` resolves the material
and hands off to `NotesEditorPane.tsx` (796 LOC), which mounts
`NotesAiSidebar.tsx` (463 LOC) and `InlineAiToolbar.tsx`. Notes are a child of
a material, which is a child of a folder — it is a leaf of Library, reached
from Library, and shares Library's backend. **Not a competitor: a detail view.**

**`views/notebooks/` (2,050 LOC, 2 routes: `/notebooks`, `/notebooks/:notebookId`)**
A NotebookLM clone: multi-source ingestion → grounded chat with citations →
generated artifacts. `types/notebooks.ts` defines `SourceType` (pdf/note/web/
textbook/syllabus/past_paper), `GroundedCitation`, and
`ArtifactType = "feynman" | "cheat_sheet" | "flashcards" | "quiz" | "summary"`.

**The decisive fact:** `hooks/useNotebooks.ts:11` —
```ts
const NOTEBOOKS_STORAGE_KEY = "learnora_notebooks_v1";
```
It is the **only** feature hook in the app backed purely by `localStorage`.
`grep -l supabase hooks/*.ts` returns exactly `useFolders.ts` and
`useStudyRoom.ts`; `grep -l Storage hooks/*.ts` returns `useNotebooks.ts` and
`useQuizDraft.ts`. And `useNotebooks.ts:12-40` ships `INITIAL_DEMO_NOTEBOOKS`
with hardcoded NCERT circle-theorem content baked into the source file.

**Notebooks is a demo, not a feature.** Data does not sync, does not survive a
cleared browser, is invisible to every other surface, and every user starts
with someone else's geometry notes.

Corroborating evidence that it was generated separately from the rest of the app:
- 14 of the 20 broken `border: 1px solid var(--border)` declarations are in
  `notebooks.module.css` (UI_FORENSICS §1.2) — the whole surface is unbordered.
- 4 of the 6 phantom tokens (`--surface-base`, `--surface-3`, `--card-accent`,
  `--text-inverse`) are referenced only here. These are shadcn/Tailwind names
  that exist nowhere in `tokens.css`.
- `notebooks.module.css:9` uses `var(--s-7)`, which does not exist → the hub's
  `gap` computes to `normal` (0).
- 65 of the app's 233 inline `style={{}}` props are in these two files (42 in
  `NotebookStudioView.tsx`, 23 in `NotebooksHubView.tsx`) — 28% of the total
  from 4.6% of the LOC.
- 17 raw `<button>` in `NotebookStudioView.tsx`, the highest in the app.

### Verdicts

| Surface | LOC | Routes | Verdict |
|---|---|---|---|
| `views/library` | 2,687 | 3 | **KEEP** |
| `views/notes` | 2,558 | 1 | **KEEP** |
| `views/notebooks` | 2,050 | 2 | **MERGE INTO Library — then delete** |

**Justification.** There is no three-way overlap: Library holds material, Notes
edits one piece of material, and those two are correctly layered. The third
surface is the problem. Notebooks duplicates Library's job (a container of study
sources), Notes' job (a `notes: string` field per notebook), the chat surface
(`components/chat/`), and — via `ArtifactType: "feynman"` — the Feynman view's
job. It duplicates all four *and does none of them against the real backend*.
The one genuinely new capability is **grounded chat with per-source citations**
(`GroundedCitation` in `types/notebooks.ts`), and that belongs on a Folder,
where the sources already live and are already persisted. Port
`NotebookStudioView`'s chat panel onto `views/library/SubjectDetailPage.tsx`
(which already has the folder, its materials, and an EmptyState wired up),
delete the rest. **Recovers 2,050 LOC, 2 routes, one nav item, 14 broken border
declarations and 65 inline styles.**

**Cost: invasive-ish but bounded.** The chat panel is the only piece worth
saving and it has no backend to migrate (there is no data to lose — it is
localStorage demo content). The real work is writing the missing
`api/notebookSources.ts`, which is work the feature always needed and never got.

---

## Cluster 2 — Four AI study surfaces

`views/graph` (2,486) · `views/debugger` (2,152) · `views/premortem` (2,675) ·
`views/feynman` (2,537). **9,850 LOC, 9 of 30 routes, 4 of 14 nav items — the
entire "Study Lab" section of `components/Sidebar.tsx:88-108`.**

### What each uniquely does

**Concept Graph (`/graph`)** — the only one with **no AI API module of its own**.
`ConceptGraphView.tsx:2-8` composes seven existing hooks (`useFolders`,
`useMaterials`, `useNotes`, `useFlashcards`, `useDecks`, `useQuizzes` +
`useQuizAttempts`, `useExams`) and derives a graph client-side. It is a
*visualisation of data other surfaces already own*, not a generator.
Unique output: spatial adjacency between concepts.

**Cognitive Debugger (`/debugger`)** — `api/aiDebugger.ts`. Takes a wrong quiz
answer (`api/quizzes.ts`) and decomposes the misconception into a "stack trace"
of prerequisite layers (`KnowledgeCircuit.tsx`, 384 LOC), then offers a
`MicroRepairModal`. Unique input: **a specific failed answer**.

**Feynman Apprentice (`/feynman`, `/feynman/studio[/:id]`, `/feynman/debrief[/:id]`)**
— `api/aiFeynman.ts`. User explains a concept aloud/in text; AI plays a naive
student and surfaces gaps; debrief converts gaps into flashcards via
`api/decks.ts` + `api/flashcards.ts`. Unique input: **the user's own
explanation**. 5 routes for one feature.

**Exam Pre-Mortem (`/premortem`, `/premortem/radar`)** — `api/aiPreMortem.ts`.
Takes an upcoming exam (`api/exams.ts`) + folder scope and generates
adversarial trap questions by archetype, then a risk radar. Unique input:
**a scheduled exam**.

### The overlap is real and already acknowledged in code

All four mount `components/ai/CognitiveCrossLinkBar` (228 LOC of CSS + a
component), whose config (`CognitiveCrossLinkBar.tsx:31-60`) is literally a
list of the other three:

```ts
{ id: "debugger",  label: "Decompile in Debugger",     route: "/debugger" }
{ id: "feynman",   label: "Teach in Feynman",          route: "/feynman" }
{ id: "premortem", label: "Stress-Test in Pre-Mortem", route: "/premortem" }
{ id: "graph",     ... }
```

A component whose entire job is to ferry the user between four sibling views is
the strongest possible evidence that those four views are **one workflow that
was split across four destinations.** The shared `lib/cognitiveBridge.ts`
payload (`CognitiveContextPayload` with `subject`/`topic`/`concept`/
`misconceptions`/`severity`) proves they already operate on identical state.

They are also structurally near-identical (UI_FORENSICS §3.5): each is a
hub → runner → report triple. Feynman does it with 5 routes; Pre-Mortem does
the *same shape* with a `mode` state machine (`PreMortemHubView.tsx:27`
`useState<HubMode>("config")`, rendering `StressTestRunner` at `:144` and
`PreMortemRadarView` at `:157` inline). **Two different navigation
architectures for the same feature shape, in the same section of the app.**

### Verdicts

| Surface | LOC | Routes | Verdict |
|---|---|---|---|
| `views/debugger` | 2,152 | 1 | **KEEP as the shell** — rename to "Study Lab" |
| `views/feynman` | 2,537 | 5 | **MERGE INTO debugger** as a mode |
| `views/premortem` | 2,675 | 2 | **MERGE INTO debugger** as a mode |
| `views/graph` | 2,486 | 1 | **KEEP, but move** — it is a view, not a tool |

**Justification.** The three generators (Debugger, Feynman, Pre-Mortem) differ
only in *what triggers them*: a wrong answer, a self-explanation, an upcoming
exam. That is a **source selector on one screen**, not three nav items. One
"Study Lab" route with a three-way input picker, sharing
`CognitiveContextPayload` as it already does, deletes the cross-link bar
entirely (228 LOC of CSS + component), collapses 8 routes to 2, and removes 3
nav entries. Realistically ~2,500 of the 7,364 combined LOC survive as shared
shell + three thin generator adapters; the API modules (`aiDebugger.ts`,
`aiFeynman.ts`, `aiPreMortem.ts`) all stay untouched.

Concept Graph is different in kind — it *reads* everything and *generates*
nothing. Keep the code, but it belongs as a view mode inside Library (it is
literally a visualisation of Library's contents), not as a peer of three AI
generators. **Cheap move: it has one route and one nav item.**

**Immediate free win:** `/premortem/radar` is a **dead route**.
`PreMortemHubView.tsx:157` renders `<PreMortemRadarView>` inline as a mode, so
the standalone route is a second mount of the same component reachable only by
typing the URL. Nothing in the nav or in any `<Link>` points at it. Delete the
route line; keep the component.

**Cost: invasive.** This is the largest merge proposed and touches 9 routes.
Recommend doing it *after* Cluster 1 and Cluster 3, which are cheap.

---

## Cluster 3 — Timer vs Study Room vs FocusStudyHUD

### What each does

**`views/timer/` (1,988 LOC, 1 route `/timer`, nav label "Focus")**
`TimerView.tsx` — Pomodoro with presets (`deep`/`cram`/`light`,
`TimerView.tsx:222-224`), custom durations, saveable presets (`:172`), and task
binding via `useTasks` (`:100`). Driven by `context/TimerProvider` — the
**single source of truth for timer state app-wide**.

**`views/room/` (2,666 LOC, 2 routes `/room`, `/room/:roomId`)**
`StudyRoomView.tsx` — multiplayer. Supabase realtime presence
(`hooks/useStudyRoom.ts`, 657 LOC, one of only two supabase-backed hooks),
participant desks (`StudyDeskCard.tsx`), chat, reactions
(`ReactionOverlay.tsx`), audio ambiance (`audioAmbiance.ts`), and **timer
sync** (`TimerSyncPayload` in `api/studyRoom.ts`).

**`views/timer/FocusStudyHUD.tsx` (345 LOC CSS + component)**
A `position: fixed` global HUD (`FocusStudyHUD.module.css:4`) showing the
running timer on every route, with extend/toggle and an Alt+N scratchpad.

**`views/timer/MiniTimer.module.css` (139 LOC)** — a *fourth* timer surface,
also `position: fixed`, also `z-index: 985` (identical to the HUD, see
UI_FORENSICS §6.2).

### The overlap

They already know about each other and are wired together badly:

- `views/timer/TimerView.tsx:11` imports `useStudyRoom` from `hooks/`, and
  `views/timer/timer.module.css:382` styles a `.studyRoomWidget` — **the Study
  Room is embedded inside the Timer view.**
- `views/dashboard/StudyCircleCard.tsx:6` imports `useStudyRoom` too — a third
  entry point to the room.
- `webapp/src/views/room/useStudyRoom.ts` is a **5-line re-export shim** of
  `webapp/src/hooks/useStudyRoom.ts` (657 lines). Two import paths for one hook;
  `StudyRoomView.tsx:3` uses the shim, `TimerView.tsx:11` and
  `StudyCircleCard.tsx:6` use the real path, and the two test files are split
  across both.
- `FocusStudyHUD` (z 985) and `MiniTimer` (z 985) are both fixed timer chrome
  at an identical z-index, and the dashboard command bar (z 850) sits *under*
  both.

### Verdicts

| Surface | LOC | Routes | Verdict |
|---|---|---|---|
| `views/timer` (TimerView) | ~1,500 | 1 | **KEEP** — the config surface |
| `views/room` | 2,666 | 2 | **KEEP** — genuinely different (multiplayer/realtime) |
| `FocusStudyHUD` | ~700 | 0 | **KEEP** — the only always-on surface |
| `MiniTimer` | ~250 | 0 | **DELETE — merge into FocusStudyHUD** |
| `views/room/useStudyRoom.ts` | 5 | 0 | **DELETE the shim** |

**Justification.** Timer and Room are not the same thing: one configures a
solo session, the other is a realtime social space with presence, chat and
audio. The redundancy is *within* the timer folder — **four** timer chrome
surfaces (TimerView, FocusStudyHUD, MiniTimer, and the `.studyRoomWidget`
embedded in TimerView) where two are needed. `MiniTimer` and `FocusStudyHUD`
are both fixed, both at z 985, both showing the running timer; they cannot
sensibly co-exist and their stacking order is undefined.

**Cost: trivial.** Deleting the `useStudyRoom` shim is a 5-line delete plus 2
import edits. Folding `MiniTimer` into `FocusStudyHUD` is ~250 LOC and touches
no data layer. Do these first.

---

## Cluster 4 — Dashboard's competing CTAs

The flag was "five competing start-a-session buttons." **The real count is
higher, and two pairs point at the same destination.**

`views/dashboard/DashboardView.tsx` renders 14 child components. Every
`variant="primary"` button on the dashboard:

| # | Component | Line | Label/target |
|---|---|---|---|
| 1 | `DashboardView.tsx` | `:40-47` | header "Start focus" → `/timer` |
| 2 | `FocusCard.tsx` | `:72-75` | → `/timer` **(duplicate of #1)** |
| 3 | `DailyDrillCard.tsx` | `:56-59` | → `/review/daily-drill` |
| 4 | `AdaptiveHealthWidget.tsx` | `:261-268` | → `/review/daily-drill` **(duplicate of #3)** |
| 5 | `ResumeLearningCard.tsx` | `:76-77` | resume last activity |
| 6 | `OnboardingBanner.tsx` | `:60-61` | onboarding start |

Plus non-primary competing entry points on the same screen:

| Component | Line | Target |
|---|---|---|
| `DailyDrillCard.tsx` | `:70-72` | `/library/flashcards` |
| `ResumeLearningCard.tsx` | `:119` | `/library` (secondary) |
| `OnboardingBanner.tsx` | `:66` | focus task input |
| `AdaptiveHealthWidget.tsx` | `:99` | `/analytics` |
| `RecentNotebooksShelf.tsx` | `:23` | `/notebooks` |
| `StudyCircleCard.tsx` | `:29` | `/room` |
| `TasksCard.tsx` | `:33, :46` | `/tasks`, `/library/flashcards` |
| `NextExamCard.tsx` | `:49, :86` | `/exams` ×2 |
| `AIActionsCard.tsx` | `:71` | `/plan` |
| `CommandBar.tsx` | — | fixed "Ask AI" bar |

**6 primary CTAs (2 pairs of exact duplicates) + 13 secondary actions + 1 fixed
command bar = 20 competing calls to action on one screen.**

`/timer` is offered twice as a primary button; `/review/daily-drill` is offered
twice as a primary button; `/library/flashcards` is offered three times.

**Verdict: MERGE.** #1 and #2 are the same button — delete `FocusCard`'s or the
header's. #3 and #4 are the same button — `AdaptiveHealthWidget` should link,
not CTA. Target state: **one** primary CTA in the header whose destination is
computed (resume > daily drill > start focus), with every card demoted to a
link. **Cheap: ~30 lines across 4 files, no data-layer change, and it is the
single largest perceived-quality change available on the app's landing screen.**

The command bar additionally has a **layout bug**: it is `position: fixed;
bottom: 28px` (`commandBar.module.css:12-14`) and the clearance token written
for it (`tokens.css:9` `--command-bar-clearance: 104px`) is never applied, so
it covers the last card. See UI_FORENSICS §6.1.

---

## Cluster 5 — Analytics vs Dashboard widgets

**`views/analytics/` (1,820 LOC, 1 route `/analytics`, nav label "Progress")**
`StudyAnalyticsView.tsx` (495 LOC) — range selector (`:24-26`: 52 Weeks /
90 Days / 30 Days), an hourly study-distribution bar chart (`:259-297`), and a
peak-window computation (`:187, :325`). Notably it imports **no API module** —
`grep` over `views/analytics/*.tsx` finds only `from "../../api/types"`. It
derives everything from session data passed in.

**Dashboard's reporting widgets:** `StreakCard.tsx` (streak),
`SessionHistoryCard.tsx` ("Recent focus sessions"),
`AdaptiveHealthWidget.tsx` (368 LOC of CSS + component: "Adaptive learning
health", "Daily focus goal progress", per-subject mastery tiers "Mastered /
Competent / Developing / Needs Refresher", "Smart Adaptive Review").

### Verdict: **KEEP BOTH — but move one widget**

This is the **weakest** of the five suspected clusters, and I want to be
straight about that rather than manufacture a cut. The overlap is narrow:

- Genuine duplicate: **session history**. `SessionHistoryCard` ("Recent focus
  sessions") and Analytics' hourly distribution chart read the same session
  data at different resolutions. That is a legitimate summary→detail pair, not
  redundancy.
- **`AdaptiveHealthWidget` is the misplaced one.** At 368 LOC of CSS it is the
  largest single dashboard widget, it renders four distinct metrics (health
  score, focus-goal progress, per-subject mastery tiers, review readiness), and
  `AdaptiveHealthWidget.tsx:99` already contains `<Link to="/analytics">`. It is
  an analytics page wearing a card. **MOVE it into `/analytics`** and leave a
  one-line summary on the dashboard. That removes one of the six primary CTAs
  (Cluster 4 #4) as a side effect.

Analytics itself earns its route: the 52-week range and the 24-hour
distribution chart have no dashboard equivalent and cannot fit in a card.

**Cost: cheap.** One component move plus a summary stub. ~370 LOC relocated,
0 deleted, 0 routes changed.

---

## Every route in `webapp/src/routes.tsx`

30 routes. Nav (`components/Sidebar.tsx:42-140`) exposes **14 items**.

### Public (6)

| Route | Line | Purpose | Reachable? |
|---|---|---|---|
| `/login` | `:71` | Sign in | yes (auth wall) |
| `/signup` | `:72` | Register | yes |
| `/forgot-password` | `:73` | Request reset email | yes |
| `/reset-password` | `:74` | Landing for recovery email | yes (email only — correct) |
| `/verify` | `:75` | Landing for confirmation email | yes (email only — correct) |
| `/terms` | `:76` | Terms of service | yes (nav, opens new tab) |

### Protected (24)

| Route | Line | Purpose | Nav? | Flag |
|---|---|---|---|---|
| `/` | `:82` | Dashboard | ✅ | 20 competing CTAs (Cluster 4) |
| `/notebooks` | `:83` | Notebook hub | ✅ | localStorage-only demo (Cluster 1) |
| `/notebooks/:notebookId` | `:84` | Notebook studio | via hub | as above |
| `/tasks` | `:85` | Task list | ❌ | **not in nav** — see below |
| `/exams` | `:86` | Exam calendar | ❌ | **not in nav** — see below |
| `/timer` | `:87` | Pomodoro config ("Focus") | ✅ | Cluster 3 |
| `/library` | `:88` | Library, folders tab | ✅ | system of record |
| `/library/:tab` | `:89` | materials/flashcards/quizzes tabs | via tabs | |
| `/folders/:folderId` | `:90` | Subject detail | via Library | merge target for Notebooks |
| `/notes/:materialId` | `:91` | Note editor | via Library | |
| `/plan` | `:92` | Study plan | ✅ | |
| `/quiz/:quizId` | `:93` | Quiz runner | via Library | |
| `/quiz/:quizId/mock-exam` | `:94` | Timed mock exam | via quiz | |
| `/quiz/:quizId/review` | `:95` | Quiz review | after quiz | |
| `/review/:deckId` | `:96` | Flashcard review (3,316 LOC) | via Library / dashboard | |
| `/friends` | `:97` | Friends list | ✅ | |
| `/room` | `:98` | Study room lobby | ✅ | Cluster 3 |
| `/room/:roomId` | `:99` | A specific room | via lobby / invite | |
| `/analytics` | `:100` | Analytics ("Progress") | ✅ | Cluster 5 |
| `/graph` | `:101` | Concept graph | ✅ | Cluster 2 — move into Library |
| `/debugger` | `:102` | Cognitive Debugger | ✅ | Cluster 2 — merge shell |
| `/premortem` | `:103` | Pre-Mortem hub | ✅ | Cluster 2 |
| `/premortem/radar` | `:104` | Risk radar | ❌ | **DEAD — see below** |
| `/feynman` | `:105` | Feynman hub | ✅ | Cluster 2 |
| `/feynman/studio` | `:106` | New Feynman session | via hub | |
| `/feynman/studio/:sessionId` | `:107` | Resume session | via hub `:108` | |
| `/feynman/debrief` | `:108` | Debrief (no id) | ❌ | **likely dead — see below** |
| `/feynman/debrief/:sessionId` | `:109` | Session debrief | via hub `:112` | |
| `/friends/add/:code` | `:113` | Invite landing | invite link only | correct |
| `/settings` | `:114` | Settings | ✅ | |
| `*` | `:115` | 404 | — | |

### Unreachable / dead routes

**`/premortem/radar` (`routes.tsx:104`) — DEAD.**
`views/premortem/PreMortemHubView.tsx:21` imports `PreMortemRadarView` and
renders it inline at `:157` as a hub mode. Nothing links to the standalone
route. It is a second mount of the same component, reachable only by typing the
URL. **Delete the route; keep the component.**

**`/feynman/debrief` (`routes.tsx:108`) — almost certainly dead.**
`FeynmanHubView.tsx:112` navigates to `/feynman/debrief/${session.id}`, always
with an id. The bare route renders `FeynmanDebriefView` with no `sessionId`.
Same shape as `/feynman/studio` (`:106`), which *is* used for "start new" — but
"debrief nothing" has no meaning. **Verify, then delete.**

**`/tasks` (`routes.tsx:85`) and `/exams` (`routes.tsx:86`) — not in the
sidebar.** Both are real, backend-backed features (`api/tasks.ts`,
`api/exams.ts`; `views/tasks` 1,610 LOC, `views/exams` 2,386 LOC — 4,000 LOC
combined, ~9% of the app). They are reachable only via:
- `components/command/CommandPalette.tsx:346, 359` (⌘K)
- `views/plan/PlanSectionNav.tsx:12-13` (a sub-nav inside `/plan`)
- `views/dashboard/TasksCard.tsx:33` "View all" and
  `views/dashboard/NextExamCard.tsx:49, 86` "Open calendar"

This is defensible as an intentional information architecture — Tasks and
Exams are sub-sections of Plan — but it is inconsistent with the sidebar
carrying four AI experiments (Cluster 2) as top-level items while two
substantial, working, backend-backed features are hidden. **Flagging as an IA
inversion, not a bug.**

**`views/achievements/` (984 LOC) has no route at all.** `AchievementsModal` is
mounted only from `views/dashboard/StreakCard.tsx:101, 255`. Correct as a modal
— noted for completeness so the folder count reconciles: 22 folders, 21 with
routes.

---

## Summary of proposed cuts

| Action | LOC removed | Routes removed | Nav items removed | Invasiveness |
|---|---|---|---|---|
| Delete `views/room/useStudyRoom.ts` shim | 5 | 0 | 0 | **trivial** |
| Delete `/premortem/radar` route | 1 | 1 | 0 | **trivial** |
| Delete `/feynman/debrief` (bare) route | 1 | 1 | 0 | **trivial** (verify first) |
| Dedupe dashboard CTAs (6 primary → 1) | ~30 | 0 | 0 | **cheap** |
| Fold `MiniTimer` into `FocusStudyHUD` | ~250 | 0 | 0 | **cheap** |
| Move `AdaptiveHealthWidget` → `/analytics` | 0 (relocated) | 0 | 0 | **cheap** |
| Move Concept Graph into Library | 0 (relocated) | 1 | 1 | **moderate** |
| Merge Notebooks → Library folder chat | ~1,800 | 2 | 1 | **moderate** |
| Merge Feynman + Pre-Mortem → Study Lab | ~4,800 | 6 | 2 | **invasive** |
| **Total** | **~6,900 (16%)** | **11 of 30** | **4 of 14** | |

**Recommended order:** the four trivial/cheap items first (287 LOC, 2 routes,
one afternoon, and they fix the dashboard — the screen the owner sees most).
Then Notebooks. Then the Study Lab merge, which is the big one and should not
be attempted until the CSS primitives from `UI_FORENSICS.md` §3 exist, or the
merge will just relocate the copy-paste.
