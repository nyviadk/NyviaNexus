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
      className="open:animate-in open:fade-in open:zoom-in-95 m-auto bg-transparent p-0 backdrop:bg-background/80 backdrop:backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-2xl border border-strong bg-surface-elevated p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3 text-high">
            <div
              className={`rounded-lg p-2 ${
                type === "folder"
                  ? "bg-warning/20 text-warning"
                  : "bg-mode-workspace/20 text-mode-workspace"
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
            className="cursor-pointer rounded-lg p-1 text-low ring-action transition-colors outline-none hover:bg-surface-hover hover:text-high focus:ring-2"
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
              className="w-full rounded-xl border border-subtle bg-surface-sunken px-4 py-3 text-sm text-high placeholder-low ring-action/50 transition-all outline-none focus:border-action focus:ring-2"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 cursor-pointer rounded-xl border border-subtle bg-surface px-4 py-2.5 text-sm font-medium text-medium ring-strong transition-colors outline-none hover:bg-surface-hover hover:text-high focus:ring-2"
            >
              Annuller
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="ring-action-hover hover:bg-action-hover flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-action px-4 py-2.5 text-sm font-bold text-inverted shadow-lg shadow-action/20 transition-all outline-none focus:ring-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
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
