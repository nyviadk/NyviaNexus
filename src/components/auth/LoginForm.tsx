import React, { useState } from "react";
import { auth, db } from "../../lib/firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  getDocs,
  addDoc,
} from "firebase/firestore";
import { Loader2, ArrowRight, ExternalLink, Sparkles } from "lucide-react";
import { AiService } from "../../services/aiService";

interface LoginFormProps {
  onUserCreated: (uid: string) => void;
}

/**
 * LoginForm
 * Håndterer logik for både eksisterende og nye brugere.
 */
export const LoginForm: React.FC<LoginFormProps> = ({ onUserCreated }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cerebrasKey, setCerebrasKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let userCredential;

      if (isNewUser) {
        sessionStorage.setItem("nexus_setup_mode", "true");
        userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
      } else {
        sessionStorage.removeItem("nexus_setup_mode");
        userCredential = await signInWithEmailAndPassword(
          auth,
          email,
          password,
        );
      }

      const uid = userCredential.user.uid;

      // Gem Cerebras API nøgle hvis den er indtastet (Valgfrit)
      if (cerebrasKey.trim()) {
        await AiService.saveApiKey(cerebrasKey.trim());
      }

      // Bootstrap Inbox
      const inboxRef = doc(db, "users", uid, "inbox_data", "global");
      const inboxSnap = await getDoc(inboxRef);
      if (!inboxSnap.exists()) {
        await setDoc(inboxRef, {
          tabs: [],
          lastUpdate: serverTimestamp(),
        });
      }

      // Bootstrap Profiler
      const profilesCollection = collection(db, "users", uid, "profiles");
      const profilesSnap = await getDocs(profilesCollection);
      if (profilesSnap.empty) {
        await addDoc(profilesCollection, {
          name: "Privat",
          createdAt: serverTimestamp(),
        });
      }

      if (isNewUser) {
        onUserCreated(uid);
      }
    } catch (err) {
      sessionStorage.removeItem("nexus_setup_mode");
      if (err instanceof FirebaseError) {
        setError(err.message);
      } else {
        setError("Der opstod en uventet fejl.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleAuth} className="flex flex-col gap-3">
      <h2 className="text-sm font-bold tracking-widest text-low uppercase">
        {isNewUser ? "Opret Ny Konto" : "Log Ind På Nexus"}
      </h2>

      {error && (
        <div className="rounded border border-danger/20 bg-danger/10 p-2 text-[10px] text-danger">
          {error}
        </div>
      )}

      <input
        type="email"
        placeholder="Email"
        className="rounded-lg border border-subtle bg-surface-sunken p-3 text-sm text-high transition-all outline-none focus:border-action focus:ring-1 focus:ring-action"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        type="password"
        placeholder="Password"
        className="rounded-lg border border-subtle bg-surface-sunken p-3 text-sm text-high transition-all outline-none focus:border-action focus:ring-1 focus:ring-action"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />

      <div className="mt-2 space-y-2">
        <div className="flex items-center justify-between px-1">
          <label className="flex items-center gap-1.5 text-[10px] font-bold text-medium uppercase">
            <Sparkles size={12} className="text-action" /> Cerebras API Key
            (Valgfri)
          </label>
          <a
            href="https://www.cerebras.ai/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-action hover:underline"
          >
            Hent nøgle <ExternalLink size={10} />
          </a>
        </div>
        <input
          type="password"
          placeholder="csk-..."
          className="w-full rounded-lg border border-subtle bg-surface-sunken/50 p-3 text-sm text-high transition-all outline-none focus:border-action focus:ring-1 focus:ring-action"
          value={cerebrasKey}
          onChange={(e) => setCerebrasKey(e.target.value)}
        />
        <p className="px-1 text-[10px] text-low">
          Vælg model:{" "}
          <span className="font-mono text-medium italic">"llama3.1-8b"</span>
        </p>
      </div>

      <button
        disabled={loading}
        className="group hover:bg-action-hover mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-action p-3 font-bold text-inverted transition active:scale-95 disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="animate-spin" size={20} />
        ) : (
          <>
            {isNewUser ? "Opret konto" : "Log ind"}
            <ArrowRight
              size={18}
              className="transition-transform group-hover:translate-x-1"
            />
          </>
        )}
      </button>

      <button
        type="button"
        onClick={() => setIsNewUser(!isNewUser)}
        className="mt-4 cursor-pointer text-center text-xs text-low transition-colors hover:text-high"
      >
        {isNewUser
          ? "Har du en konto? Log ind"
          : "Ny bruger? Opret en konto her"}
      </button>
    </form>
  );
};
