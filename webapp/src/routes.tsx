import { Route, Routes } from "react-router";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { SignInRequired } from "./components/SignInRequired";
import { SettingsView } from "./views/settings/SettingsView";
import { TasksView } from "./views/tasks/TasksView";
import { ExamsView } from "./views/exams/ExamsView";
import { TimerView } from "./views/timer/TimerView";
import { LibraryView } from "./views/library/LibraryView";
import { SubjectDetailPage } from "./views/library/SubjectDetailPage";
import { DashboardView } from "./views/dashboard/DashboardView";
import { NotesView } from "./views/notes/NotesView";
import { PlanView } from "./views/plan/PlanView";
import { QuizRunner } from "./views/quiz/QuizRunner";
import { QuizReview } from "./views/quiz/QuizReview";
import { ReviewView } from "./views/review/ReviewView";

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
        <Route path="/" element={<DashboardView />} />
        <Route path="/tasks" element={<TasksView />} />
        <Route path="/exams" element={<ExamsView />} />
        <Route path="/timer" element={<TimerView />} />
        <Route path="/library" element={<LibraryView />} />
        <Route path="/library/:tab" element={<LibraryView />} />
        <Route path="/folders/:folderId" element={<SubjectDetailPage />} />
        <Route path="/notes/:materialId" element={<NotesView />} />
        <Route path="/plan" element={<PlanView />} />
        <Route path="/quiz/:quizId" element={<QuizRunner />} />
        <Route path="/quiz/:quizId/review" element={<QuizReview />} />
        <Route path="/review/:deckId" element={<ReviewView />} />
        <Route path="/settings" element={<SettingsView />} />
        <Route path="*" element={<Placeholder title="Not found" />} />
      </Route>
    </Routes>
  );
}
