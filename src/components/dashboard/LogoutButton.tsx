import React, { useState } from "react";
import { LogOut, Loader2 } from "lucide-react";
import { auth } from "../../lib/firebase";
import { WinMapping } from "@/background/main";

interface LogoutButtonProps {
  activeMappings: [number, WinMapping][];
}

export const LogoutButton: React.FC<LogoutButtonProps> = ({
  activeMappings,
}) => {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async (e: React.MouseEvent) => {
    // STOP ALT: Forhindrer at knappen trigger forms eller forældre-events
    e.preventDefault();
    e.stopPropagation();

    // 1. Find aktive vinduer (Sikkerhedstjek)
    const activeSpaceWindows = activeMappings.filter(
      ([_, mapping]) => mapping.workspaceId && mapping.workspaceId !== "global",
    );

    if (activeSpaceWindows.length > 0) {
      alert(
        `🛑 SIKKERHEDS-STOP\n\n` +
          `Du har ${activeSpaceWindows.length} Space-vindue(r) åbent.\n\n` +
          `Luk alle fysiske vinduer før log-ud for at sikre dataintegritet.`,
      );
      return;
    }

    // 2. Eksplicit bekræftelse - gem svaret i en konstant
    const confirmed = window.confirm(
      "Er du sikker på, at du vil logge ud af din konto?",
    );

    // 3. Den vigtige guard: Hvis brugeren trykker ANNULLER, afbryder vi med det samme.
    if (confirmed !== true) {
      console.log("Log ud afbrudt af bruger.");
      return;
    }

    setIsLoggingOut(true);

    try {
      console.log("Logger ud af Firebase...");
      // Vi venter på at Firebase faktisk har logget brugeren ud
      await auth.signOut();
      console.log("Log ud fuldført.");
    } catch (error) {
      console.error("Fejl under log-ud:", error);
      alert("Der skete en fejl under log-ud. Prøv igen.");
      setIsLoggingOut(false);
    }
  };

  return (
    <button
      type="button" // SIKRER at den ikke submitter noget ved en fejl
      onClick={handleLogout}
      disabled={isLoggingOut}
      className={`flex cursor-pointer items-center gap-2 rounded border border-transparent px-3 py-1.5 text-[10px] font-black uppercase transition-all ${
        isLoggingOut
          ? "cursor-not-allowed bg-slate-800 text-slate-600"
          : "text-slate-500 hover:border-red-900/30 hover:bg-red-950/10 hover:text-red-500"
      }`}
    >
      {isLoggingOut ? (
        <>
          <Loader2 size={14} className="animate-spin" /> Logger ud...
        </>
      ) : (
        <>
          <LogOut size={14} /> Log ud
        </>
      )}
    </button>
  );
};
