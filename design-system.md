# Learnora v2 design system

Status: approved direction for the React app in `webapp/`. This document describes the target interface. It does not claim that every rule is implemented yet.

## Product frame

Learnora is a study workspace, not a collection of isolated tools. The v2 interface groups the existing features around five recurring student jobs:

1. See what needs attention.
2. Find study material.
3. Plan upcoming work.
4. Complete a focused session.
5. Review progress.

The redesign changes navigation, hierarchy, spacing, and component use. Existing routes, stored records, AI actions, study-room behavior, appearance settings, and Supabase contracts remain available.

## Interface principles

### One decision per region

Each page starts with one primary action. Secondary actions sit beside the content they affect. A card should not repeat links already available in the page header or navigation.

### Attention follows urgency

Due reviews, the next exam, overdue tasks, and an active timer take visual priority. Streaks, badges, generated insights, and social activity remain visible but do not compete with urgent work.

### Fewer containers

Use a surface when it groups related information or separates an interactive area. Do not wrap every metric, label, or sentence in its own card. Prefer headings, dividers, and spacing inside a shared section.

### Context before configuration

Actions appear where the student needs them. Global settings stay in Settings. AI actions use the command palette, the chat panel, or a contextual control in notes and review flows.

### Stable routes

Navigation labels may change, but route paths do not. Deep links, browser history, saved links, and route-specific tests must continue to work.

## Information architecture

### Primary navigation

| Destination | Route        | Purpose                                                        |
| ----------- | ------------ | -------------------------------------------------------------- |
| Dashboard   | `/`          | Current priorities, next session, due reviews, and recent work |
| Library     | `/library`   | Subjects, materials, notes, flashcards, and quizzes            |
| Plan        | `/plan`      | Weekly plan with direct access to tasks and exams              |
| Focus       | `/timer`     | Timer, active session state, and session history               |
| Progress    | `/analytics` | Study time, review health, subject trends, and achievements    |

`Create` is a pinned action above the destinations, not a sixth destination. It opens the existing create modal.

### Secondary navigation

Study Lab contains Concept Graph, Cognitive Debugger, Feynman Apprentice, and Exam Pre-Mortem. Community contains Study Room and Friends. Settings sits in the account area. Terms of Service remains available from Settings and its existing public route.

On desktop, secondary groups are collapsed by default and remember their state. On mobile, the same groups appear below the five primary destinations in the navigation drawer.

### Route preservation map

| Existing route or route family      | v2 entry point                                |
| ----------------------------------- | --------------------------------------------- |
| `/tasks`                            | Plan page, Tasks tab                          |
| `/exams`                            | Plan page, Exams tab                          |
| `/folders/:folderId`                | Library subject row or card                   |
| `/notes/:materialId`                | Library material action and recent-work links |
| `/library/:tab`                     | Library tabs                                  |
| `/quiz/:quizId` and child routes    | Library quiz actions and active-work links    |
| `/review/:deckId`                   | Due-review actions on Dashboard and Library   |
| `/graph`                            | Study Lab                                     |
| `/debugger`                         | Study Lab                                     |
| `/feynman` and child routes         | Study Lab                                     |
| `/premortem` and `/premortem/radar` | Study Lab                                     |
| `/room` and `/room/:roomId`         | Community                                     |
| `/friends` and `/friends/add/:code` | Community                                     |
| `/settings`                         | Account area                                  |
| Auth and verification routes        | Public auth shell                             |

Contextual runner routes are not added to the sidebar. Their source pages and in-progress states provide the entry points.

## Theme

The existing appearance presets remain supported. The default v2 palette uses warm neutral surfaces and teal actions. Component CSS consumes semantic tokens so every saved accent preset and the custom-theme engine still work.

### Default light palette

