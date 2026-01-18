import { BrainCircuit, Lightbulb, Lock, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { ReasoningModalProps } from "../../dashboard/types";

export const ReasoningModal = ({ data, onClose }: ReasoningModalProps) => {
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
      className="bg-transparent p-0 backdrop:bg-slate-900/80 backdrop:backdrop-blur-sm open:animate-in open:fade-in open:zoom-in-95 m-auto"
    >
      <div className="bg-slate-800 border border-slate-600 w-full max-w-md rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
          <BrainCircuit size={120} className="text-blue-500" />
        </div>

        <div className="flex justify-between items-start mb-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600/20 rounded-xl text-blue-400">
              <Lightbulb size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white leading-tight">
                AI Tankegang
              </h3>
              <p className="text-xs text-slate-400">
                Hvorfor blev denne kategori valgt?
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white outline-none cursor-pointer"
          >
            <X size={24} />
          </button>
        </div>

        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700 relative z-10">
          <div className="text-sm text-slate-300 italic leading-relaxed">
            "{data.reasoning}"
          </div>
        </div>

        <div className="mt-4 flex justify-between items-center relative z-10">
          <div className="text-xs text-slate-500">
            Sikkerhed:{" "}
            <span
              className={
                (data.confidence || 0) > 80
                  ? "text-green-400"
                  : "text-yellow-400"
              }
            >
              {data.confidence}%
            </span>
          </div>
          <div className="px-3 py-1 rounded-full bg-slate-700 text-xs font-bold text-white border border-slate-600 flex items-center gap-2">
            {data.category}
            {data.isLocked && <Lock size={10} className="text-slate-400" />}
          </div>
        </div>
      </div>
    </dialog>
  );
};
