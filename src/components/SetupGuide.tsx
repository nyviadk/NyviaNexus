import React, { useState } from "react";
import {
  Shield,
  Copy,
  Check,
  Terminal,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";

interface SetupGuideProps {
  uid: string;
  projectId: string;
  onComplete: () => void;
}

/**
 * SetupGuide
 * Viser Firestore regler, direkte link til console og kræver bekræftelse via checkbox.
 */
export const SetupGuide: React.FC<SetupGuideProps> = ({
  uid,
  projectId,
  onComplete,
}) => {
  const [copied, setCopied] = useState(false);
  const [hasConfirmed, setHasConfirmed] = useState(false);

  // Dynamisk link direkte til rules-siden for brugerens projekt
  const rulesUrl = `https://console.firebase.google.com/project/${projectId}/firestore/databases/-default-/security/rules`;

  const firestoreRules = `rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    // Nexus Privatlivs-regel: Kun DU har adgang
    match /{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == "${uid}";
    }
  }
}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(firestoreRules);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFinalize = () => {
    if (!hasConfirmed) return;
    sessionStorage.removeItem("nexus_setup_mode");
    onComplete();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-emerald-400">
          <Shield size={18} />
          <h2 className="text-sm font-bold tracking-widest uppercase">
            Beskyt din data
          </h2>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-400">
          Kontoen er oprettet! For at sikre dit privatliv skal du indsætte disse
          regler i din Firestore Database.
        </p>
      </div>

      {/* Kode-boks */}
      <div className="rounded-xl border border-slate-800 bg-black/50 p-4">
        <div className="mb-3 flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase">
          <div className="flex items-center gap-2">
            <Terminal size={14} /> Firestore Rules
          </div>
          <button
            onClick={copyToClipboard}
            className="cursor-pointer text-blue-400 transition-colors hover:text-blue-300"
          >
            {copied ? (
              <Check size={12} className="mr-1 inline" />
            ) : (
              <Copy size={12} className="mr-1 inline" />
            )}
            {copied ? "KOPIERET" : "KOPIER"}
          </button>
        </div>
        <pre className="custom-scrollbar max-h-32 overflow-y-auto font-mono text-[9px] leading-tight text-slate-300">
          {firestoreRules}
        </pre>
      </div>

      {/* Direkte Link og Checkbox Sektion */}
      <div className="space-y-4 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
        <a
          href={rulesUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-between gap-2 rounded-lg bg-blue-600 p-3 text-[11px] font-bold text-white transition-all hover:bg-blue-500"
        >
          ÅBN REGLER I FIREBASE CONSOLE
          <ExternalLink size={14} />
        </a>

        <label className="flex cursor-pointer items-start gap-3">
          <div className="relative flex items-center pt-0.5">
            <input
              type="checkbox"
              className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-slate-600 bg-slate-800 transition-all checked:border-emerald-500 checked:bg-emerald-500"
              checked={hasConfirmed}
              onChange={(e) => setHasConfirmed(e.target.checked)}
            />
            <Check
              size={12}
              className="pointer-events-none absolute top-1.5 left-0.5 text-white opacity-0 transition-opacity peer-checked:opacity-100"
            />
          </div>
          <span className="text-[10px] leading-snug text-slate-400 select-none">
            Jeg bekræfter, at jeg har indsat og <b>publiceret</b> reglerne i min
            Firebase Console.
          </span>
        </label>
      </div>

      <button
        onClick={handleFinalize}
        disabled={!hasConfirmed}
        className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg p-3 text-sm font-bold text-white transition-all ${
          hasConfirmed
            ? "bg-emerald-600 shadow-lg shadow-emerald-900/20 hover:bg-emerald-500 active:scale-95"
            : "cursor-not-allowed bg-slate-800 text-slate-500 opacity-50"
        }`}
      >
        {!hasConfirmed && <AlertTriangle size={14} />}
        Start NyviaNexus
      </button>
    </div>
  );
};
