import { useState, useEffect, useRef } from "react";
import { X, FolderPlus, Monitor, Loader2 } from "lucide-react";
import { NexusService } from "../services/nexusService";

interface CreateItemModalProps {
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
}: CreateItemModalProps) => {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Åbn dialogen native når komponenten mounter
  useEffect(() => {
    if (dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal();
    }
  }, []);

  const handleClose = () => {
    // Luk animation eller lignende kunne være her
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      // Vi bruger NexusService her, da den håndterer:
      // 1. Den korrekte sti: users/{uid}/items
      // 2. Oprettelse af tilhørende windows-data, hvis det er et workspace (Batch write)
      await NexusService.createItem({
        name: name.trim(),
        type,
        profileId: activeProfile,
        parentId,
      });
      onSuccess();
    } catch (error) {
      console.error("Error creating item:", error);
      alert("Der skete en fejl under oprettelsen.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleClose} // Håndterer ESC tasten automatisk
      onClick={(e) => {
        // Luk hvis man klikker på backdrop (udenfor selve dialogen)
        if (e.target === dialogRef.current) handleClose();
      }}
      className="open:animate-in open:fade-in open:zoom-in-95 m-auto bg-transparent p-0 backdrop:bg-slate-900/80 backdrop:backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-600 bg-slate-800 p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3 text-white">
            <div
              className={`rounded-lg p-2 ${
                type === "folder"
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-blue-500/20 text-blue-400"
              }`}
            >
              {type === "folder" ? (
                <FolderPlus size={20} />
              ) : (
                <Monitor size={20} />
              )}
            </div>
            <h3 className="text-lg font-bold tracking-wide uppercase">
              Ny {type === "folder" ? "Mappe" : "Space"}
            </h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="cursor-pointer rounded-lg p-1 text-slate-400 ring-blue-500 transition-colors outline-none hover:bg-slate-700 hover:text-white focus:ring-2"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Navn på ${
                type === "folder" ? "mappe" : "space"
              }...`}
              className="w-full rounded-xl border border-slate-600 bg-slate-900/50 px-4 py-3 text-sm text-white placeholder-slate-500 ring-blue-500/50 transition-all outline-none focus:ring-2"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 cursor-pointer rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-300 ring-slate-500 transition-colors outline-none hover:bg-slate-700 hover:text-white focus:ring-2"
            >
              Annuller
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 ring-blue-400 transition-all outline-none hover:bg-blue-500 focus:ring-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              Opret
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
};
