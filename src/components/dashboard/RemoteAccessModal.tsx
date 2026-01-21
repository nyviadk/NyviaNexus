import { Share2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { RemoteAccessSettings } from "./RemoteAccessSettings";

interface RemoteAccessModalProps {
  onClose: () => void;
}

export const RemoteAccessModal = ({ onClose }: RemoteAccessModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal();
    }
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      onClick={(e) => e.target === dialogRef.current && onClose()}
      className="open:animate-in open:fade-in open:zoom-in-95 m-auto bg-transparent p-0 backdrop:bg-slate-900/80 backdrop:backdrop-blur-sm"
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-600 bg-slate-800 shadow-2xl">
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800/80 p-6 pb-4">
          <h3 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white uppercase">
            <Share2 className="text-purple-400" /> Deling & Sync
          </h3>
          <button
            onClick={onClose}
            className="cursor-pointer rounded text-slate-400 ring-blue-500 outline-none hover:text-white focus:ring-2"
          >
            <X size={24} />
          </button>
        </div>

        {/* CONTENT AREA */}
        <div className="overflow-y-auto p-8">
          <RemoteAccessSettings />
        </div>
      </div>
    </dialog>
  );
};
