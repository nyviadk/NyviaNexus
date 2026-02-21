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
      className="open:animate-in open:fade-in open:zoom-in-95 m-auto bg-transparent p-0 backdrop:bg-background/80 backdrop:backdrop-blur-sm"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-strong bg-surface-elevated p-6 shadow-2xl">
        <div className="pointer-events-none absolute top-0 right-0 p-4 opacity-10">
          <BrainCircuit size={120} className="text-info" />
        </div>

        <div className="relative z-10 mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-info/20 p-3 text-info">
              <Lightbulb size={24} />
            </div>
            <div>
              <h3 className="text-lg leading-tight font-bold text-high">
                AI Tankegang
              </h3>
              <p className="text-xs text-medium">
                Hvorfor blev denne kategori valgt?
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer text-low outline-none hover:text-high"
          >
            <X size={24} />
          </button>
        </div>

        <div className="relative z-10 rounded-xl border border-subtle bg-surface-sunken/50 p-4">
          <div className="text-sm leading-relaxed text-medium italic">
            "{data.reasoning}"
          </div>
        </div>

        <div className="relative z-10 mt-4 flex items-center justify-between">
          <div className="text-xs text-low">
            Sikkerhed:{" "}
            <span
              className={
                (data.confidence || 0) > 80 ? "text-success" : "text-warning"
              }
            >
              {data.confidence}%
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-subtle bg-surface-hover px-3 py-1 text-xs font-bold text-high">
            {data.category}
            {data.isLocked && <Lock size={10} className="text-low" />}
          </div>
        </div>
      </div>
    </dialog>
  );
};
