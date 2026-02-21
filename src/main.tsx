import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

/**
 * NyviaNexus - Popup Entry Point
 * Vi henter temaet fra storage FØR vi renderer for at undgå flickering.
 */
async function initPopup() {
  const rootElement = document.getElementById("root");
  if (!rootElement) return;

  // 1. Hent temaet (Husk at bruge 'nexus_theme' så det matcher din Selector)
  const res = await chrome.storage.local.get(["nexus_theme"]);
  const theme = res.nexus_theme || "architect";

  // 2. Sæt klassen på HTML-elementet med det samme
  if (theme === "pastel") {
    document.documentElement.classList.add("theme-pastel");
  } else {
    document.documentElement.classList.remove("theme-pastel");
  }

  // 3. Render React appen
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

// Start sekvensen
initPopup();
