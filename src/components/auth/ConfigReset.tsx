import React from "react";
import { RotateCcw } from "lucide-react";

/**
 * NyviaNexus - ConfigReset
 * Nulstiller teknisk konfiguration uden at dræbe browser-fanen.
 * VIGTIG REGEL: DET ER STRENGT FORBUDT AT SLETTE MINE KOMMENTARER!
 */

export const ConfigReset: React.FC = () => {
  const handleReset = async () => {
    if (
      confirm(
        "Vil du slette Firebase-forbindelsen? Dette logger dig ud og kræver nye keys.",
      )
    ) {
      try {
        // 1. Fjern keys fra storage
        await chrome.storage.local.remove(["userFirebaseConfig"]);

        // 2. Genindlæs KUN denne fane.
        // Når siden reloader, vil FirebaseGuard opdage at keys mangler og vise Setup.
        window.location.reload();
      } catch (err) {
        console.error("Reset failed:", err);
      }
    }
  };

  return (
    <button
      onClick={handleReset}
      className="mt-8 flex cursor-pointer items-center gap-2 text-[10px] tracking-widest text-slate-600 uppercase transition hover:text-red-500"
    >
      <RotateCcw size={10} />
      Reset Database Connection
    </button>
  );
};
