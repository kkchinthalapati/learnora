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
      <AppearanceProvider>
        <SettingsProvider>
          <OverlayStackProvider>
            <ToastProvider>
              <DialogProvider>
                <AuthProvider>
                  <TimerProvider>
                    <BrowserRouter
                      basename={import.meta.env.BASE_URL.replace(/\/$/, "")}
                    >
                      <CreateModalProvider>
                        <ChatProvider>
                          <CommandPaletteProvider>
                            <ErrorBoundary>
                              <AppRoutes />
                            </ErrorBoundary>
                            <SignedInOverlays />
                          </CommandPaletteProvider>
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