| Role              | Token             | Value     |
| ----------------- | ----------------- | --------- |
| Page              | `--bg`            | `#f6f5f2` |
| Primary surface   | `--surface`       | `#ffffff` |
| Secondary surface | `--surface-2`     | `#f1efe9` |
| Hover surface     | `--surface-hover` | `#eae7df` |
| Primary text      | `--text`          | `#1c1b18` |
| Secondary text    | `--text-muted`    | `#6b6558` |
| Faint text        | `--text-faint`    | `#9a9384` |
| Action            | `--accent`        | `#0f766e` |
| Action hover      | `--accent-hover`  | `#0c5f59` |
| Action press      | `--accent-press`  | `#094943` |
| Success           | `--success`       | `#1e8e6b` |
| Warning           | `--warning`       | `#c98a2e` |
| Danger            | `--danger`        | `#c2453a` |

### Default dark palette

The default accent preset resolves to the values below when `dark-theme` and `data-theme-color="default"` are active.

| Role              | Token             | Value     |
| ----------------- | ----------------- | --------- |
| Page              | `--bg`            | `#090b0e` |
| Primary surface   | `--surface`       | `#111419` |
| Secondary surface | `--surface-2`     | `#161a20` |
| Hover surface     | `--surface-hover` | `#1c2129` |
| Primary text      | `--text`          | `#f3f4f6` |
| Secondary text    | `--text-muted`    | `#94a3b8` |
| Faint text        | `--text-faint`    | `#64748b` |
| Action            | `--accent`        | `#13988e` |
| Action hover      | `--accent-hover`  | `#18bcb0` |
| Action press      | `--accent-press`  | `#0e6f68` |
| Success           | `--success`       | `#2fbf88` |
| Warning           | `--warning`       | `#e0a53e` |
| Danger            | `--danger`        | `#e2564a` |

### Color rules

- Accent marks actions, active navigation, selected controls, and links. It is not a decorative border for every card.
- Success, warning, and danger communicate state. They do not replace subject colors or chart series.
- Muted text is for supporting information. Faint text is limited to low-priority metadata that still passes contrast requirements at its rendered size.
- Glass backgrounds are limited to navigation, overlays, and floating controls. Content sections use opaque surfaces.
- Each chart pairs color with a label, shape, or value. Color is never the only distinction.

## Typography

The current font pair remains because it is already loaded, tested, and exposed through appearance settings.

| Role          | Family            | Size                       | Weight | Line height |
| ------------- | ----------------- | -------------------------- | ------ | ----------- |
| Page title    | Outfit            | `clamp(22px, 3vw, 30px)`   | 700    | 1.15        |
| Section title | Outfit            | 22px                       | 700    | 1.15        |
| Card title    | Plus Jakarta Sans | 16px                       | 650    | 1.35        |
| Body          | Plus Jakarta Sans | 15px                       | 400    | 1.6         |
| Label         | Plus Jakarta Sans | 13px                       | 650    | 1.35        |
| Caption       | Plus Jakarta Sans | 12px                       | 500    | 1.35        |
| Key metric    | Outfit            | `clamp(30px, 4.5vw, 44px)` | 700    | 1.15        |

Sentence case is the default. Uppercase is reserved for short status labels and chart axes. Paragraphs use a maximum measure of `68ch`.

## Spacing, radius, and elevation

### Spacing

