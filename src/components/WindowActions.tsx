import React, { useState } from "react";
import { Copy, ClipboardPaste, Check, MonitorX } from "lucide-react";
import { LinkManager } from "../services/linkManager";
import { TabData } from "@/types";

interface WindowActionsProps {
  tabs: TabData[]; // Bruger TabData fra types/interfaces
  isWindowOpen: boolean; // Den værdi har du allerede i dashboardet (activeMappings checket)
  onOpenPasteModal: () => void;
}

export const WindowActions = ({
  tabs,
  isWindowOpen,
  onOpenPasteModal,
}: WindowActionsProps) => {
  const [hasCopied, setHasCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const count = await LinkManager.copyTabsToClipboard(tabs);
    if (count > 0) {
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    }
  };

  const handlePasteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isWindowOpen) return; // Sikkerhedsventil, selvom knappen er disabled
    onOpenPasteModal();
  };

  return (
    <div className="flex items-center gap-1 rounded-lg border border-slate-700/50 bg-slate-900/50 p-0.5">
      {/* COPY BUTTON */}
      <button
        onClick={handleCopy}
        title="Kopier alle links til udklipsholder"
        className="group relative rounded-md p-1.5 text-slate-400 transition hover:bg-slate-700 hover:text-blue-400"
      >
        {hasCopied ? (
          <Check size={14} className="text-green-500" />
        ) : (
          <Copy size={14} />
        )}
      </button>

      <div className="mx-0.5 h-3 w-px bg-slate-700"></div>

      {/* PASTE BUTTON */}
      <div className="group/paste relative">
        <button
          onClick={handlePasteClick}
          disabled={isWindowOpen}
          className={`rounded-md p-1.5 transition ${
            isWindowOpen
              ? "cursor-not-allowed bg-slate-800/50 text-slate-600"
              : "text-slate-400 hover:bg-slate-700 hover:text-purple-400"
          }`}
        >
          <ClipboardPaste size={14} />
        </button>

        {/* Tooltip for disabled state */}
        {isWindowOpen && (
          <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] whitespace-nowrap text-slate-300 opacity-0 shadow-xl transition group-hover/paste:opacity-100">
            <div className="flex items-center gap-1.5">
              <MonitorX size={10} className="text-red-400" />
              Luk vinduet for at indsætte
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
