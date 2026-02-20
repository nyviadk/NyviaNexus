import React, { useEffect, useState } from "react";
import { configureFirebase, auth } from "../lib/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import {
  ChevronLeft,
  Database,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Server,
  Activity,
} from "lucide-react";

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

type SetupState = "loading" | "needs_setup" | "ready";
type SetupView = "landing" | "input";

export const FirebaseGuard: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<SetupState>("loading");
  const [view, setView] = useState<SetupView>("landing");
  const [inputValue, setInputValue] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState("");
  const [parsedPreview, setParsedPreview] = useState<FirebaseConfig | null>(
    null,
  );

  useEffect(() => {
    checkStorage();
  }, []);

  const checkStorage = async () => {
    try {
      const data = await chrome.storage.local.get(["userFirebaseConfig"]);
      if (data.userFirebaseConfig) {
        configureFirebase(data.userFirebaseConfig as FirebaseConfig);
        auth.onAuthStateChanged(() => setState("ready"));
      } else {
        setState("needs_setup");
      }
    } catch (e) {
      setState("needs_setup");
    }
  };

  const parseFirebaseSnippet = (snippet: string): FirebaseConfig | null => {
    const requiredKeys: (keyof FirebaseConfig)[] = [
      "apiKey",
      "authDomain",
      "projectId",
      "storageBucket",
      "messagingSenderId",
      "appId",
    ];

    const config = {} as Partial<FirebaseConfig>;

    for (const key of requiredKeys) {
      const regex = new RegExp(`\\b${key}\\b\\s*:\\s*["'\`]([^"'\`]+)["'\`]`);
      const match = snippet.match(regex);
      if (match && match[1]) {
        config[key] = match[1].trim();
      }
    }

    const isValid = requiredKeys.every((k) => !!config[k]);
    return isValid ? (config as unknown as FirebaseConfig) : null;
  };

  useEffect(() => {
    const config = parseFirebaseSnippet(inputValue);
    setParsedPreview(config);
    if (config) setError("");
  }, [inputValue]);

  const testConnection = async (config: FirebaseConfig): Promise<boolean> => {
    try {
      configureFirebase(config);
      // Vi bruger en dummy login for at validere at keys virker og kan ramme Auth
      await signInWithEmailAndPassword(auth, "test@nexus.dk", "123456");
      return true;
    } catch (err) {
      if (err instanceof FirebaseError) {
        const validAuthErrors = [
          "auth/invalid-credential",
          "auth/user-not-found",
          "auth/wrong-password",
          "auth/invalid-email",
        ];
        return validAuthErrors.includes(err.code);
      }
      return false;
    }
  };

  const handleSave = async () => {
    if (!parsedPreview) return;

    setIsValidating(true);
    setError("");

    const isConnected = await testConnection(parsedPreview);

    if (!isConnected) {
      setError("Forbindelsen mislykkedes. Tjek venligst dine Firebase-nøgler.");
      setIsValidating(false);
      return;
    }

    try {
      await chrome.storage.local.set({ userFirebaseConfig: parsedPreview });
      chrome.runtime.sendMessage({ type: "REINITIALIZE_FIREBASE" });
      setState("ready");
    } catch (err) {
      setError("Kunne ikke gemme konfigurationen.");
    } finally {
      setIsValidating(false);
    }
  };

  if (state === "loading") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-950 font-mono text-xs tracking-widest text-slate-500 uppercase">
        Starter Nexus...
      </div>
    );
  }

  if (state === "needs_setup") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-950 p-6 font-sans text-white">
        <div className="relative z-20 flex min-h-125 w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-700/50 bg-linear-to-b from-slate-900 via-slate-800/60 to-slate-900 shadow-2xl">
          <div className="border-b border-slate-700/30 bg-slate-900/10 p-8 backdrop-blur-sm">
            <h1 className="text-4xl font-black tracking-tighter text-white italic">
              NyviaNexus
            </h1>
            <div className="mt-2 flex items-center gap-2">
              <Activity size={14} className="text-blue-500" />
              <p className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">
                Systemopstart
              </p>
            </div>
          </div>

          <div className="relative flex-1 p-10">
            {view === "landing" ? (
              <div className="space-y-8">
                <div className="space-y-3">
                  <h2 className="text-xl font-bold text-slate-100">
                    {`Velkommen til :}`}
                  </h2>
                  <p className="text-sm leading-relaxed text-slate-400">
                    Nexus hjælper dig med at organisere din hverdag i Chrome.
                    For at sikre fuldt ejerskab over dine data, kører systemet
                    på din egen private infrastruktur.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className="flex items-start gap-4 rounded-xl border border-slate-700/30 bg-slate-900/20 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
                      <Database size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-cyan-400/90">
                        Privat database
                      </h3>
                      <p className="mt-1 text-xs leading-normal text-slate-500">
                        Al din historik og dine workspaces gemmes direkte i dit
                        eget Firebase-projekt.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 rounded-xl border border-slate-700/30 bg-slate-900/20 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                      <Server size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-emerald-400/90">
                        Fuld datakontrol
                      </h3>
                      <p className="mt-1 text-xs leading-normal text-slate-500">
                        Du har den fulde råderet. Ingen tredjepart har adgang
                        til dine personlige data.
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setView("input")}
                  className="w-full cursor-pointer rounded-xl bg-blue-600 py-4 text-sm font-bold text-white shadow-lg shadow-blue-900/20 hover:bg-blue-500 active:scale-[0.98]"
                >
                  Begynd opsætning
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <button
                  onClick={() => setView("landing")}
                  className="group flex cursor-pointer items-center gap-2 text-[10px] font-bold text-slate-500 hover:text-white"
                >
                  <ChevronLeft size={14} /> GÅ TILBAGE
                </button>

                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                      Firebase Konfiguration
                    </label>
                    <a
                      href="https://console.firebase.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cursor-pointer text-[10px] font-bold text-blue-400 hover:text-blue-300 hover:underline"
                    >
                      Hent nøgler her
                    </a>
                  </div>
                  <textarea
                    className={`h-48 w-full resize-none rounded-xl border bg-black/40 p-4 font-mono text-[11px] backdrop-blur-sm outline-none ${
                      error
                        ? "border-red-500/50 text-red-200"
                        : "border-slate-700 text-slate-300 focus:border-blue-500/50 focus:bg-black/60"
                    }`}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={`const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  ...
};`}
                    disabled={isValidating}
                  />
                </div>

                {parsedPreview && !isValidating && (
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                    <ShieldCheck size={18} className="text-emerald-400" />
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black tracking-wider text-emerald-400 uppercase">
                        Konfiguration genkendt
                      </span>
                      <span className="font-mono text-[10px] text-slate-400 italic">
                        Projektid: {parsedPreview.projectId}
                      </span>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                    <AlertCircle size={18} className="text-red-500" />
                    <p className="text-xs font-bold text-red-400">{error}</p>
                  </div>
                )}

                <button
                  onClick={handleSave}
                  disabled={!parsedPreview || isValidating}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl py-4 text-sm font-bold ${
                    parsedPreview && !isValidating
                      ? "cursor-pointer bg-white text-black hover:bg-slate-200 active:scale-[0.98]"
                      : "cursor-not-allowed bg-slate-800 text-slate-600 opacity-50"
                  }`}
                >
                  {isValidating ? (
                    <>
                      <Loader2 size={18} className="animate-spin" /> Verificerer
                      system...
                    </>
                  ) : (
                    "Initialiser system"
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="pointer-events-none fixed inset-0 z-10 bg-[radial-gradient(circle_at_top_left,rgba(30,41,59,0.4),transparent)]" />
      </div>
    );
  }

  return <>{children}</>;
};
