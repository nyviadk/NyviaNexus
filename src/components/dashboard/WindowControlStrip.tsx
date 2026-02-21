import { Check, ExternalLink, Loader2, PlusCircle, Trash2 } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { DraggedTabPayload } from "../../dashboard/types";
import { NexusService } from "../../services/nexusService";
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
  const [isPlusOver, setIsPlusOver] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

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

  const handleStartRename = (win: WorkspaceWindow, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(win.id);
    setEditName(win.name || "");
  };

  const handleSaveRename = async () => {
    if (!editingId || !selectedWorkspace) return;

    const currentEditingId = editingId;
    const trimmed = editName.trim();

    await NexusService.renameWindow(
      selectedWorkspace.id,
      currentEditingId,
      trimmed || "",
    );

    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveRename();
    }
    if (e.key === "Escape") {
      setEditingId(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-4">
      {sortedWindows.map((win, idx) => {
        const isDropTarget = dropTargetWinId === win.id;
        const isSourceWindow = selectedWindowId === win.id;
        const isEditing = editingId === win.id;

        // VI SKIFTER FRA HARDKODET SLATE TIL DINE TEMA-TOKENS
        let borderClass = "border-subtle hover:border-strong";
        let bgClass = "bg-surface-elevated";
        let shadowClass = "";

        if (isDropTarget) {
          if (isSourceWindow) {
            bgClass = "bg-danger/20";
            borderClass = "border-danger";
          } else {
            bgClass = "bg-success/20";
            borderClass = "border-success border-dashed scale-[1.02]";
            shadowClass = "shadow-lg shadow-success/10";
          }
        } else if (isSourceWindow) {
          // AKTIV: Bruger nu din Action-farve i stedet for Info for at sikre tema-konsistens
          bgClass = "bg-action/10";
          borderClass = "border-action";
          shadowClass = "shadow-md shadow-action/5";
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
              onClick={() => !isEditing && setSelectedWindowId(win.id)}
              className={`group relative flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-all ${bgClass} ${borderClass} ${shadowClass}`}
              onDoubleClick={(e) => !isEditing && handleStartRename(win, e)}
            >
              <div className="flex flex-col">
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <input
                      ref={inputRef}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onBlur={handleSaveRename}
                      onClick={(e) => e.stopPropagation()}
                      className="w-32 rounded border border-action bg-surface px-1 py-0.5 text-xs text-high outline-none"
                      placeholder={`Vindue ${idx + 1}`}
                    />
                    <button
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleSaveRename();
                      }}
                      className="cursor-pointer rounded bg-success/20 p-0.5 text-success hover:bg-success/30"
                    >
                      <Check size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <span
                      className={`text-xs font-bold ${
                        isSourceWindow
                          ? "text-high"
                          : isDropTarget && !isSourceWindow
                            ? "text-success"
                            : "text-medium group-hover:text-high"
                      }`}
                    >
                      {win.name || `Vindue ${idx + 1}`}
                    </span>

                    <span className="mt-1 text-[10px] text-low">
                      {win.tabs?.length || 0} tabs
                    </span>
                  </>
                )}
              </div>

              {!isEditing && (
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
                    className="cursor-pointer rounded-lg p-1.5 text-low transition-colors hover:bg-surface-hover hover:text-action"
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
                    className="cursor-pointer rounded-lg p-1.5 text-low opacity-0 transition-all group-hover:opacity-100 hover:bg-danger/20 hover:text-danger"
                    title="Slet vindue"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}

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
        className={`flex h-14 w-14 cursor-pointer items-center justify-center rounded-xl border border-dashed transition-all duration-200 ${
          isPlusOver
            ? "scale-110 border-success bg-success/10 text-success shadow-xl shadow-success/20"
            : "border-strong text-low hover:border-action hover:text-action"
        } ${
          isCreating
            ? "cursor-wait opacity-50"
            : "cursor-pointer active:scale-95"
        }`}
        title="Tilføj nyt vindue"
      >
        {isCreating ? (
          <Loader2 size={28} className="animate-spin text-action" />
        ) : (
          <PlusCircle size={28} className={isPlusOver ? "animate-pulse" : ""} />
        )}
      </button>
    </div>
  );
};
