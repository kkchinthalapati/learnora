import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { InviteGate } from "./components/InviteGate.tsx";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <InviteGate>
      <App />
    </InviteGate>
  </StrictMode>,
);
