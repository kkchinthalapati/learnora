import { lazy, Suspense, type ReactNode } from "react";
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
import { DashboardView } from "./views/dashboard/DashboardView";
import { PlanView } from "./views/plan/PlanView";
import { FriendsView } from "./views/friends/FriendsView";
import { FriendInviteLanding } from "./views/friends/FriendInviteLanding";
import { StudyAnalyticsView } from "./views/analytics/StudyAnalyticsView";
import { CognitiveDebuggerView } from "./views/debugger/CognitiveDebuggerView";
import { PreMortemHubView } from "./views/premortem/PreMortemHubView";
import { PreMortemRadarView } from "./views/premortem/PreMortemRadarView";
import { FeynmanHubView } from "./views/feynman/FeynmanHubView";
import { NotebooksHubView } from "./views/notebooks/NotebooksHubView";
import { NotFoundView } from "./views/not-found/NotFoundView";
import { Skeleton } from "./components/Skeleton";
import styles from "./routes.module.css";

const LazyExamDetectiveHubView = lazy(async () => ({
  default: (await import("./views/exam-detective/ExamDetectiveHubView"))
    .ExamDetectiveHubView,
}));
const LazyNotebookStudioView = lazy(async () => ({
  default: (await import("./views/notebooks/NotebookStudioView"))
    .NotebookStudioView,
}));
const LazySubjectDetailPage = lazy(async () => ({
  default: (await import("./views/library/SubjectDetailPage"))
    .SubjectDetailPage,
}));
const LazyNotesView = lazy(async () => ({
  default: (await import("./views/notes/NotesView")).NotesView,
}));
const LazyQuizRunner = lazy(async () => ({
  default: (await import("./views/quiz/QuizRunner")).QuizRunner,
}));
const LazyMockExamRunner = lazy(async () => ({
  default: (await import("./views/quiz/MockExamRunner")).MockExamRunner,
}));
const LazyQuizReview = lazy(async () => ({
  default: (await import("./views/quiz/QuizReview")).QuizReview,
}));
const LazyReviewView = lazy(async () => ({
  default: (await import("./views/review/ReviewView")).ReviewView,
}));
/* Life Sync's setup screen: a long form nobody opens twice a week, and it
   pulls in the whole availability/scheduling engine. Deferred for the same
   reason the studio and the quiz runner are. */
const LazyMyWeekView = lazy(async () => ({
  default: (await import("./views/lifesync/MyWeekView")).MyWeekView,
}));
const LazyTrajectoryView = lazy(async () => ({
  default: (await import("./views/trajectory/TrajectoryView")).TrajectoryView,
}));
const LazyStudyRoomView = lazy(async () => ({
  default: (await import("./views/room/StudyRoomView")).StudyRoomView,
}));
const LazyFeynmanStudioView = lazy(async () => ({
  default: (await import("./views/feynman/FeynmanStudioView"))
    .FeynmanStudioView,
}));
const LazyFeynmanDebriefView = lazy(async () => ({
  default: (await import("./views/feynman/FeynmanDebriefView"))
    .FeynmanDebriefView,
}));
const LazySocraticSparringView = lazy(async () => ({
  default: (await import("./views/sparring/SocraticSparringView"))
    .SocraticSparringView,
}));
const LazyWelcomeToProView = lazy(async () => ({
  default: (await import("./views/pro-welcome/WelcomeToProView"))
    .WelcomeToProView,
}));

/* The fallback covers the seven heaviest screens — quiz runner, review,
   notes, the notebook studio — so it is on screen for a real moment on a slow
   connection. A bare unstyled paragraph collapses the whole layout and then
   snaps back; a Skeleton holds roughly the shape of what is coming, which is
   the same thing Analytics does while its data loads. */
