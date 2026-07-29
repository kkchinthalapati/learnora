import { BrowserRouter } from "react-router";
import { OverlayStackProvider } from "./context/OverlayStackProvider";
import { ToastProvider } from "./context/ToastProvider";
import { DialogProvider } from "./context/DialogProvider";
import { AppRoutes } from "./routes";

export default function App() {
  return (
    <OverlayStackProvider>
      <ToastProvider>
        <DialogProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </DialogProvider>
      </ToastProvider>
    </OverlayStackProvider>
  );
}
