import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OverlayStackProvider } from "../context/OverlayStackProvider";
import { ToastProvider } from "../context/ToastProvider";
import { DialogProvider } from "../context/DialogProvider";
import { CreateModalProvider } from "../context/CreateModalProvider";
import { AppearanceProvider } from "../context/AppearanceProvider";
import { SettingsProvider } from "../context/SettingsProvider";
import { AuthContext, type AuthState } from "../context/auth";

/* Mirrors the provider nesting in App.tsx so tests exercise the same
 * composition the app ships. A fresh QueryClient per call keeps one test's
 * cache from leaking into the next; retries are off so a query that's
 * meant to fail in a test doesn't sit there retrying past the assertion.
 *
 * AuthProvider itself is still not part of the stack — it needs a mocked
 * supabase client (see test/mockSession.ts), which is a per-test concern.
 * Tests that need a signed-in user pass an `auth` state, which is injected
 * as a plain AuthContext value (see test/auth.tsx). */

export function newTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

export function AppProviders({
  children,
  auth,
  queryClient,
}: {
  children: ReactNode;
  auth?: AuthState;
  queryClient?: QueryClient;
}) {
  const tree = (
    <QueryClientProvider client={queryClient ?? newTestQueryClient()}>
      <AppearanceProvider>
        <SettingsProvider>
          <OverlayStackProvider>
            <ToastProvider>
              <DialogProvider>
                <CreateModalProvider>{children}</CreateModalProvider>
              </DialogProvider>
            </ToastProvider>
          </OverlayStackProvider>
        </SettingsProvider>
      </AppearanceProvider>
    </QueryClientProvider>
  );

  return auth ? (
    <AuthContext.Provider value={auth}>{tree}</AuthContext.Provider>
  ) : (
    tree
  );
}

export function renderWithProviders(ui: ReactNode, auth?: AuthState) {
  return render(<AppProviders auth={auth}>{ui}</AppProviders>);
}
