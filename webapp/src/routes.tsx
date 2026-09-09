import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";
import { ProtectedRoute } from "./components/ProtectedRoute";
import {
  OnboardingGate,
  WELCOME_PATH,
} from "./views/onboarding/OnboardingGate";
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
import { PrivacyView } from "./views/privacy/PrivacyView";
import { LandingView } from "./views/marketing/LandingView";
import {
  AboutView,
  ContactView,
  DevelopersView,
} from "./views/marketing/MarketingPages";
import { TasksView } from "./views/tasks/TasksView";
import { ExamsView } from "./views/exams/ExamsView";
import { TimerView } from "./views/timer/TimerView";
import { LibraryView } from "./views/library/LibraryView";
import { DashboardView } from "./views/dashboard/DashboardView";
import { PlanView } from "./views/plan/PlanView";
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
const LazyDeckCardsView = lazy(async () => ({
  default: (await import("./views/decks/DeckCardsView")).DeckCardsView,
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
/* The first-run wizard. Deferred like the rest: it is a screen each account
   sees once, and it pulls in the folder/exam mutations to create a first
   subject, so it has no business in the bundle everyone else downloads. */
const LazyWelcomeView = lazy(async () => ({
  default: (await import("./views/onboarding/WelcomeView")).WelcomeView,
}));
const LazySettingsView = lazy(async () => ({
  default: (await import("./views/settings/SettingsView")).SettingsView,
}));
const LazyFriendsView = lazy(async () => ({
  default: (await import("./views/friends/FriendsView")).FriendsView,
}));
const LazyFriendInviteLanding = lazy(async () => ({
  default: (await import("./views/friends/FriendInviteLanding"))
    .FriendInviteLanding,
}));
const LazyStudyAnalyticsView = lazy(async () => ({
  default: (await import("./views/analytics/StudyAnalyticsView"))
    .StudyAnalyticsView,
}));
const LazyCognitiveDebuggerView = lazy(async () => ({
  default: (await import("./views/debugger/CognitiveDebuggerView"))
    .CognitiveDebuggerView,
}));
const LazyFeynmanHubView = lazy(async () => ({
  default: (await import("./views/feynman/FeynmanHubView")).FeynmanHubView,
}));
const LazyStudyLabView = lazy(async () => ({
  default: (await import("./views/study-lab/StudyLabView")).StudyLabView,
}));
const LazyAiTutorView = lazy(async () => ({
  default: (await import("./views/ai-tutor/AiTutorView")).AiTutorView,
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
 *   /terms, /privacy                   linked from the auth screens
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
      <Route path="/privacy" element={<PrivacyView />} />
      <Route path="/landing" element={<LandingView />} />
      <Route path="/about" element={<AboutView />} />
      <Route path="/contact" element={<ContactView />} />
      <Route path="/developers" element={<DevelopersView />} />
      <Route element={<ProtectedRoute />}>
        {/* Deliberately outside both OnboardingGate and AppShell: a guard
            can't redirect into the screen that satisfies it, and the sidebar
            full of twenty destinations is the very thing this screen exists
            to defer. */}
        <Route
          path={WELCOME_PATH}
          element={
            <DeferredView>
              <LazyWelcomeView />
            </DeferredView>
          }
        />
        {/* Everything below is for an account that has been set up. A brand
            new one is sent to /welcome first. */}
        <Route element={<OnboardingGate />}>
          {/* The sidebar/header chrome — see AppShell's own comment for why
            this sits here rather than inside ProtectedRoute itself. */}
          <Route element={<AppShell />}>
            <Route path="/" element={<DashboardView />} />
            <Route
              path="/notebooks"
              element={<Navigate to="/library" replace />}
            />
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
              path="/study-lab"
              element={
                <DeferredView>
                  <LazyStudyLabView />
                </DeferredView>
              }
            />
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
            <Route
              path="/decks/:deckId"
              element={
                <DeferredView>
                  <LazyDeckCardsView />
                </DeferredView>
              }
            />
            <Route
              path="/friends"
              element={
                <DeferredView>
                  <LazyFriendsView />
                </DeferredView>
              }
            />
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
            <Route
              path="/analytics"
              element={
                <DeferredView>
                  <LazyStudyAnalyticsView />
                </DeferredView>
              }
            />
            <Route
              path="/trajectory"
              element={
                <DeferredView>
                  <LazyTrajectoryView />
                </DeferredView>
              }
            />
            <Route
              path="/ai-tutor"
              element={
                <DeferredView>
                  <LazyAiTutorView />
                </DeferredView>
              }
            />
            <Route
              path="/ai-tutor/:mode"
              element={
                <DeferredView>
                  <LazyAiTutorView />
                </DeferredView>
              }
            />
            <Route
              path="/solver"
              element={
                <DeferredView>
                  <LazyCognitiveDebuggerView />
                </DeferredView>
              }
            />
            <Route
              path="/debugger"
              element={
                <DeferredView>
                  <LazyCognitiveDebuggerView />
                </DeferredView>
              }
            />
            <Route
              path="/exam-detective"
              element={
                <DeferredView>
                  <LazyExamDetectiveHubView />
                </DeferredView>
              }
            />
            {/* Pre-Mortem and Exam Traps were the same feature built twice.
                Pre-Mortem's view tree is gone; its config form — which reads
                the student's own exams rather than a canned subject list —
                lives on in Exam Detective's SubjectPicker. These four paths
                previously redirected to /ai-tutor, a screen with no trap
                practice on it at all; they now land on the real feature. */}
            <Route
              path="/premortem"
              element={<Navigate to="/exam-detective" replace />}
            />
            <Route
              path="/premortem/radar"
              element={<Navigate to="/exam-detective" replace />}
            />
            <Route
              path="/exam-traps"
              element={<Navigate to="/exam-detective" replace />}
            />
            <Route
              path="/exam-traps/radar"
              element={<Navigate to="/exam-detective" replace />}
            />
            <Route
              path="/feynman"
              element={
                <DeferredView>
                  <LazyFeynmanHubView />
                </DeferredView>
              }
            />
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
              path="/viva"
              element={
                <DeferredView>
                  <LazySocraticSparringView />
                </DeferredView>
              }
            />
            <Route
              path="/viva/:sessionId"
              element={
                <DeferredView>
                  <LazySocraticSparringView />
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
            <Route
              path="/friends/add/:code"
              element={
                <DeferredView>
                  <LazyFriendInviteLanding />
                </DeferredView>
              }
            />
            <Route
              path="/settings"
              element={
                <DeferredView>
                  <LazySettingsView />
                </DeferredView>
              }
            />
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
      </Route>
    </Routes>
  );
}
