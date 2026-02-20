import React, { useState } from "react";
import { auth, db } from "../../lib/firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
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

/**
 * NyviaNexus - LoginForm
 * Håndterer både login og initialisering af brugerdata (Bootstrapping).
 */

export const LoginForm: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      let userCredential;

      if (isNewUser) {
        userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
      } else {
        userCredential = await signInWithEmailAndPassword(
          auth,
          email,
          password,
        );
      }

      const uid = userCredential.user.uid;

      // --- BOOTSTRAP CHECK ---
      // Tjek om inbox_data/global findes for denne bruger.
      // Hvis ikke, opret den, så Extensionen har et sted at gemme tabs.
      const inboxRef = doc(db, "users", uid, "inbox_data", "global");
      const inboxSnap = await getDoc(inboxRef);

      if (!inboxSnap.exists()) {
        console.log("Creating initial Inbox for user...");
        await setDoc(inboxRef, {
          tabs: [],
          lastUpdate: serverTimestamp(),
        });
      }

      // 2. Tjek og opret en Profil hvis brugeren ingen har
      const profilesCollection = collection(db, "users", uid, "profiles");
      const profilesSnap = await getDocs(profilesCollection);

      if (profilesSnap.empty) {
        console.log("Creating default Profile for user...");
        // Her bruger vi addDoc, så Firestore genererer et unikt ID (f.eks. "7f8g9d...")
        // præcis som når man opretter profiler i indstillingerne.
        await addDoc(profilesCollection, {
          name: "Privat",
        });
      }
    } catch (error: any) {
      alert("Autentificering fejlede: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleAuth} className="flex flex-col gap-3">
      <h2 className="text-sm font-bold tracking-widest text-slate-500 uppercase">
        {isNewUser ? "Opret Ny Konto" : "Log Ind På Nexus"}
      </h2>

      <input
        type="email"
        placeholder="Email"
        className="rounded-lg border border-slate-700 bg-slate-800 p-3 text-sm transition outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        type="password"
        placeholder="Password"
        className="rounded-lg border border-slate-700 bg-slate-800 p-3 text-sm transition outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />

      <button
        disabled={loading}
        className="group flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 p-3 font-bold transition hover:bg-blue-500 active:scale-95 disabled:opacity-50"
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
        className="mt-2 cursor-pointer text-xs text-slate-400 hover:text-white"
      >
        {isNewUser
          ? "Har du allerede en konto? Log ind her"
          : "Ny bruger? Opret en konto her"}
      </button>
    </form>
  );
};
