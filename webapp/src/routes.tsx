import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";
import { LegacyToolRedirect } from "./views/session/LegacyToolRedirect";
import { ProtectedRoute } from "./components/ProtectedRoute";
import {
  OnboardingGate,
  WELCOME_PATH,
} from "./views/onboarding/OnboardingGate";
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
import { NotFoundView } from "./views/not-found/NotFoundView";
import { Skeleton } from "./components/Skeleton";
import styles from "./routes.module.css";

/* Every signed-in screen and the marketing pages load on demand. The sign-in
   screen used to download the whole app (862 KB entry script) before a
   student could type a password; now the entry carries only what the public
   and auth routes need, and the shell arrives while they sign in. */
const LazyAppShell = lazy(async () => ({
  default: (await import("./components/AppShell")).AppShell,
}));
const LazyTodayView = lazy(async () => ({
  default: (await import("./views/today/TodayView")).TodayView,
}));
const LazyTasksView = lazy(async () => ({
  default: (await import("./views/tasks/TasksView")).TasksView,
}));
const LazyExamsView = lazy(async () => ({
  default: (await import("./views/exams/ExamsView")).ExamsView,
}));
const LazyPlacementView = lazy(async () => ({
  default: (await import("./views/exams/PlacementView")).PlacementView,
}));
const LazyExamDetailView = lazy(async () => ({
  default: (await import("./views/exams/ExamDetailView")).ExamDetailView,
}));
const LazyTimerView = lazy(async () => ({
  default: (await import("./views/timer/TimerView")).TimerView,
}));
const LazyLibraryView = lazy(async () => ({
  default: (await import("./views/library/LibraryView")).LibraryView,
}));
const LazyPlanView = lazy(async () => ({
  default: (await import("./views/plan/PlanView")).PlanView,
}));
const LazyLandingView = lazy(async () => ({
  default: (await import("./views/marketing/LandingView")).LandingView,
}));
const LazyAboutView = lazy(async () => ({
  default: (await import("./views/marketing/MarketingPages")).AboutView,
}));
const LazyContactView = lazy(async () => ({
  default: (await import("./views/marketing/MarketingPages")).ContactView,
}));
const LazyDevelopersView = lazy(async () => ({
  default: (await import("./views/marketing/MarketingPages")).DevelopersView,
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
const LazyFeynmanDebriefView = lazy(async () => ({
  default: (await import("./views/feynman/FeynmanDebriefView"))
    .FeynmanDebriefView,
}));
const LazyWelcomeToProView = lazy(async () => ({
  default: (await import("./views/pro-welcome/WelcomeToProView"))
    .WelcomeToProView,
}));
/* The first-run wizard. Deferred like the rest: it is a screen each account
   sees once, and it pulls in the folder/exam mutations to create a first
   subject, so it has no business in the bundle everyone else downloads. */
const LazyStudyProfileWizard = lazy(async () => ({
  default: (await import("./views/onboarding/StudyProfileWizard")).StudyProfileWizard,
}));
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
const LazySessionView = lazy(async () => ({
  default: (await import("./views/session/SessionView")).SessionView,
}));
const LazyStudyLabView = lazy(async () => ({
  default: (await import("./views/study-lab/StudyLabView")).StudyLabView,
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

/* While the sidebar/header chunk loads after sign-in. Full-page and
   unstyled beyond the skeleton — there is no chrome to keep the shape of. */
function ShellFallback() {
  return (
    <div className={styles.deferredFallback} aria-busy="true">
      <Skeleton label="Loading Learnora" height={32} width="40%" />
      <Skeleton height={220} />
    </div>
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
      <Route path="/landing" element={
              <DeferredView>
                <LazyLandingView />
              </DeferredView>
            } />
      <Route path="/about" element={
              <DeferredView>
                <LazyAboutView />
              </DeferredView>
            } />
      <Route path="/contact" element={
              <DeferredView>
                <LazyContactView />
              </DeferredView>
            } />
      <Route path="/developers" element={
              <DeferredView>
                <LazyDevelopersView />
              </DeferredView>
            } />
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
        {/* The full study profile: any country, board and subject. Outside
            the gate for the same reason as /welcome, which links here. */}
        <Route
          path="/setup/profile"
          element={
            <DeferredView>
              <LazyStudyProfileWizard />
            </DeferredView>
          }
        />
        {/* Everything below is for an account that has been set up. A brand
            new one is sent to /welcome first. */}
        <Route element={<OnboardingGate />}>
          {/* Focus mode: a Session has no sidebar or header — its own top bar
              carries "Save & leave". Outside AppShell for that reason. */}
          <Route
            path="/study/:sessionId"
            element={
              <DeferredView>
                <LazySessionView />
              </DeferredView>
            }
          />
          {/* The sidebar/header chrome — see AppShell's own comment for why
            this sits here rather than inside ProtectedRoute itself. */}
          <Route
            element={
              <Suspense fallback={<ShellFallback />}>
                <LazyAppShell />
              </Suspense>
            }
          >
            <Route path="/" element={
              <DeferredView>
                <LazyTodayView />
              </DeferredView>
            } />
            {/* 2026-09 redesign: Today is the home. The misconception ledger
                that lived on the Dashboard is on Progress now. */}
            <Route path="/dashboard" element={<Navigate to="/" replace />} />
            <Route
              path="/notebooks"
              element={<Navigate to="/library/notebooks" replace />}
            />
            <Route
              path="/notebooks/:notebookId"
              element={
                <DeferredView>
                  <LazyNotebookStudioView />
                </DeferredView>
              }
            />
            <Route path="/tasks" element={
              <DeferredView>
                <LazyTasksView />
              </DeferredView>
            } />
            <Route path="/exams" element={
              <DeferredView>
                <LazyExamsView />
              </DeferredView>
            } />
            <Route path="/exams/:examId" element={
              <DeferredView>
                <LazyExamDetailView />
              </DeferredView>
            } />
            <Route path="/exams/:examId/placement" element={
              <DeferredView>
                <LazyPlacementView />
              </DeferredView>
            } />
            <Route path="/timer" element={
              <DeferredView>
                <LazyTimerView />
              </DeferredView>
            } />
            <Route path="/library" element={
              <DeferredView>
                <LazyLibraryView />
              </DeferredView>
            } />
            <Route path="/library/:tab" element={
              <DeferredView>
                <LazyLibraryView />
              </DeferredView>
            } />
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
            <Route path="/plan" element={
              <DeferredView>
                <LazyPlanView />
              </DeferredView>
            } />
            <Route
              path="/study"
              element={
                <DeferredView>
                  <LazyStudyLabView />
                </DeferredView>
              }
            />
            <Route path="/study-lab" element={<Navigate to="/study" replace />} />
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
            {/* /ai-tutor was a third way to reach tools that already had two
                each: it rendered no UI of its own, only a tab strip that
                mounted the Solver, Feynman and Viva views inline. The hub at
                /study is the single front door now. */}
            <Route path="/ai-tutor" element={<Navigate to="/study" replace />} />
            <Route
              path="/ai-tutor/:mode"
              element={<Navigate to="/study" replace />}
            />
            {/* The study tools are modes of one Session now (2026-09
                redesign). Old URLs redirect, keeping any ?topic= they carry
                — see LegacyToolRedirect. The Feynman debrief stays a page:
                Teach mode links to it when a session finishes. */}
            <Route path="/solver" element={<LegacyToolRedirect mode="explain" />} />
            <Route path="/debugger" element={<LegacyToolRedirect mode="explain" />} />
            <Route
              path="/exam-detective"
              element={<LegacyToolRedirect mode="practice" preset="traps" />}
            />
            <Route path="/feynman" element={<LegacyToolRedirect mode="teach" />} />
            <Route
              path="/feynman/studio/:sessionId"
              element={<LegacyToolRedirect mode="teach" keepSessionId />}
            />
            <Route
              path="/feynman/debrief/:sessionId"
              element={
                <DeferredView>
                  <LazyFeynmanDebriefView />
                </DeferredView>
              }
            />
            <Route path="/viva" element={<LegacyToolRedirect mode="socratic" voice />} />
            <Route
              path="/viva/:sessionId"
              element={<LegacyToolRedirect mode="socratic" voice />}
            />
            <Route path="/sparring" element={<LegacyToolRedirect mode="socratic" voice />} />
            <Route
              path="/sparring/:sessionId"
              element={<LegacyToolRedirect mode="socratic" voice />}
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
