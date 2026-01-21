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
      className="open:animate-in open:fade-in open:zoom-in-95 m-auto bg-transparent p-0 backdrop:bg-slate-900/80 backdrop:backdrop-blur-sm"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-600 bg-slate-800 p-6 shadow-2xl">
        <div className="pointer-events-none absolute top-0 right-0 p-4 opacity-10">
          <BrainCircuit size={120} className="text-blue-500" />
        </div>

        <div className="relative z-10 mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-600/20 p-3 text-blue-400">
              <Lightbulb size={24} />
            </div>
            <div>
              <h3 className="text-lg leading-tight font-bold text-white">
                AI Tankegang
              </h3>
              <p className="text-xs text-slate-400">
                Hvorfor blev denne kategori valgt?
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer text-slate-400 outline-none hover:text-white"
          >
            <X size={24} />
          </button>
        </div>

        <div className="relative z-10 rounded-xl border border-slate-700 bg-slate-900/50 p-4">
          <div className="text-sm leading-relaxed text-slate-300 italic">
            "{data.reasoning}"
          </div>
        </div>

        <div className="relative z-10 mt-4 flex items-center justify-between">
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
          <div className="flex items-center gap-2 rounded-full border border-slate-600 bg-slate-700 px-3 py-1 text-xs font-bold text-white">
            {data.category}
            {data.isLocked && <Lock size={10} className="text-slate-400" />}
          </div>
        </div>
      </div>
    </dialog>
  );
};
