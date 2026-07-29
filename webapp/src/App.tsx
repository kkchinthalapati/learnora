import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router";
import { queryClient } from "./lib/queryClient";
import { OverlayStackProvider } from "./context/OverlayStackProvider";
import { ToastProvider } from "./context/ToastProvider";
import { DialogProvider } from "./context/DialogProvider";
import { AuthProvider } from "./context/AuthProvider";
import { CreateModalProvider } from "./context/CreateModalProvider";
import { AppRoutes } from "./routes";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  );
}
