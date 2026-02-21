import React, { useEffect, useState } from "react";
import { LoginForm } from "./LoginForm";
import { ConfigReset } from "./ConfigReset";
import { FirebaseConfig } from "../FirebaseGuard";
import { SetupGuide } from "../SetupGuide";

/**
 * AuthLayout
 * Styringsenhed for onboarding-flowet.
 * Henter projectId fra storage for at kunne linke direkte til Firebase Console.
 */
export const AuthLayout: React.FC = () => {
  const [setupUid, setSetupUid] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    // Hent projectId så vi kan bygge de direkte links i guiden
    // Vi caster resultatet for at undgå TS-fejl på Property 'projectId'
    chrome.storage.local.get(["userFirebaseConfig"], (result) => {
      const data = result as { userFirebaseConfig?: FirebaseConfig };
      if (data.userFirebaseConfig?.projectId) {
        setProjectId(data.userFirebaseConfig.projectId);
      }
    });
  }, []);

  const isShowGuide = !!setupUid;

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4 font-sans text-high">
      <div className="flex w-full max-w-sm flex-col items-center">
        {/* Logo Sektion */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-black tracking-tighter text-action italic">
            NyviaNexus
          </h1>
          <p className="text-sm font-medium text-low">
            {isShowGuide
              ? "Sikkerheds-konfiguration"
              : "AI-drevet tab management"}
          </p>
        </div>

        {/* Card Content */}
        <div className="w-full rounded-2xl border border-subtle bg-surface p-8 shadow-2xl">
          {isShowGuide && projectId ? (
            <SetupGuide
              uid={setupUid}
              projectId={projectId}
              onComplete={() => window.location.reload()}
            />
          ) : (
            <LoginForm onUserCreated={(uid) => setSetupUid(uid)} />
          )}
        </div>

        {/* Nødbremse - Skjules under guiden */}
        {!isShowGuide && (
          <div className="mt-6 w-full">
            <ConfigReset />
          </div>
        )}
      </div>
    </div>
  );
};
