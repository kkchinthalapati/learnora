# Project: Learnora Live Production Testing & Audit (2026-11-08)

## Architecture
- **Application Target**: Live production deployment at `https://learnora-app.vercel.app/app/` (Vite + React + TypeScript).
- **Backend / Edge**: Supabase project (`mlvgqwqiynpwpwzqufdf.supabase.co`) with PostgreSQL database, migrations `20261105000000`, `20261108000000`, and `20261108010000`, Edge Functions `learnora-ai` v83 and `web-research` v9.
- **Testing Harness**: Playwright live testing suite (`playwright.live.config.ts`, `webapp/tests/live/`) using test account `learnoratesting@gmail.com` (password: the `LEARNORA_TEST_PASSWORD` environment variable, never committed).
- **Target Deliverable**: `docs/AUDIT_2026-11-08.md` detailing all live procedures, observations, network metrics, and findings (F-17+).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Vercel Deploy & CSP Headers | Live status verification and strict CSP headers on `/app/` without `'unsafe-eval'` or `'unsafe-inline'` | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Flashcard Maths Rendering | KaTeX MathML rendering ($c = \sqrt{a^2 + b^2}$) without escaping bugs or style-src violations | M1 | ORIGINAL_REQUEST §R1 |
| 3 | `script-src` CSP Violations Check | Zero console `securitypolicyviolation` events from Zod JIT or OpenUI blocks | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Saved Theme Persistence | User theme / appearance settings surviving page reloads without auth race reset | M1 | ORIGINAL_REQUEST §R1 |
| 5 | "Mark my answer" AI Marking | Photo and typed answer marking with rubric point scoring and misconception detection | M2 | ORIGINAL_REQUEST §R2 |
| 6 | "Exam traps" AI Marking & Sprints | Exam Detective playbook, trap deconstruction, Challenge Sprint, and Traps Practice mode | M2 | ORIGINAL_REQUEST §R2 |
| 7 | Guided Sessions: Study Modes | Adaptive study pipeline (Check -> Cards -> Teach -> Traps) via `/study` and `/study/:id` | M2 | ORIGINAL_REQUEST §R2 |
| 8 | Guided Sessions: Check-Back | Focus-mode retest flow for due misconceptions via `/check-back/:id` | M2 | ORIGINAL_REQUEST §R2 |
| 9 | Guided Sessions: Tell-Apart | Focus-mode 6-statement contrast drill for confusable concept pairs via `/tell-apart/:pairId` | M2 | ORIGINAL_REQUEST §R2 |
| 10 | Guided Sessions: Past-You | Focus-mode multi-turn conversational debate with AI past self via `/past-you/:id` | M2 | ORIGINAL_REQUEST §R2 |
| 11 | DOCX File Upload Flow | Browser-native OpenXML decompression & markdown extraction into AI study packages | M3 | ORIGINAL_REQUEST §R3 |
| 12 | Audio Recording Flow | MediaRecorder 16kbps Opus recording in CaptureBar and Gemini multimodal ingestion | M3 | ORIGINAL_REQUEST §R3 |
| 13 | Friends Social Actions | Friend codes, request/accept RPCs, leaderboard polling, RLS isolation | M3 | ORIGINAL_REQUEST §R3 |
| 14 | Study Room Social Actions | Supabase Realtime channel `study-room:${roomId}`, presence, reactions, chat, ambient sound | M3 | ORIGINAL_REQUEST §R3 |
| 15 | Offline Mode & Banner | Service Worker, IndexedDB cards cache, localStorage mutation queue, reconnect auto-flush | M3 | ORIGINAL_REQUEST §R3 |
| 16 | Multi-Tab Usage | Storage event synchronization for timers, offline queue, continuity, and session state | M3 | ORIGINAL_REQUEST §R3 |
| 17 | Expired Session Handling | Supabase auto-refresh, onAuthStateChange SIGNED_OUT, ProtectedRoute redirect with return path | M3 | ORIGINAL_REQUEST §R3 |
| 18 | Long Lists & Memory Sustained Usage | DOM node footprint, unbounded list assessment, memory stability under continuous use | M3 | ORIGINAL_REQUEST §R3 |
| 19 | Comprehensive Audit Report | Comprehensive audit document `docs/AUDIT_2026-11-08.md` continuing findings format from 2026-11-07 | M4 | ORIGINAL_REQUEST §R5 |
| 20 | Test Guardrails & Data Protection | Zero deletion of QA subject and three test lessons; no sign-out, password reset, or billing testing | M1-M4 | ORIGINAL_REQUEST §R4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Live PR #168 Verification | Features 1, 2, 3, 4: CSP headers, Math rendering, console CSP checks, theme reload persistence | Survey | DONE |
| M2 | AI Marking & Guided Sessions | Features 5, 6, 7, 8, 9, 10: "Mark my answer", "Exam traps", Study modes, Check-back, Tell-apart, Past-you | Survey | DONE |
| M3 | File Paths, Social & Reliability | Features 11, 12, 13, 14, 15, 16, 17, 18: DOCX, Audio, Friends, Study Room, Offline, Multi-tab, Expired session, Memory | Survey | DONE |
| M4 | Audit Report & Forensic Verification | Features 19, 20: Comprehensive `docs/AUDIT_2026-11-08.md` authored, reviewed, challenged, and forensically audited | M1, M2, M3 | DONE |

## Interface Contracts
- **Live Credentials**: `learnoratesting@gmail.com` (password: the `LEARNORA_TEST_PASSWORD` environment variable, never committed) against `https://learnora-app.vercel.app/app/`.
- **Audit Format**: Continues structure of `docs/AUDIT_2026-11-07.md`:
  - `§1 Executive summary`
  - `§2 Feature inventory update`
  - `§3 Production testing log`
  - `§4 Bug register (F-17+)`
  - `§5 Security & CSP review`
  - `§6 AI & Guided sessions review`
  - `§7 File paths & social review`
  - `§8 Reliability & performance review`
  - `§9 Recommendations & action plan`
- **Integrity & Guardrails**:
  - Out of scope: Sign-out, password reset, billing, and cross-account actions.
  - Data protection: QA subject and test lessons must remain intact.

## Code Layout
- `webapp/src/`: React source code (read-only reference).
- `webapp/tests/live/`: Live Playwright test scripts.
- `docs/AUDIT_2026-11-07.md`: Reference audit report.
- `docs/AUDIT_2026-11-08.md`: Output audit report for this run.
- `.agents/teamwork/`: Metadata and coordination artifacts only.
