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
                  <CreateModalProvider>
                    <TimerProvider>
                      <BrowserRouter>
                        {/* Inside the router because the chat navigates and
                            reads the current route for context, but outside
                            the route table because the panel and the
                            conversation outlive any one view. */}
                        <ChatProvider>
                          <AppRoutes />
                          {/* Docked on every route while a session is live, so
                              it lives beside the routes rather than inside one. */}
                          <MiniTimer />
                          <TurboChat />
                        </ChatProvider>
                      </BrowserRouter>
                    </TimerProvider>
                  </CreateModalProvider>
                </AuthProvider>
              </DialogProvider>
            </ToastProvider>
          </OverlayStackProvider>
        </SettingsProvider>
      </AppearanceProvider>
    </QueryClientProvider>
  );
}
