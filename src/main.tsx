import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyThemeToDOM, getSavedTheme } from "./theme-config";

/**
 * NyviaNexus - Popup Entry Point
 */
async function initPopup() {
  const rootElement = document.getElementById("root");
  if (!rootElement) return;

  // 1. Hent og aktivér tema med det samme (fjerner flicker)
  const theme = await getSavedTheme();
  applyThemeToDOM(theme);

  // 2. Render React appen
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

initPopup();
