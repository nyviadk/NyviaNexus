import React from "react";
import { LoginForm } from "./LoginForm";
import { ConfigReset } from "./ConfigReset";

/**
 * Den visuelle container for hele login-flowet.
 */

export const AuthLayout: React.FC = () => {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-950 p-4">
      <div className="flex w-full max-w-sm flex-col items-center">
        {/* Logo Sektion */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-black tracking-tighter text-blue-400">
            NyviaNexus
          </h1>
          <p className="text-sm font-medium text-slate-500">
            Organiser dine tabs i Chrome
          </p>
        </div>

        {/* Login Form Card */}
        <div className="w-full rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
          <LoginForm />
        </div>

        {/* Nødbremse / Reset */}
        <ConfigReset />
      </div>
    </div>
  );
};
