import React from "react";
import ReactDOM from "react-dom/client";
import { Dashboard } from "./Dashboard";
import "../index.css";
import { FirebaseGuard } from "@/components/FirebaseGuard";
import { applyThemeToDOM, getSavedTheme } from "@/theme-config";

/**
 * Initialiserer Dashboardet
 * Vi henter temaet async før render for at sikre, at UI'et ikke "blinker"
 */
async function initDashboard() {
  const rootElement = document.getElementById("dashboard-root");
  if (!rootElement) return;

  // 1. Hent og aktivér det gemte tema (Architect, Pastel eller Serene)
  const theme = await getSavedTheme();
  applyThemeToDOM(theme);

  // 2. Render applikationen
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <FirebaseGuard>
        <Dashboard />
      </FirebaseGuard>
    </React.StrictMode>,
  );
}

// Start initialiseringen
initDashboard();
