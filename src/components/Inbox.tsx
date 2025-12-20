import { useEffect, useState } from "react";
import { Inbox as InboxIcon } from "lucide-react";
import { ClaimModal } from "./ClaimModal";
import { NexusItem } from "../types";

interface Props {
  activeProfile: string;
  items: NexusItem[];
  onRefresh: () => void;
}

export const Inbox = ({ activeProfile, items, onRefresh }: Props) => {
  const [unassignedWindows, setUnassignedWindows] = useState<any[]>([]);
  const [selectedWindowId, setSelectedWindowId] = useState<number | null>(null);

  const checkUnsaved = () => {
    chrome.runtime.sendMessage({ type: "GET_ACTIVE_MAPPINGS" }, (response) => {
      chrome.windows.getAll({ populate: true }, (windows) => {
        const activeIds = new Set(response?.map((r: any) => r[0]));
        // Filtrer vinduer der ikke er i mappings og som ikke er inkognito (gemmes manuelt)
        const unsaved = windows.filter(
          (w) => !activeIds.has(w.id) && w.type === "normal" && !w.incognito
        );
        setUnassignedWindows(unsaved);
      });
    });
  };

  useEffect(() => {
    checkUnsaved();
    const interval = setInterval(checkUnsaved, 5000);
    return () => clearInterval(interval);
  }, []);

  if (unassignedWindows.length === 0) return null;

  return (
    <section className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
      <h2 className="text-xs font-bold uppercase text-orange-400 mb-3 flex items-center gap-2">
        <InboxIcon size={14} /> Inbox (Unsaved)
      </h2>
      <div className="space-y-2">
        {unassignedWindows.map((win) => (
          <div
            key={win.id}
            className="text-xs bg-slate-800 p-2 rounded flex justify-between items-center group"
          >
            <span className="truncate">
              Vindue {win.id} ({win.tabs?.length} tabs)
            </span>
            <button
              onClick={() => setSelectedWindowId(win.id)}
              className="bg-orange-600/20 text-orange-400 px-2 py-1 rounded hover:bg-orange-600 hover:text-white transition"
            >
              Claim
            </button>
          </div>
        ))}
      </div>
      {selectedWindowId && (
        <ClaimModal
          windowId={selectedWindowId}
          activeProfile={activeProfile}
          folders={items.filter((i) => i.type === "folder")}
          onClose={() => setSelectedWindowId(null)}
          onSuccess={onRefresh}
        />
      )}
    </section>
  );
};
