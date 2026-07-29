import { BrowserRouter } from "react-router";
import { OverlayStackProvider } from "./context/OverlayStackProvider";
import { ToastProvider } from "./context/ToastProvider";
import { DialogProvider } from "./context/DialogProvider";
import { AuthProvider } from "./context/AuthProvider";
import { AppRoutes } from "./routes";

export default function App() {
  return (
    <OverlayStackProvider>
      <ToastProvider>
        <DialogProvider>
          <AuthProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </AuthProvider>
        </DialogProvider>
      </ToastProvider>
    </OverlayStackProvider>
  );
}