Use the existing 4px scale: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`.

| Relationship                | Spacing      |
| --------------------------- | ------------ |
| Icon to label               | 8px          |
| Label to control            | 8px          |
| Related controls            | 12px         |
| Card content                | 16px or 24px |
| Sections in a page          | 32px         |
| Page title to first section | 24px         |
| Desktop page gutter         | 32px to 48px |
| Mobile page gutter          | 16px         |

### Radius

- 8px for compact controls and tags.
- 12px for buttons, inputs, and navigation items.
- 16px for standard sections and cards.
- 20px for dialogs and prominent summary panels.
- Pill radius only for counts, filters, and status chips.

### Elevation

- Default content sections use a border and no shadow.
- Hoverable rows may use `--shadow-sm` on hover.
- Menus and dialogs use `--shadow-md` or `--shadow-lg`.
- Accent glow is limited to timer focus state and a selected appearance swatch.
- A view should not stack two blurred surfaces over another blurred surface.

## Layout

### Application shell

Desktop uses a 248px navigation column and a content column capped at 1440px. The navigation can collapse to a 72px icon rail. The content column owns vertical scrolling.

The top bar contains the page title, a short route-specific subtitle when useful, search, theme toggle, and the account menu. Time is shown on Dashboard and Focus instead of occupying every page header.

The fixed bottom AI composer is removed. Its capabilities remain in the command palette and the existing AI chat panel. This releases the reserved bottom clearance on desktop and mobile.

### Responsive behavior

| Width           | Behavior                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------- |
| Above 1180px    | Full sidebar, multi-column page grids where the content supports comparison                        |
| 769px to 1180px | Collapsible rail, two-column summaries, single-column detail sections                              |
| 768px and below | Off-canvas navigation, one content column, sticky page actions only when they do not cover content |
| 480px and below | Full-width primary actions, condensed metadata, no multi-column metric rows                        |

Horizontal scrolling is limited to data tables and canvases such as the concept graph. Forms, cards, and navigation must reflow.

## Components

### Buttons

- One primary button per page header or task region.
- Secondary buttons keep a visible border.
- Ghost buttons are for low-priority toolbar actions.
- Destructive actions use the danger treatment and a confirmation step when records cannot be restored.
- Icon-only buttons keep a 44px hit area and an accessible name.
- Loading buttons retain their width, show progress, and prevent duplicate submission.

### Inputs

- Place a visible label above each control.
- Helper text and validation text sit below the control in a reserved message area when layout shift would interrupt a form.
- Inputs are at least 44px high and 16px text on mobile.
- Placeholder text shows format or an example, not the field label.
- Search fields use a clear button when a value is present.

### Cards and sections

- Use `Card` for a bounded summary, linked record, or interactive region.
- Use a plain section with a divider for page-level grouping.
- A card gets one heading and no more than one primary action.
- Entire-card links use one semantic link or button instead of nested interactive controls.
- Elevation signals interaction or overlay depth, not importance.

### Modals and drawers

- Use the existing focus-trapped `Modal` for short creation and confirmation flows.
- Use a full page for multi-step work such as quiz runners and Feynman sessions.
- Mobile dialogs may become bottom sheets when all controls remain visible above the keyboard.
- Escape closes non-destructive dialogs. Overlay click remains opt-in.

### Toasts and inline feedback

- Toasts confirm completed background actions and auto-dismiss after 3 to 5 seconds.
- Form errors and query failures stay beside the affected content until resolved.
- Messages state the action and next step: `Plan could not be saved. Try again.`
- Do not use a success toast when the updated state is already visible.

### Tables and lists

- Tables are reserved for records that need column comparison.
- On narrow screens, nonessential columns move into a detail row or a labelled card list.
- Sort state appears in the column header and remains keyboard accessible.
- Row actions use a labelled menu when more than two actions are available.

### Empty states

- State what is missing in terms of the current page.
- Offer one next action when the student can resolve the empty state.
- Avoid illustrations in compact widgets.
- Example: `No reviews due today.` does not need an action. `No subjects yet.` pairs with `Add subject`.

### Loading states

- Skeletons reserve the final layout for initial page loads.
- Inline progress is used for mutations and AI generation.
- A spinner may appear inside a button or compact control, not as an unlabelled full-page state.
- Loading and error states retain the page title and navigation.

### Navigation states

- Active destinations use an accent-tinted background, accent text, and a left indicator in the full sidebar.
- Hover changes surface and text color without glow.
- Due-review and friend-request counts remain on Library and Community.
- Collapsed navigation supplies tooltips and keeps count badges readable.

## Screen wireframes

### Dashboard

1. Page header: greeting, date, `Start focus session` primary action.
2. Priority strip: next exam, tasks due today, reviews due. Three compact items in one section rather than three unrelated cards.
3. Main column: `Continue studying` with the last material, deck, quiz, or timer state.
4. Side column: this week's progress and streak in one summary.
5. Lower section: recent sessions and one compact Study Circle summary.
6. AI shortcuts move into the command palette and contextual menus. Onboarding guidance appears only until the related action has been used.

### Library and subjects

1. Page header: `Add` menu for subject, material, deck, and quiz.
2. Tabs: Subjects, Materials, Flashcards, Quizzes. Existing `/library/:tab` routes remain.
3. Search and filters share one toolbar.
4. Subjects use a compact grid on wide screens and a labelled list on mobile.
5. A subject page starts with recent material and due review, followed by all materials, decks, and quizzes.
6. Notes, quiz, and review routes open from their current records.

### Plan, tasks, and exams

1. Page header: week range and `Add task` primary action.
2. Tabs: Week, Tasks, Exams. Tabs link to `/plan`, `/tasks`, and `/exams` so existing URLs remain canonical.
3. Week view: seven-day strip above a selected-day agenda.
4. Tasks view: overdue, today, upcoming, and completed groups with a shared filter bar.
5. Exams view: chronological list with preparation status and direct pre-mortem entry.
6. Plan generation remains available as a secondary action and shows its proposed changes before saving.

### Focus and sessions

1. Centered timer with mode and duration controls.
2. Current task or subject selector directly below the timer.
3. Start or pause is the only primary action.
4. Session notes and sound settings sit in a collapsible panel.
5. Recent sessions appear below the timer, not beside it on narrow screens.
6. The mini timer remains visible across routes without covering page actions.

### Progress

1. Page header: date range and subject filter.
2. Summary row: study time, completed sessions, review accuracy, and current streak.
3. Main chart: study time by day with a labelled subject breakdown.
4. Review health: due load and retention trend.
5. Subject table: time, recent activity, and exam urgency.
6. Achievements and generated insights sit below measured results.

### Settings and profile

1. Two-column desktop layout with a section index and active settings panel.
2. Sections: Profile, Appearance, Study defaults, Notifications, AI providers, Account.
3. Mobile uses a single list of sections and one panel at a time.
4. Save actions appear inside the section they affect.
5. Destructive account actions remain separated at the end.

### Study Lab

1. Study Lab index introduces the four existing tools with one-sentence descriptions tied to their output.
2. Each tool retains its existing route and working flow.
3. Tool pages use the same page header, input section, processing state, and output actions.
4. Feynman studio and debrief routes remain full-page workspaces.

### Community

1. Community index shows active study-room state, friends, and pending requests.
2. Study Room keeps presence, shared timer, and room chat in one workspace.
3. Friends keeps invite links, request handling, and friend status.
4. Invite landing links continue to resolve at `/friends/add/:code`.

## Accessibility requirements

- Keep the shell skip link and one visible `h1` per page.
- Every interactive control has a visible focus state with at least a 2px outline.
- Text and meaningful icons meet WCAG AA contrast in each built-in accent preset and both modes.
- Motion honors `prefers-reduced-motion` and the saved reduced-motion setting.
- Status changes use the existing live-region patterns.
- Dialogs trap focus and restore it to their trigger.
- Canvas and chart views include a textual summary or table.
- Touch targets remain at least 44px in both dimensions.

## UI copy

- Use verbs for actions: `Add task`, `Start review`, `Save plan`.
- Name the affected record in destructive confirmations.
- State errors without blame and include a next step.
- Avoid claims about learning outcomes that the interface does not measure.
- Avoid filler subtitles. If a subtitle does not clarify state, scope, or the next action, remove it.
- Keep technical provider and sync details inside Settings or an error detail disclosure.

## Implementation boundaries

- Work in `webapp/` for product UI. Root auth-adjacent files remain compatibility surfaces.
- Keep React Router paths unchanged.
- Reuse `Button`, `IconButton`, `Card`, `Chip`, `PageHeader`, `EmptyState`, `Skeleton`, `Modal`, and existing form controls before adding a primitive.
- Preserve appearance presets, stored appearance keys, translations, and Supabase request shapes.
- Token value changes shared with the legacy shell require matching edits to root `style.css` because parity tests enforce them.
- Backend changes require a measured query or policy problem. Navigation or presentation changes alone do not justify schema work.

## Verification gate

Each implementation slice must pass type checking, lint, affected component tests, a production build, desktop inspection, mobile inspection, keyboard navigation, and the anti-slop reviews required for comments and UI copy.
