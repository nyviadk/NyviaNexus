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
    <div className="flex items-center gap-1 bg-slate-900/50 rounded-lg p-0.5 border border-slate-700/50">
      {/* COPY BUTTON */}
      <button
        onClick={handleCopy}
        title="Kopier alle links til udklipsholder"
        className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-blue-400 transition group relative"
      >
        {hasCopied ? (
          <Check size={14} className="text-green-500" />
        ) : (
          <Copy size={14} />
        )}
      </button>

      <div className="w-px h-3 bg-slate-700 mx-0.5"></div>

      {/* PASTE BUTTON */}
      <div className="relative group/paste">
        <button
          onClick={handlePasteClick}
          disabled={isWindowOpen}
          className={`p-1.5 rounded-md transition ${
            isWindowOpen
              ? "text-slate-600 cursor-not-allowed bg-slate-800/50"
              : "text-slate-400 hover:text-purple-400 hover:bg-slate-700"
          }`}
        >
          <ClipboardPaste size={14} />
        </button>

        {/* Tooltip for disabled state */}
        {isWindowOpen && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 border border-slate-700 text-[10px] text-slate-300 rounded whitespace-nowrap opacity-0 group-hover/paste:opacity-100 pointer-events-none transition z-50 shadow-xl">
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
