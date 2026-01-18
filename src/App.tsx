import { Hammer, LayoutDashboard } from "lucide-react";

export default function App() {
  const openDashboard = () => {
    chrome.tabs.create({ url: "dashboard.html" });
  };

  return (
    <div className="w-80 h-96 bg-slate-950 text-slate-200 flex flex-col items-center justify-center p-6 text-center border border-slate-800">
      <div className="bg-slate-900 p-4 rounded-full mb-4 shadow-lg border border-slate-800">
        <Hammer size={32} className="text-orange-400 animate-pulse" />
      </div>

      <h1 className="text-xl font-bold text-white mb-2">Under Ombygning</h1>

      <p className="text-sm text-slate-400 mb-8 leading-relaxed">
        Popup-menuen er sat på pause og vil blive gentænkt i en fremtidig
        opdatering.
      </p>

      <button
        onClick={openDashboard}
        className="group flex items-center gap-2 cursor-pointer bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-medium transition-all shadow-lg hover:shadow-blue-500/25 active:scale-95"
      >
        <LayoutDashboard
          size={18}
          className="group-hover:scale-110 transition-transform"
        />
        Åbn Dashboard
      </button>

      <div className="mt-8 text-[10px] text-slate-600 font-mono uppercase tracking-widest">
        NyviaNexus v0.1
      </div>
    </div>
  );
}
