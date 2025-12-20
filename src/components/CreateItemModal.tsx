import { useState } from "react";
import { X } from "lucide-react";
import { NexusService } from "../services/nexusService";

interface Props {
  type: "folder" | "workspace";
  activeProfile: string;
  parentId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateItemModal = ({
  type,
  activeProfile,
  parentId,
  onClose,
  onSuccess,
}: Props) => {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name) return;
    setLoading(true);
    try {
      await NexusService.createItem({
        name,
        type,
        parentId,
        profileId: activeProfile,
      });
      onSuccess();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm text-slate-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-xl p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold">
            Opret {type === "folder" ? "Mappe" : "Workspace"}
          </h3>
          <X className="cursor-pointer hover:text-white" onClick={onClose} />
        </div>
        <div className="space-y-4">
          <input
            autoFocus
            className="w-full bg-slate-800 border border-slate-700 rounded p-2 outline-none focus:border-blue-500"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Navn..."
          />
          <button
            disabled={loading || !name}
            onClick={handleCreate}
            className="w-full bg-blue-600 hover:bg-blue-500 p-2 rounded-lg font-bold transition"
          >
            {loading ? "Opretter..." : "Bekræft"}
          </button>
        </div>
      </div>
    </div>
  );
};
