import React from "react";
import ReactDOM from "react-dom/client";
import { Dashboard } from "./Dashboard";
import "../index.css";
import { FirebaseGuard } from "@/components/FirebaseGuard";

ReactDOM.createRoot(document.getElementById("dashboard-root")!).render(
  <React.StrictMode>
    <FirebaseGuard>
      <Dashboard />
    </FirebaseGuard>
  </React.StrictMode>,
);
