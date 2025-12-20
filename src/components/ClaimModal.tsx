import { useState } from "react";
import { X } from "lucide-react";
import { NexusItem } from "../types";
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
    if (!name) return;
    setLoading(true);
    try {
      const workspaceId = `ws_${Date.now()}`;
      const internalWindowId = `win_${Date.now()}`;
      const tabs = await chrome.tabs.query({ windowId });

      await NexusService.createWorkspace({
        id: workspaceId,
        name: name,
        parentId: parentId,
        profileId: activeProfile,
        internalWindowId: internalWindowId,
        tabs: tabs.map((t) => ({
          title: t.title || "Tab",
          url: t.url || "",
          favIconUrl: t.favIconUrl || "",
        })),
      });

      chrome.runtime.sendMessage(
        {
          type: "CLAIM_WINDOW",
          payload: {
            windowId: windowId,
            workspaceId: workspaceId,
            internalWindowId: internalWindowId,
          },
        },
        () => {
          setLoading(false);
          onSuccess();
          onClose();
        }
      );
    } catch (e) {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm text-slate-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-xl p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold">Claim Window</h3>
          <X className="cursor-pointer hover:text-white" onClick={onClose} />
        </div>
        <div className="space-y-4">
          <input
            autoFocus
            className="w-full bg-slate-800 border border-slate-700 rounded p-2 outline-none focus:border-blue-500"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Space navn..."
          />
          <select
            className="w-full bg-slate-800 border border-slate-700 rounded p-2 outline-none"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="root">Ingen mappe (Rod)</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <button
            disabled={loading || !name}
            onClick={handleClaim}
            className="w-full bg-blue-600 hover:bg-blue-500 p-2 rounded-lg font-bold transition"
          >
            {loading ? "Gemmer..." : "Gem Workspace"}
          </button>
        </div>
      </div>
    </div>
  );
};
