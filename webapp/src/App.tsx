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
import { TurboChat } from "./components/chat/TurboChat";
import { MiniTimer } from "./views/timer/MiniTimer";
import { AppRoutes } from "./routes";
import { useAuth } from "./context/auth";

/* The two docked overlays, kept off the signed-out routes.
 *
 * Both already self-hide most of the time — the mini timer only when a session
 * is live, the chat only when it is open — but "a session is live" is timer
 * state restored from localStorage, which outlives signing out. Without this
 * a returning visitor could get a floating timer over the login form. */
function SignedInOverlays() {
  const { session } = useAuth();
  if (!session) return null;
  return (
    <>
      <MiniTimer />
      <TurboChat />
    </>
  );
}

/* AppearanceProvider sits outside the router: the body attributes it writes
 * style every route, not only /settings, and it has to paint on first mount
 * rather than when the Settings view happens to be visited. */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppearanceProvider>
        <SettingsProvider>
          <OverlayStackProvider>
            <ToastProvider>
              <DialogProvider>
                <AuthProvider>
                  <TimerProvider>
                    {/* Mounted under whatever `base` the build used, so a
                        route table written as "/settings" resolves to
                        "/app/settings" in production and "/settings" in any
                        build served from the root. BASE_URL keeps its
                        trailing slash; basename does not want one. */}
                    <BrowserRouter
                      basename={import.meta.env.BASE_URL.replace(/\/$/, "")}
                    >
                      {/* Both of these sit inside the router and outside the
                          route table, for the same two reasons: each navigates
                          (the chat on its action tags, the Create dialog to
                          whatever a run just produced), and each outlives any
                          one view. */}
                      <CreateModalProvider>
                        <ChatProvider>
                          <AppRoutes />
                          {/* Docked on every route while a session is live, so
                              they live beside the routes rather than inside one. */}
                          <SignedInOverlays />
                        </ChatProvider>
                      </CreateModalProvider>
                    </BrowserRouter>
                  </TimerProvider>
                </AuthProvider>
              </DialogProvider>
            </ToastProvider>
          </OverlayStackProvider>
        </SettingsProvider>
      </AppearanceProvider>
    </QueryClientProvider>
  );
}
