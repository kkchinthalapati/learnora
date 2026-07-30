import { Route, Routes } from "react-router";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { SignInRequired } from "./components/SignInRequired";
import { SettingsView } from "./views/settings/SettingsView";
import { TasksView } from "./views/tasks/TasksView";
import { ExamsView } from "./views/exams/ExamsView";
import { LibraryView } from "./views/library/LibraryView";
import { SubjectDetailPage } from "./views/library/SubjectDetailPage";

/*
 * Route table mirroring the vanilla app's hash router (js/router.js):
 * dashboard, todo→/tasks, exams, timer, library(+tabs), folder-<id>,
 * notes-<id>, plan, quiz-<id>, quizreview-<id>, review-<id>, settings.
 * Each placeholder is replaced by the real view as its ledger step lands
 * (REACT_MIGRATION.md). Everything except /login sits behind ProtectedRoute,
 * matching the vanilla app, where every view requires a session.
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
      <Route path="/login" element={<SignInRequired />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Placeholder title="Dashboard" />} />
        <Route path="/tasks" element={<TasksView />} />
        <Route path="/exams" element={<ExamsView />} />
        <Route path="/timer" element={<Placeholder title="Timer" />} />
        <Route path="/library" element={<LibraryView />} />
        <Route path="/library/:tab" element={<LibraryView />} />
        <Route path="/folders/:folderId" element={<SubjectDetailPage />} />
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
        <Route path="/settings" element={<SettingsView />} />
        <Route path="*" element={<Placeholder title="Not found" />} />
      </Route>
    </Routes>
  );
}
