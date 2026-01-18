import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { NexusItem, TabData } from "../types";
import { NexusService } from "../services/nexusService";

interface Props {
  windowId: number;
  activeProfile: string;
  folders: NexusItem[];
  onClose: () => void;
  onSuccess: () => void;
}

export const ClaimModal = ({
  windowId,
  activeProfile,
  folders,
  onClose,
  onSuccess,
}: Props) => {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("root");
  const [loading, setLoading] = useState(false);

  const handleClaim = async () => {
    if (!name.trim()) return;
    setLoading(true);

    try {
      // Vi bruger crypto.randomUUID() for konsistens med resten af systemet
      const workspaceId = crypto.randomUUID();
      const internalWindowId = `win_${crypto.randomUUID()}`; // Prefix for tydelighed

      const tabs = await chrome.tabs.query({ windowId });

      // Map Chrome tabs til vores strikse TabData type
      const mappedTabs: TabData[] = tabs
        .filter((t) => t.url && !t.url.startsWith("chrome://")) // Filtrer system-sider fra
        .map((t) => ({
          uid: crypto.randomUUID(), // VIGTIGT: Generer unikt ID til hver fane
          title: t.title || "Ny fane",
          url: t.url || "",
          favIconUrl: t.favIconUrl || "",
          isIncognito: t.incognito,
          aiData: { status: "pending" }, // Sæt status til pending så AI samler dem op
        }));

      await NexusService.createWorkspace({
        id: workspaceId,
        name: name.trim(),
        parentId: parentId,
        profileId: activeProfile,
        internalWindowId: internalWindowId,
        tabs: mappedTabs,
      });

      // Fortæl background script at dette fysiske vindue nu tilhører det nye workspace
      chrome.runtime.sendMessage(
        {
          type: "CLAIM_WINDOW",
          payload: {
            windowId: windowId,
            workspaceId: workspaceId,
            internalWindowId: internalWindowId,
            name: name.trim(),
          },
        },
        () => {
          setLoading(false);
          onSuccess();
          onClose();
        }
      );
    } catch (e) {
      console.error("Fejl ved claim window:", e);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm text-slate-200 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-2xl p-6 shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-bold text-white">Gem som Space</h3>
            <p className="text-xs text-slate-400">
              Konverter dette vindue til et workspace
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition rounded-lg p-1 hover:bg-slate-800"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
              Navn
            </label>
            <input
              autoFocus
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 outline-none focus:ring-2 ring-blue-500/50 text-white placeholder:text-slate-600 transition-all"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="F.eks. Projekt X..."
              onKeyDown={(e) => e.key === "Enter" && handleClaim()}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
              Placering
            </label>
            <div className="relative">
              <select
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 outline-none appearance-none focus:ring-2 ring-blue-500/50 text-sm cursor-pointer"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="root">Ingen mappe (Rod)</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    📁 {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            disabled={loading || !name.trim()}
            onClick={handleClaim}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed p-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Gemmer...
              </>
            ) : (
              "Opret Workspace"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
