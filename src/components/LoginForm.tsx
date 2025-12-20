import React, { useState } from "react";
import { auth } from "../lib/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";

export const LoginForm = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      alert("Login fejlede: " + error);
    }
  };

  return (
    <div className="p-6 w-80 flex flex-col gap-4 bg-slate-900 text-white h-[500px] justify-center shadow-2xl rounded-2xl border border-slate-800">
      <h1 className="text-2xl font-black text-blue-400 tracking-tighter">
        NyviaNexus
      </h1>
      <form onSubmit={handleLogin} className="flex flex-col gap-3">
        <input
          type="email"
          placeholder="Email"
          className="bg-slate-800 p-2 rounded border border-slate-700 outline-none focus:border-blue-500"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          className="bg-slate-800 p-2 rounded border border-slate-700 outline-none focus:border-blue-500"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="bg-blue-600 hover:bg-blue-500 p-2 rounded font-bold transition active:scale-95">
          Log ind
        </button>
      </form>
    </div>
  );
};
