import { Route, Routes } from "react-router";

/*
 * Route table mirroring the vanilla app's hash router (js/router.js):
 * dashboard, todo→/tasks, exams, timer, library(+tabs), folder-<id>,
 * notes-<id>, plan, quiz-<id>, quizreview-<id>, review-<id>, settings.
 * Each placeholder is replaced by the real view as its ledger step lands
 * (REACT_MIGRATION.md).
 */

function Placeholder({ title }: { title: string }) {
  return (
    <main>
      <h1>{title}</h1>
      <p>This view has not been migrated yet.</p>
    </main>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Placeholder title="Dashboard" />} />
      <Route path="/tasks" element={<Placeholder title="Tasks" />} />
      <Route path="/exams" element={<Placeholder title="Exams" />} />
      <Route path="/timer" element={<Placeholder title="Timer" />} />
      <Route path="/library" element={<Placeholder title="Library" />} />
      <Route path="/library/:tab" element={<Placeholder title="Library" />} />
      <Route
        path="/folders/:folderId"
        element={<Placeholder title="Subject" />}
      />
      <Route
        path="/notes/:materialId"
        element={<Placeholder title="Notes" />}
      />
      <Route path="/plan" element={<Placeholder title="Weekly Plan" />} />
      <Route path="/quiz/:quizId" element={<Placeholder title="Quiz" />} />
      <Route
        path="/quiz/:quizId/review"
        element={<Placeholder title="Quiz Review" />}
      />
      <Route
        path="/review/:deckId"
        element={<Placeholder title="Flashcard Review" />}
      />
      <Route path="/settings" element={<Placeholder title="Settings" />} />
      <Route path="*" element={<Placeholder title="Not found" />} />
    </Routes>
  );
}
