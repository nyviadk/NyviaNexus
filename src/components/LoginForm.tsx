import React, { useState } from "react";
import { auth, db } from "../lib/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  getDocs,
  addDoc,
} from "firebase/firestore";
import { Loader2 } from "lucide-react";

export const LoginForm = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );
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
    } catch (error) {
      alert("Login fejlede: " + error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-125 w-80 flex-col justify-center gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-white shadow-2xl">
      <h1 className="text-2xl font-black tracking-tighter text-blue-400">
        NyviaNexus
      </h1>
      <form onSubmit={handleLogin} className="flex flex-col gap-3">
        <input
          type="email"
          placeholder="Email"
          className="rounded border border-slate-700 bg-slate-800 p-2 outline-none focus:border-blue-500"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          className="rounded border border-slate-700 bg-slate-800 p-2 outline-none focus:border-blue-500"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          disabled={loading}
          className="flex justify-center rounded bg-blue-600 p-2 font-bold transition hover:bg-blue-500 active:scale-95 disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" size={20} /> : "Log ind"}
        </button>
      </form>
    </div>
  );
};
