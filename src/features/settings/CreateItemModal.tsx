import { useState, useCallback, useRef } from "react";
import { X, FolderPlus, Monitor, Loader2, ChevronRight } from "lucide-react";
import { NexusService } from "../dashboard/nexusService";

interface CreateItemModalProps {
  type: "folder" | "workspace";
  activeProfile: string;
  parentId: string;
  parentPath: string[];
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateItemModal = ({
  type,
  activeProfile,
  parentId,
  parentPath,
  onClose,
  onSuccess,
}: CreateItemModalProps) => {
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Callback ref: åbner dialogen og fokuserer input ved mount (erstatter useEffect + dialogRef)
  const initDialog = useCallback((node: HTMLDialogElement | null) => {
    if (node && !node.open) {
      node.showModal();
      // Native <dialog> stjæler fokus til det første fokuserbare element (krydset).
      // Vi tvinger fokus tilbage på input-feltet efter browseren har renderet dialogen.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, []);

  const handleClose = () => {
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = (formData.get("name") as string)?.trim();
    if (!name) return;

    setLoading(true);
    try {
      await NexusService.createItem({
        name,
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
      ref={initDialog}
      onCancel={handleClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      className="open:animate-in open:fade-in open:zoom-in-95 m-auto bg-transparent p-0 backdrop:bg-background/80 backdrop:backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-2xl border border-strong bg-surface-elevated p-6 shadow-2xl">
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
            {/* Opgraderet Breadcrumb visning */}
            <div className="mb-3 flex items-start gap-2 text-[11px] font-medium tracking-wider text-low">
              <span className="mt-1.5 shrink-0">Placeres i:</span>
              <div className="flex flex-1 flex-wrap items-center gap-1.5 rounded-lg border border-subtle bg-surface-sunken/50 px-2.5 py-1.5">
                {parentPath.map((segment, idx) => (
                  <div key={idx} className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={`max-w-37.5 truncate ${
                        idx === parentPath.length - 1
                          ? "font-bold text-high"
                          : "text-medium"
                      }`}
                      title={segment}
                    >
                      {segment}
                    </span>
                    {idx < parentPath.length - 1 && (
                      <ChevronRight size={12} className="shrink-0 text-low" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <input
              ref={inputRef}
              name="name"
              required
              autoFocus
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
              disabled={loading}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-action px-4 py-2.5 text-sm font-bold text-inverted shadow-lg shadow-action/20 ring-action-hover transition-all outline-none hover:bg-action-hover focus:ring-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
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
