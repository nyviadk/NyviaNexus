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
import { Loader2, ArrowRight } from "lucide-react";

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
      <h2 className="text-sm font-bold tracking-widest text-slate-500 uppercase">
        {isNewUser ? "Opret Ny Konto" : "Log Ind På Nexus"}
      </h2>

      {error && (
        <div className="rounded border border-red-500/20 bg-red-500/10 p-2 text-[10px] text-red-400">
          {error}
        </div>
      )}

      <input
        type="email"
        placeholder="Email"
        className="rounded-lg border border-slate-700 bg-slate-800 p-3 text-sm text-white transition-all outline-none focus:border-blue-500"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        type="password"
        placeholder="Password"
        className="rounded-lg border border-slate-700 bg-slate-800 p-3 text-sm text-white transition-all outline-none focus:border-blue-500"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />

      <button
        disabled={loading}
        className="group mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 p-3 font-bold text-white transition hover:bg-blue-500 active:scale-95 disabled:opacity-50"
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
        className="mt-4 cursor-pointer text-center text-xs text-slate-400 transition-colors hover:text-white"
      >
        {isNewUser
          ? "Har du en konto? Log ind"
          : "Ny bruger? Opret en konto her"}
      </button>
    </form>
  );
};
