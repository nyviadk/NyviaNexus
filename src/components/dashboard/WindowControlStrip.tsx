import React, { useState } from "react";
import { ExternalLink, PlusCircle, Trash2, Loader2 } from "lucide-react";
import { NexusItem, WorkspaceWindow } from "../../types";
import { DraggedTabPayload } from "../../dashboard/types";

interface WindowControlStripProps {
  sortedWindows: WorkspaceWindow[];
  selectedWindowId: string | null;
  setSelectedWindowId: (id: string | null) => void;
  dropTargetWinId: string | null;
  setDropTargetWinId: (id: string | null) => void;
  handleTabDrop: (winId: string) => void;
  selectedWorkspace: NexusItem | null;
}

export const WindowControlStrip: React.FC<WindowControlStripProps> = ({
  sortedWindows,
  selectedWindowId,
  setSelectedWindowId,
  dropTargetWinId,
  setDropTargetWinId,
  handleTabDrop,
  selectedWorkspace,
}) => {
  const [isPlusOver, setIsPlusOver] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateNewWindow = (initialTab?: DraggedTabPayload) => {
    if (!selectedWorkspace) return;

    setIsCreating(true);
    chrome.runtime.sendMessage(
      {
        type: "CREATE_NEW_WINDOW_IN_WORKSPACE",
        payload: {
          workspaceId: selectedWorkspace.id,
          name: selectedWorkspace.name,
          initialTab: initialTab || null,
        },
      },
      () => {
        setIsCreating(false);
      },
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-4">
      {sortedWindows.map((win, idx) => {
        const isDropTarget = dropTargetWinId === win.id;
        const isSourceWindow = selectedWindowId === win.id;

        let borderClass = "border-slate-700 hover:border-slate-500";
        let bgClass = "bg-slate-800";
        let shadowClass = "";

        // Din logik for styling prioritet genindført:
        if (isDropTarget) {
          if (isSourceWindow) {
            // RØD: Forsøger at droppe i samme vindue (Invalid)
            bgClass = "bg-red-900/20";
            borderClass = "border-red-500/50";
          } else {
            // GRØN: Validt drop target
            bgClass = "bg-emerald-900/20";
            borderClass = "border-emerald-500/50 border-dashed scale-[1.02]";
            shadowClass = "shadow-lg shadow-emerald-900/20";
          }
        } else if (isSourceWindow) {
          // BLÅ: Det aktive vindue
          bgClass = "bg-blue-600/10";
          borderClass = "border-blue-500/50";
          shadowClass = "shadow-lg";
        }

        return (
          <div
            key={win.id}
            className="flex flex-col items-center gap-1 transition-all duration-200"
            onDragOver={(e) => {
              e.preventDefault();
              if (dropTargetWinId !== win.id) {
                setDropTargetWinId(win.id);
              }
            }}
            onDragLeave={(e) => {
              // Flicker-fix genindført
              const currentTarget = e.currentTarget;
              const relatedTarget = e.relatedTarget as Node;
              if (currentTarget.contains(relatedTarget)) {
                return;
              }
              setDropTargetWinId(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDropTargetWinId(null);
              handleTabDrop(win.id);
            }}
          >
            <div
              onClick={() =>
                setSelectedWindowId(selectedWindowId === win.id ? null : win.id)
              }
              className={`group relative flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-all ${bgClass} ${borderClass} ${shadowClass}`}
            >
              <div className="pointer-events-none flex flex-col">
                <span
                  className={`text-xs font-bold ${
                    isDropTarget && !isSourceWindow
                      ? "text-emerald-400"
                      : "text-slate-300"
                  }`}
                >
                  Vindue {idx + 1}
                </span>
                <span className="mt-1 text-[10px] text-slate-500">
                  {win.tabs?.length || 0} tabs
                </span>
              </div>

              {/* Handlingsknapper genindført */}
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    chrome.runtime.sendMessage({
                      type: "OPEN_SPECIFIC_WINDOW",
                      payload: {
                        workspaceId: selectedWorkspace?.id,
                        windowData: win,
                        name: selectedWorkspace?.name,
                        index: idx + 1,
                      },
                    });
                  }}
                  className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-blue-500/20 hover:text-blue-400"
                  title="Åbn dette vindue"
                >
                  <ExternalLink size={18} />
                </button>

                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (confirm("Slet vindue?"))
                      chrome.runtime.sendMessage({
                        type: "DELETE_AND_CLOSE_WINDOW",
                        payload: {
                          workspaceId: selectedWorkspace?.id,
                          internalWindowId: win.id,
                        },
                      });
                  }}
                  className="cursor-pointer rounded-lg p-1.5 text-slate-400 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-400"
                  title="Slet vindue"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Forbedret Plus-knap med drop-to-create og loading state */}
      <button
        onDragOver={(e) => {
          e.preventDefault();
          setIsPlusOver(true);
        }}
        onDragLeave={() => setIsPlusOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsPlusOver(false);
          const tJ = window.sessionStorage.getItem("draggedTab");
          if (tJ) {
            try {
              handleCreateNewWindow(JSON.parse(tJ));
            } catch (err) {
              console.error("JSON Parse error in drop:", err);
              handleCreateNewWindow();
            }
          } else {
            handleCreateNewWindow();
          }
        }}
        onClick={() => handleCreateNewWindow()}
        disabled={isCreating}
        className={`flex h-14 w-14 items-center justify-center rounded-xl border border-dashed transition-all duration-200 ${
          isPlusOver
            ? "scale-110 border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-xl shadow-emerald-900/20"
            : "border-slate-700 text-slate-500 hover:border-blue-500 hover:text-blue-400"
        } ${
          isCreating
            ? "cursor-wait opacity-50"
            : "cursor-pointer active:scale-95"
        }`}
        title="Tilføj nyt vindue (eller træk en fane herhen)"
      >
        {isCreating ? (
          <Loader2 size={28} className="animate-spin text-blue-400" />
        ) : (
          <PlusCircle size={28} className={isPlusOver ? "animate-pulse" : ""} />
        )}
      </button>
    </div>
  );
};
