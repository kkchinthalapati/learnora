import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router";
import { queryClient } from "./lib/queryClient";
import { OverlayStackProvider } from "./context/OverlayStackProvider";
import { ToastProvider } from "./context/ToastProvider";
import { DialogProvider } from "./context/DialogProvider";
import { AuthProvider } from "./context/AuthProvider";
import { CreateModalProvider } from "./context/CreateModalProvider";
import { AppearanceProvider } from "./context/AppearanceProvider";
import { SettingsProvider } from "./context/SettingsProvider";
import { TimerProvider } from "./context/TimerProvider";
import { ChatProvider } from "./context/ChatProvider";
import { CommandPaletteProvider } from "./context/CommandPaletteProvider";
import { TurboChat } from "./components/chat/TurboChat";
import { FocusStudyHUD } from "./views/timer/FocusStudyHUD";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AppRoutes } from "./routes";
import { useAuth } from "./context/auth";
import { useEffect } from "react";
import { applyAppUpdate, watchForAppUpdate } from "./lib/appUpdate";
import { useToast } from "./context/toast";

/* Offers a reload when a new build is waiting. Mounted inside ToastProvider
   and outside the auth gate: a stale tab is stale whether or not anyone is
   signed in, and the sign-in screen is one of the places a student is most
   likely to be sitting on an old bundle. */
function AppUpdatePrompt() {
  const { showToast } = useToast();

  useEffect(() => {
    let announced = false;
    return watchForAppUpdate(() => {
      /* Once per page life. A student who dismisses the toast has decided to
         keep working; nagging them every fifteen minutes is worse than
         waiting for their next natural reload. */
      if (announced) return;
      announced = true;
      showToast("Learnora has been updated.", {
        actionLabel: "Reload",
        onAction: applyAppUpdate,
        /* Effectively persistent, but a real number: setTimeout overflows its
           32-bit delay above ~24.9 days and fires immediately, which would
           dismiss this instantly. */
        duration: 24 * 60 * 60 * 1000,
      });
    });
  }, [showToast]);

  return null;
}

function SignedInOverlays() {
  const { session } = useAuth();
  if (!session) return null;
  return (
    <>
      <FocusStudyHUD />
      <TurboChat />
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppearanceProvider>
          <SettingsProvider>
            <OverlayStackProvider>
              <ToastProvider>
                <AppUpdatePrompt />
                <DialogProvider>
                  <TimerProvider>
                    <BrowserRouter
                      basename={import.meta.env.BASE_URL.replace(/\/$/, "")}
                    >
                      <CreateModalProvider>
                        <ChatProvider>
                          <CommandPaletteProvider>
                            <ErrorBoundary label="route">
                              <AppRoutes />
                            </ErrorBoundary>
                            {/* Its own boundary, and a silent one. These two
                                sat outside every boundary in the tree, so a
                                throw in the chat panel or the focus HUD took
                                the entire app to a blank tab — the one crash
                                the app-wide net was added to prevent. A
                                docked overlay failing should cost the student
                                the overlay, nothing else. */}
                            <ErrorBoundary label="overlays" fallback={null}>
                              <SignedInOverlays />
                            </ErrorBoundary>
                          </CommandPaletteProvider>
                        </ChatProvider>
                      </CreateModalProvider>
                    </BrowserRouter>
                  </TimerProvider>
                </DialogProvider>
              </ToastProvider>
            </OverlayStackProvider>
          </SettingsProvider>
        </AppearanceProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
