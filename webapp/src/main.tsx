import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { registerServiceWorker } from "./lib/serviceWorker.ts";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/* Registers the app-shell/push service worker (installability + offline
 * shell come from this alone; push subscribing is a separate opt-in from
 * Settings). Fired after the initial render rather than blocking it. */
void registerServiceWorker();
