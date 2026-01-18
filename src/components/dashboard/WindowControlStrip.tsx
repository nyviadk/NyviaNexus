import React from "react";
import { ExternalLink, PlusCircle, Trash2 } from "lucide-react";
import { NexusItem, WorkspaceWindow } from "../../types";

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
  return (
    <div className="flex gap-4 items-center flex-wrap">
      {sortedWindows.map((win, idx) => {
        const isDropTarget = dropTargetWinId === win.id;
        const isSourceWindow = selectedWindowId === win.id;

        let borderClass = "border-slate-700 hover:border-slate-500";
        let bgClass = "bg-slate-800";
        let shadowClass = "";

        // Logik for styling prioritet:
        // 1. Drop Target (Højest prioritet)
        // 2. Active Window
        // 3. Default

        if (isDropTarget) {
          if (isSourceWindow) {
            // RØD: Forsøger at droppe i samme vindue (Invalid)
            bgClass = "bg-red-900/20";
            borderClass = "border-red-500/50";
          } else {
            // GRØN: Validt drop target (Nyt: lettere at se forskel fra active)
            bgClass = "bg-emerald-900/20";
            borderClass = "border-emerald-500/50 border-dashed scale-[1.02]";
            shadowClass = "shadow-lg shadow-emerald-900/20";
          }
        } else if (isSourceWindow) {
          // BLÅ: Det aktive vindue vi kigger på nu
          bgClass = "bg-blue-600/10";
          borderClass = "border-blue-500/50";
          shadowClass = "shadow-lg";
        }

        return (
          <div
            key={win.id}
            className="flex flex-col gap-1 items-center transition-all duration-200"
            onDragOver={(e) => {
              e.preventDefault(); // VIGTIGT: Tillader drop
              // Kun sæt state hvis det ikke allerede er sat (forhindrer re-renders)
              if (dropTargetWinId !== win.id) {
                setDropTargetWinId(win.id);
              }
            }}
            onDragLeave={(e) => {
              // FIX: Tjek om vi faktisk forlader containeren, eller bare rammer et child element (tekst/knap)
              const currentTarget = e.currentTarget;
              const relatedTarget = e.relatedTarget as Node;

              if (currentTarget.contains(relatedTarget)) {
                return; // Vi er stadig inde i boksen, gør intet.
              }

              setDropTargetWinId(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDropTargetWinId(null); // FIX: Reset state med det samme ved drop
              handleTabDrop(win.id);
            }}
          >
            <div
              onClick={() =>
                setSelectedWindowId(selectedWindowId === win.id ? null : win.id)
              }
              className={`relative group px-4 py-3 rounded-xl border transition-all flex items-center gap-3 cursor-pointer ${bgClass} ${borderClass} ${shadowClass}`}
            >
              <div className="flex flex-col pointer-events-none">
                {" "}
                {/* pointer-events-none hjælper også på drag-flicker */}
                <span
                  className={`text-xs font-bold ${
                    isDropTarget && !isSourceWindow
                      ? "text-emerald-400"
                      : "text-slate-300"
                  }`}
                >
                  Vindue {idx + 1}
                </span>
                <span className="text-[10px] text-slate-500 mt-1">
                  {win.tabs?.length || 0} tabs
                </span>
              </div>

              {/* Handlingsknapper */}
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
                  className="p-1.5 hover:bg-blue-500/20 rounded-lg text-slate-400 hover:text-blue-400 cursor-pointer transition-colors"
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
                  className="p-1.5 hover:bg-red-500/20 rounded-lg text-slate-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                  title="Slet vindue"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          </div>
        );
      })}

      <button
        onClick={() =>
          chrome.runtime.sendMessage({
            type: "CREATE_NEW_WINDOW_IN_WORKSPACE",
            payload: {
              workspaceId: selectedWorkspace?.id,
              name: selectedWorkspace?.name,
            },
          })
        }
        className="h-14 w-14 flex items-center justify-center rounded-xl border border-dashed border-slate-700 hover:border-blue-500 text-slate-500 hover:text-blue-400 transition cursor-pointer active:scale-95"
        title="Tilføj nyt vindue"
      >
        <PlusCircle size={28} />
      </button>
    </div>
  );
};
