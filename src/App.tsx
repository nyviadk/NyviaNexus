import { Hammer, LayoutDashboard } from "lucide-react";

export default function App() {
  const openDashboard = () => {
    chrome.tabs.create({ url: "dashboard.html" });
  };

  return (
    <div className="flex h-96 w-80 flex-col items-center justify-center border border-slate-800 bg-slate-950 p-6 text-center text-slate-200">
      <div className="mb-4 rounded-full border border-slate-800 bg-slate-900 p-4 shadow-lg">
        <Hammer size={32} className="animate-pulse text-orange-400" />
      </div>

      <h1 className="mb-2 text-xl font-bold text-white">Under Ombygning</h1>

      <p className="mb-8 text-sm leading-relaxed text-slate-400">
        Popup-menuen er sat på pause og vil blive gentænkt i en fremtidig
        opdatering.
      </p>

      <button
        onClick={openDashboard}
        className="group flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-medium text-white shadow-lg transition-all hover:bg-blue-500 hover:shadow-blue-500/25 active:scale-95"
      >
        <LayoutDashboard
          size={18}
          className="transition-transform group-hover:scale-110"
        />
        Åbn Dashboard
      </button>

      <div className="mt-8 font-mono text-[10px] tracking-widest text-slate-600 uppercase">
        NyviaNexus v0.1
      </div>
    </div>
  );
}
