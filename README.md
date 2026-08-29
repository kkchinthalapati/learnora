# Learnora

Learnora is a React study workspace for planning, learning from materials,
reviewing with spaced repetition, and tracking progress.

## App layout

- `webapp/` contains the live Vite + React + TypeScript application.
- `api/` contains the public Vercel edge handlers and marketing pages.
- `scripts/build.sh` builds the React app and assembles the deployable `dist/`
  directory.

The root HTML/JavaScript shell is retained for auth-adjacent legacy pages and
redirect compatibility. New product work belongs in `webapp/`.

## Learnora v2 overview

v2 keeps the existing routes and study flows while reorganizing the product
around five destinations: Dashboard, Library, Plan, Focus, and Progress.
The desktop shell uses a collapsible navigation rail; mobile uses an
off-canvas drawer. Plan links to the existing tasks and exams routes, while
Study Lab, Community, and Account keep the less-frequent routes available
without competing with daily study work.

The shared React controls now use opaque surfaces, consistent spacing, 44px
interactive targets, visible focus states, and responsive layouts. Existing
appearance presets, the create modal, command palette, AI chat panel, study
room, timer, review, quiz, and settings flows remain in place.

The database change is intentionally small: one due-review index and
restrictive parent-ownership policies. It is recorded locally but has not
been applied to the linked Supabase project. Details are in
[`architecture-tweaks.md`](architecture-tweaks.md); interface rules and screen
layouts are in [`design-system.md`](design-system.md).

## Local development

Requirements: Node.js 24.x and npm.

```bash
npm --prefix webapp ci
npm --prefix webapp run dev
```

The app is served under `/app/` in Vite and production, for example
`http://localhost:5173/app/`.

## Apply the v2 Supabase migration

Set a current database password or relink the project, then run the migration
against a preview project before applying it to production:

```bash
npx supabase@2.115.0 migration list --linked
npx supabase@2.115.0 db push --dry-run --linked
npx supabase@2.115.0 db push --linked
npx supabase@2.115.0 db lint --linked --schema public --level warning --fail-on error
```

The dry run should list
`20260828000000_learnora_v2_targeted_hardening.sql` as the only pending v2
migration. No remote schema change was made during this work.

## Verification

```bash
npm --prefix webapp run lint
npm --prefix webapp run build
npm --prefix webapp test
```

Production deployment is configured in `vercel.json` and uses
`bash scripts/build.sh`.
