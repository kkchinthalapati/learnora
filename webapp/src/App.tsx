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
import { MiniTimer } from "./views/timer/MiniTimer";
import { AppRoutes } from "./routes";

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
                    <BrowserRouter>
                      {/* CreateModalProvider renders <CreateModal> as a
                          sibling of its children, not a descendant — as of
                          Step 14, MaterialPanel calls useNavigate() after a
                          successful generation, so it (and anything else
                          CreateModal ever needs from the router) has to sit
                          inside BrowserRouter, not outside it. */}
                      <CreateModalProvider>
                        <AppRoutes />
                        {/* Docked on every route while a session is live, so
                            it lives beside the routes rather than inside one. */}
                        <MiniTimer />
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
