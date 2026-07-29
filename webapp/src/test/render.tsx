import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OverlayStackProvider } from "../context/OverlayStackProvider";
import { ToastProvider } from "../context/ToastProvider";
import { DialogProvider } from "../context/DialogProvider";

/* Mirrors the provider nesting in App.tsx so tests exercise the same
 * composition the app ships. A fresh QueryClient per call keeps one test's
 * cache from leaking into the next; retries are off so a query that's
 * meant to fail in a test doesn't sit there retrying past the assertion. */
export function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OverlayStackProvider>
        <ToastProvider>
          <DialogProvider>{ui}</DialogProvider>
        </ToastProvider>
      </OverlayStackProvider>
    </QueryClientProvider>,
  );
}
