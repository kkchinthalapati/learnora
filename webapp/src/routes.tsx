import { Route, Routes } from "react-router";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginView } from "./views/auth/LoginView";
import { SignupView } from "./views/auth/SignupView";
import { ForgotPasswordView } from "./views/auth/ForgotPasswordView";
import { ResetPasswordView } from "./views/auth/ResetPasswordView";
import { VerifyView } from "./views/auth/VerifyView";
import { TermsView } from "./views/terms/TermsView";
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
 *
 * Above the guard sit the public routes. The vanilla had no equivalent of this
 * split — its auth wall was a div layered over the app in the same document,
 * and /verify, /reset-password and /terms were separate static pages outside
 * the router entirely. As routes they are all one app:
 *
 *   /login, /signup, /forgot-password  the auth wall's three forms, one each
 *   /verify                            what a confirmation email links to
 *   /reset-password                    what a recovery email links to
 *   /terms                             linked from the auth screens
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
      <Route path="/login" element={<LoginView />} />
      <Route path="/signup" element={<SignupView />} />
      <Route path="/forgot-password" element={<ForgotPasswordView />} />
      <Route path="/reset-password" element={<ResetPasswordView />} />
      <Route path="/verify" element={<VerifyView />} />
      <Route path="/terms" element={<TermsView />} />
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
