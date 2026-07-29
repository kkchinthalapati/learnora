import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OverlayStackProvider } from "../context/OverlayStackProvider";
import { ToastProvider } from "../context/ToastProvider";
import { DialogProvider } from "../context/DialogProvider";
import { CreateModalProvider } from "../context/CreateModalProvider";

/* Mirrors the provider nesting in App.tsx so tests exercise the same
 * composition the app ships. A fresh QueryClient per call keeps one test's
 * cache from leaking into the next; retries are off so a query that's
 * meant to fail in a test doesn't sit there retrying past the assertion.
 * AuthProvider is deliberately not part of this stack — it needs a mocked
 * supabase client (see test/mockSession.ts), which is a per-test concern,
 * not something every renderWithProviders caller should pay for. */
export function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OverlayStackProvider>
        <ToastProvider>
          <DialogProvider>
            <CreateModalProvider>{ui}</CreateModalProvider>
          </DialogProvider>
        </ToastProvider>
      </OverlayStackProvider>
    </QueryClientProvider>,
  );
}
