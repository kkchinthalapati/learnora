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
                    <BrowserRouter>
                      <AppRoutes />
                    </BrowserRouter>
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
