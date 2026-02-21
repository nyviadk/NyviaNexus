import React from "react";
import ReactDOM from "react-dom/client";
import { Dashboard } from "./Dashboard";
import "../index.css";
import { FirebaseGuard } from "@/components/FirebaseGuard";

// TEMA INITIALISERING: Kør straks for at undgå flicker
chrome.storage.local.get(["nexus_theme"], (res) => {
  if (res.nexus_theme === "pastel") {
    document.documentElement.classList.add("theme-pastel");
  }
});

ReactDOM.createRoot(document.getElementById("dashboard-root")!).render(
  <React.StrictMode>
    <FirebaseGuard>
      <Dashboard />
    </FirebaseGuard>
  </React.StrictMode>,
);
