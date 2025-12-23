import { useState, useEffect, useRef } from "react";
import { X, FolderPlus, Monitor, Loader2 } from "lucide-react";
import { addDoc, collection } from "firebase/firestore";
import { db } from "../lib/firebase";

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
      await addDoc(collection(db, "items"), {
        name: name.trim(),
        type,
        profileId: activeProfile,
        parentId,
        createdAt: Date.now(),
      });
      onSuccess();
    } catch (error) {
      console.error("Error creating item:", error);
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
      className="bg-transparent p-0 backdrop:bg-slate-900/80 backdrop:backdrop-blur-sm open:animate-in open:fade-in open:zoom-in-95 m-auto"
    >
      <div className="bg-slate-800 border border-slate-600 w-full max-w-sm rounded-2xl p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3 text-white">
            <div
              className={`p-2 rounded-lg ${
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
            <h3 className="text-lg font-bold uppercase tracking-wide">
              Ny {type === "folder" ? "Mappe" : "Space"}
            </h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-slate-400 hover:text-white transition-colors p-1 hover:bg-slate-700 rounded-lg outline-none focus:ring-2 ring-blue-500"
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
              className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 ring-blue-500/50 text-white placeholder-slate-500 transition-all"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white text-sm font-medium transition-colors outline-none focus:ring-2 ring-slate-500"
            >
              Annuller
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 transition-all active:scale-95 flex items-center justify-center gap-2 outline-none focus:ring-2 ring-blue-400"
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
