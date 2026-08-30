import { Route, Routes } from "react-router";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppShell } from "./components/AppShell";
import { LoginView } from "./views/auth/LoginView";
import { SignupView } from "./views/auth/SignupView";
import { ForgotPasswordView } from "./views/auth/ForgotPasswordView";
import { ResetPasswordView } from "./views/auth/ResetPasswordView";
import { VerifyView } from "./views/auth/VerifyView";
import {
  LOGIN_PATH,
  SIGNUP_PATH,
  FORGOT_PASSWORD_PATH,
  RESET_PASSWORD_PATH,
  VERIFY_PATH,
} from "./views/auth/authPaths";
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
import { MockExamRunner } from "./views/quiz/MockExamRunner";
import { QuizReview } from "./views/quiz/QuizReview";
import { ReviewView } from "./views/review/ReviewView";
import { FriendsView } from "./views/friends/FriendsView";
import { FriendInviteLanding } from "./views/friends/FriendInviteLanding";
import { StudyRoomView } from "./views/room/StudyRoomView";
import { StudyAnalyticsView } from "./views/analytics/StudyAnalyticsView";
import { ConceptGraphView } from "./views/graph/ConceptGraphView";
import { CognitiveDebuggerView } from "./views/debugger/CognitiveDebuggerView";
import { PreMortemHubView } from "./views/premortem/PreMortemHubView";
import { PreMortemRadarView } from "./views/premortem/PreMortemRadarView";
import { FeynmanHubView } from "./views/feynman/FeynmanHubView";
import { FeynmanStudioView } from "./views/feynman/FeynmanStudioView";
import { FeynmanDebriefView } from "./views/feynman/FeynmanDebriefView";
import { NotebooksHubView } from "./views/notebooks/NotebooksHubView";
import { NotebookStudioView } from "./views/notebooks/NotebookStudioView";
import { NotFoundView } from "./views/not-found/NotFoundView";

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

export function AppRoutes() {
  return (
    <Routes>
      <Route path={LOGIN_PATH} element={<LoginView />} />
      <Route path={SIGNUP_PATH} element={<SignupView />} />
      <Route path={FORGOT_PASSWORD_PATH} element={<ForgotPasswordView />} />
      <Route path={RESET_PASSWORD_PATH} element={<ResetPasswordView />} />
      <Route path={VERIFY_PATH} element={<VerifyView />} />
      <Route path="/terms" element={<TermsView />} />
      <Route element={<ProtectedRoute />}>
        {/* The sidebar/header chrome — see AppShell's own comment for why
            this sits here rather than inside ProtectedRoute itself. */}
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardView />} />
          <Route path="/notebooks" element={<NotebooksHubView />} />
          <Route path="/notebooks/:notebookId" element={<NotebookStudioView />} />
          <Route path="/tasks" element={<TasksView />} />
          <Route path="/exams" element={<ExamsView />} />
          <Route path="/timer" element={<TimerView />} />
          <Route path="/library" element={<LibraryView />} />
          <Route path="/library/:tab" element={<LibraryView />} />
          <Route path="/folders/:folderId" element={<SubjectDetailPage />} />
          <Route path="/notes/:materialId" element={<NotesView />} />
          <Route path="/plan" element={<PlanView />} />
          <Route path="/quiz/:quizId" element={<QuizRunner />} />
          <Route path="/quiz/:quizId/mock-exam" element={<MockExamRunner />} />
          <Route path="/quiz/:quizId/review" element={<QuizReview />} />
          <Route path="/review/:deckId" element={<ReviewView />} />
          <Route path="/friends" element={<FriendsView />} />
          <Route path="/room" element={<StudyRoomView />} />
          <Route path="/room/:roomId" element={<StudyRoomView />} />
          <Route path="/analytics" element={<StudyAnalyticsView />} />
          <Route path="/graph" element={<ConceptGraphView />} />
          <Route path="/debugger" element={<CognitiveDebuggerView />} />
          <Route path="/premortem" element={<PreMortemHubView />} />
          <Route path="/premortem/radar" element={<PreMortemRadarView />} />
          <Route path="/feynman" element={<FeynmanHubView />} />
          <Route path="/feynman/studio" element={<FeynmanStudioView />} />
          <Route path="/feynman/studio/:sessionId" element={<FeynmanStudioView />} />
          <Route path="/feynman/debrief/:sessionId" element={<FeynmanDebriefView />} />
          {/* Inside the guard on purpose: an invite link opened by someone
              who is signed out goes through ProtectedRoute's existing
              `state: { from }` redirect and lands back here after login. */}
          <Route path="/friends/add/:code" element={<FriendInviteLanding />} />
          <Route path="/settings" element={<SettingsView />} />
          <Route path="*" element={<NotFoundView />} />
        </Route>
      </Route>
    </Routes>
  );
}
