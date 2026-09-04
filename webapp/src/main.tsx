import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { registerServiceWorker } from "./lib/serviceWorker.ts";
import {
  initMonitoring,
  installGlobalErrorHandlers,
} from "./lib/monitoring.ts";

/* Before the first render, so a crash during initial mount is still reported.
 * No-ops entirely when VITE_SENTRY_DSN is unset, which is the case in
 * development and in tests. */
void initMonitoring();
installGlobalErrorHandlers();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/* Registers the app-shell/push service worker (installability + offline
 * shell come from this alone; push subscribing is a separate opt-in from
 * Settings). Fired after the initial render rather than blocking it. */
void registerServiceWorker();
