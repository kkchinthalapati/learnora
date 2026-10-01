-- Diagrams as a notebook artifact.
--
-- The Notebook Studio can now generate a labelled SVG diagram (the tutor draws
-- into a ```svg fence, which the app renders — see webapp/src/lib/diagramSvg.tsx).
-- A generated diagram is saved like any other artifact, so the type check
-- constraint from 20260830000000 has to admit it; without this the insert
-- fails with a 23514 and the student loses the drawing.
--
-- The constraint is replaced rather than dropped: the closed set is what keeps
-- an unrecognised type from reaching the studio's icon and export switches.

alter table public.notebook_artifacts
  drop constraint if exists notebook_artifacts_type_check;

alter table public.notebook_artifacts
  add constraint notebook_artifacts_type_check
  check (type in ('feynman', 'cheat_sheet', 'flashcards', 'quiz', 'summary', 'diagram'));
