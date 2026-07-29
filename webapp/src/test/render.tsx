import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { OverlayStackProvider } from "../context/OverlayStackProvider";
import { ToastProvider } from "../context/ToastProvider";
import { DialogProvider } from "../context/DialogProvider";

/* Mirrors the provider nesting in App.tsx so tests exercise the same
 * composition the app ships. */
export function renderWithProviders(ui: ReactNode) {
  return render(
    <OverlayStackProvider>
      <ToastProvider>
        <DialogProvider>{ui}</DialogProvider>
      </ToastProvider>
    </OverlayStackProvider>,
  );
}
