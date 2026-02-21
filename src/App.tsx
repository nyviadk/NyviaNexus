import { Hammer, LayoutDashboard } from "lucide-react";

export default function App() {
  const openDashboard = () => {
    chrome.tabs.create({ url: "dashboard.html" });
  };

  return (
    <div className="flex h-96 w-80 flex-col items-center justify-center border border-subtle bg-background p-6 text-center text-medium">
      {/* Cirkel bag hammeren bruger nu surface-elevated for dybde */}
      <div className="mb-4 rounded-full border border-subtle bg-surface-elevated p-4 shadow-lg">
        <Hammer size={32} className="animate-pulse text-warning" />
      </div>

      <h1 className="mb-2 text-xl font-bold text-high">Under ombygning</h1>

      <p className="mb-8 text-sm leading-relaxed text-low">
        Popup-menuen er sat på pause og vil blive gentænkt i en fremtidig
        opdatering.
      </p>

      <button
        onClick={openDashboard}
        className="group flex cursor-pointer items-center gap-2 rounded-xl bg-action px-5 py-2.5 font-medium text-inverted shadow-lg transition-all hover:bg-action-hover hover:shadow-action/25 active:scale-95"
      >
        <LayoutDashboard
          size={18}
          className="transition-transform group-hover:scale-110"
        />
        Åbn dashboard
      </button>

      {/* Version-tag bruger low-contrast tekst */}
      <div className="mt-8 font-mono text-[10px] tracking-widest text-low/50 uppercase">
        NyviaNexus v0.1
      </div>
    </div>
  );
}
