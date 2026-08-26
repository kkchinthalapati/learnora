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

## Local development

Requirements: Node.js 24.x and npm.

```bash
npm --prefix webapp ci
npm --prefix webapp run dev
```

The app is served under `/app/` in Vite and production, for example
`http://localhost:5173/app/`.

## Verification

```bash
npm --prefix webapp run lint
npm --prefix webapp run build
npm --prefix webapp test
```

Production deployment is configured in `vercel.json` and uses
`bash scripts/build.sh`.