function DeferredView({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className={styles.deferredFallback} aria-busy="true">
          <Skeleton label="Loading workspace" height={32} width="40%" />
          <Skeleton height={220} />
          <Skeleton height={160} />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

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
          <Route
            path="/notebooks/:notebookId"
            element={
              <DeferredView>
                <LazyNotebookStudioView />
              </DeferredView>
            }
          />
          <Route path="/tasks" element={<TasksView />} />
          <Route path="/exams" element={<ExamsView />} />
          <Route path="/timer" element={<TimerView />} />
          <Route path="/library" element={<LibraryView />} />
          <Route path="/library/:tab" element={<LibraryView />} />
          <Route
            path="/folders/:folderId"
            element={
              <DeferredView>
                <LazySubjectDetailPage />
              </DeferredView>
            }
          />
          <Route
            path="/notes/:materialId"
            element={
              <DeferredView>
                <LazyNotesView />
              </DeferredView>
            }
          />
          <Route path="/plan" element={<PlanView />} />
          <Route
            path="/my-week"
            element={
              <DeferredView>
                <LazyMyWeekView />
              </DeferredView>
            }
          />
          <Route
            path="/quiz/:quizId"
            element={
              <DeferredView>
                <LazyQuizRunner />
              </DeferredView>
            }
          />
          <Route
            path="/quiz/:quizId/mock-exam"
            element={
              <DeferredView>
                <LazyMockExamRunner />
              </DeferredView>
            }
          />
          <Route
            path="/quiz/:quizId/review"
            element={
              <DeferredView>
                <LazyQuizReview />
              </DeferredView>
            }
          />
          <Route
            path="/review/:deckId"
            element={
              <DeferredView>
                <LazyReviewView />
              </DeferredView>
            }
          />
          <Route path="/friends" element={<FriendsView />} />
          <Route
            path="/room"
            element={
              <DeferredView>
                <LazyStudyRoomView />
              </DeferredView>
            }
          />
          <Route
            path="/room/:roomId"
            element={
              <DeferredView>
                <LazyStudyRoomView />
              </DeferredView>
            }
          />
          <Route path="/analytics" element={<StudyAnalyticsView />} />
          <Route
            path="/trajectory"
            element={
              <DeferredView>
                <LazyTrajectoryView />
              </DeferredView>
            }
          />
          <Route path="/debugger" element={<CognitiveDebuggerView />} />
          <Route
            path="/exam-detective"
            element={
              <DeferredView>
                <LazyExamDetectiveHubView />
              </DeferredView>
            }
          />
          <Route path="/premortem" element={<PreMortemHubView />} />
          <Route path="/premortem/radar" element={<PreMortemRadarView />} />
          <Route path="/feynman" element={<FeynmanHubView />} />
          <Route
            path="/feynman/studio"
            element={
              <DeferredView>
                <LazyFeynmanStudioView />
              </DeferredView>
            }
          />
          <Route
            path="/feynman/studio/:sessionId"
            element={
              <DeferredView>
                <LazyFeynmanStudioView />
              </DeferredView>
            }
          />
          <Route
            path="/feynman/debrief/:sessionId"
            element={
              <DeferredView>
                <LazyFeynmanDebriefView />
              </DeferredView>
            }
          />
          <Route
            path="/sparring"
            element={
              <DeferredView>
                <LazySocraticSparringView />
              </DeferredView>
            }
          />
          <Route
            path="/sparring/:sessionId"
            element={
              <DeferredView>
                <LazySocraticSparringView />
              </DeferredView>
            }
          />
          {/* Inside the guard on purpose: an invite link opened by someone
              who is signed out goes through ProtectedRoute's existing
              `state: { from }` redirect and lands back here after login. */}
          <Route path="/friends/add/:code" element={<FriendInviteLanding />} />
          <Route path="/settings" element={<SettingsView />} />
          <Route
            path="/welcome-pro"
            element={
              <DeferredView>
                <LazyWelcomeToProView />
              </DeferredView>
            }
          />
          <Route path="*" element={<NotFoundView />} />
        </Route>
      </Route>
    </Routes>
  );
}
