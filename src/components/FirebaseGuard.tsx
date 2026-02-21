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
  MapPin,
} from "lucide-react";
import { AuthLayout } from "./auth/AuthLayout";

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

type SetupState = "loading" | "needs_setup" | "needs_auth" | "ready";
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

        // Overvåg Auth tilstand
        auth.onAuthStateChanged((user) => {
          const isSetupMode =
            sessionStorage.getItem("nexus_setup_mode") === "true";

          if (user && !isSetupMode) {
            setState("ready");
          } else {
            setState("needs_auth");
          }
        });
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

    try {
      // 1. Test forbindelsen først (din dummy-login logik)
      const isConnected = await testConnection(parsedPreview);
      if (!isConnected) {
        setError(
          "Forbindelsen mislykkedes. Tjek venligst dine Firebase-nøgler.",
        );
        setIsValidating(false);
        return;
      }

      // 2. Gem til storage
      await chrome.storage.local.set({ userFirebaseConfig: parsedPreview });

      // 3. VIGTIGT: Giv Background Script besked og VENT på svar
      // Dette sikrer at background er klar FØR vi lader UI gå videre
      await chrome.runtime.sendMessage({ type: "REINITIALIZE_FIREBASE" });

      // 4. Skift tilstand
      setState("ready");
    } catch (err) {
      setError("Kunne ikke gemme konfigurationen.");
      setIsValidating(false);
    }
  };

  if (state === "loading") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background font-mono text-xs tracking-widest text-low uppercase">
        Starter Nexus...
      </div>
    );
  }

  // Hvis vi mangler login eller er i Setup Guide mode
  if (state === "needs_auth") {
    return <AuthLayout />;
  }

  if (state === "needs_setup") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background p-6 font-sans text-high">
        <div className="relative z-20 flex min-h-125 w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-subtle bg-[linear-gradient(180deg,var(--tw-bg-surface)_0%,var(--tw-bg-surface-elevated)_100%)] shadow-2xl">
          <div className="border-b border-subtle bg-surface-sunken/50 p-8 backdrop-blur-sm">
            <h1 className="text-4xl font-black tracking-tighter text-high italic">
              NyviaNexus
            </h1>
            <div className="mt-2 flex items-center gap-2">
              <Activity size={14} className="text-action" />
              <p className="text-[11px] font-bold tracking-widest text-low uppercase">
                Systemopstart
              </p>
            </div>
          </div>

          <div className="relative flex-1 p-10">
            {view === "landing" ? (
              <div className="space-y-8">
                <div className="space-y-3">
                  <h2 className="text-xl font-bold text-high">
                    {`Velkommen til :}`}
                  </h2>
                  <p className="text-sm leading-relaxed text-medium">
                    Nexus hjælper dig med at organisere din hverdag i Chrome.
                    For at sikre fuldt ejerskab over dine data, kører systemet
                    på din egen private infrastruktur.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className="flex items-start gap-4 rounded-xl border border-subtle bg-surface p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info">
                      <Database size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-info">
                        Privat database
                      </h3>
                      <p className="mt-1 text-xs leading-normal text-low">
                        Al din historik og dine workspaces gemmes direkte i dit
                        eget Firebase-projekt.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 rounded-xl border border-subtle bg-surface p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
                      <Server size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-success">
                        Fuld datakontrol
                      </h3>
                      <p className="mt-1 text-xs leading-normal text-low">
                        Du har den fulde råderet. Ingen tredjepart har adgang
                        til dine personlige data.
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setView("input")}
                  className="hover:bg-action-hover w-full cursor-pointer rounded-xl bg-action py-4 text-sm font-bold text-inverted shadow-lg shadow-action/20 active:scale-[0.98]"
                >
                  Begynd opsætning
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <button
                  onClick={() => setView("landing")}
                  className="group flex cursor-pointer items-center gap-2 text-[10px] font-bold text-low hover:text-medium"
                >
                  <ChevronLeft size={14} /> GÅ TILBAGE
                </button>

                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[10px] font-bold tracking-widest text-medium uppercase">
                      Firebase Konfiguration
                    </label>
                    <a
                      href="https://console.firebase.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-action-hover cursor-pointer text-[10px] font-bold text-action hover:underline"
                    >
                      Hent nøgler her
                    </a>
                  </div>

                  {/* Lokations-instruktion tilføjet herunder */}
                  <div className="flex items-center gap-3 rounded-lg border border-info/20 bg-info/10 px-3 py-2">
                    <MapPin size={14} className="text-info" />
                    <p className="text-[10px] leading-tight text-medium">
                      <strong className="text-info uppercase">Vigtigt:</strong>{" "}
                      Sørg for at vælge{" "}
                      <span className="text-high">
                        "europe-west1 (Belgium)"
                      </span>{" "}
                      som lokation for din Firestore database.
                    </p>
                  </div>

                  <textarea
                    className={`h-48 w-full resize-none rounded-xl border bg-surface-sunken p-4 font-mono text-[11px] backdrop-blur-sm outline-none ${
                      error
                        ? "border-danger/50 text-danger"
                        : "border-subtle text-high focus:border-action/50 focus:bg-surface-sunken/80"
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
                  <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 px-4 py-3">
                    <ShieldCheck size={18} className="text-success" />
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black tracking-wider text-success uppercase">
                        Konfiguration genkendt
                      </span>
                      <span className="font-mono text-[10px] text-medium italic">
                        Projektid: {parsedPreview.projectId}
                      </span>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="flex items-center gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3">
                    <AlertCircle size={18} className="text-danger" />
                    <p className="text-xs font-bold text-danger">{error}</p>
                  </div>
                )}

                <button
                  onClick={handleSave}
                  disabled={!parsedPreview || isValidating}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl py-4 text-sm font-bold ${
                    parsedPreview && !isValidating
                      ? "cursor-pointer bg-high text-inverted hover:bg-medium active:scale-[0.98]"
                      : "cursor-not-allowed bg-surface-elevated text-strong opacity-50"
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

        {/* Theming friendly background radial: Vi peger den på surface-sunken som er mørk i dark-mode og næsten hvid i light */}
        <div className="pointer-events-none fixed inset-0 z-10 bg-[radial-gradient(circle_at_top_left,var(--tw-bg-surface-elevated),transparent)] opacity-40" />
      </div>
    );
  }

  return <>{children}</>;
};
