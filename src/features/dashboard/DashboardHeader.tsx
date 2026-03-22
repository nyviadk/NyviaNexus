import React, { useState, useRef, useEffect } from "react";
import {
  VenetianMask,
  Monitor,
  Copy,
  Check,
  ClipboardPaste,
  CheckSquare,
  Trash2,
  Eraser,
  ChevronDown,
  List,
  Archive,
  Loader2,
} from "lucide-react";
import { WindowControlStrip } from "./WindowControlStrip";
import { auth, db } from "../../lib/firebase";
import { doc, getDoc, updateDoc } from "@/lib/firebase";
import {
  InboxData,
  NexusItem,
  WorkspaceWindow,
} from "@/features/dashboard/types";
import { PasteModalState } from "@/features/dashboard/Dashboard";
import { TabData, WinMapping } from "../background/main";

interface DashboardHeaderProps {
  viewMode: "workspace" | "inbox" | "incognito";
  selectedWorkspace: NexusItem | null;
  isViewingCurrent: boolean;
  activeWindows: WorkspaceWindow[];
  archivedWindows: WorkspaceWindow[];
  activeMappings: [number, WinMapping][];
  selectedWindowId: string | null;
  setSelectedWindowId: (id: string | null) => void;
  dropTargetWinId: string | null;
  setDropTargetWinId: (id: string | null) => void;
  handleTabDrop: (id: string) => void;

  // Actions
  handleCopySpace: (
    format?: "standard" | "notebook",
    includeArchived?: boolean,
  ) => void;
  handleCopySelectedTabs: () => void;
  totalTabsInSpace: number;
  headerCopyStatus: "idle" | "copied";
  setPasteModalData: (data: PasteModalState) => void;

  // Selection & Clean up
  getFilteredInboxTabs: (incognito: boolean) => TabData[];
  windows: WorkspaceWindow[]; // Bibeholder fuld reference til alt sletning mv
  selectedUrls: string[];
  setSelectedUrls: (urls: string[]) => void;
  inboxData: InboxData | null;

  isProcessingMove?: boolean;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  viewMode,
  selectedWorkspace,
  isViewingCurrent,
  activeWindows,
  archivedWindows,
  activeMappings,
  selectedWindowId,
  setSelectedWindowId,
  dropTargetWinId,
  setDropTargetWinId,
  handleTabDrop,
  handleCopySpace,
  handleCopySelectedTabs,
  totalTabsInSpace,
  headerCopyStatus,
  setPasteModalData,
  getFilteredInboxTabs,
  windows,
  selectedUrls,
  setSelectedUrls,
  inboxData,
  isProcessingMove = false,
}) => {
  const [showCopyMenu, setShowCopyMenu] = useState(false);
  const [includeArchivedCopy, setIncludeArchivedCopy] = useState(false);

  // Styrer visningen af arkiverede vinduer globalt i headeren
  const [showArchived, setShowArchived] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  // Luk menuen hvis man klikker udenfor
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowCopyMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const hasSelected = selectedUrls.length > 0;
  const isCopyDisabled = totalTabsInSpace === 0 && !hasSelected;

  // Tillad kun åbning af vinduer, som rent faktisk kan åbnes
  const openableWindows = activeWindows.filter(
    (w) => w.id !== "win_uncategorized",
  );
  const canOpenSpace = openableWindows.length > 0;

  return (
    <header className="flex flex-col gap-6 border-b border-subtle bg-surface-hover/30 p-8 pb-4">
      {/* RÆKKE 1: Titel og Handlinger samlet på én linje */}
      <div className="flex w-full items-center justify-between">
        {/* Venstre: Titel */}
        <div className="flex items-center gap-3">
          <h2 className="flex items-center gap-3 text-4xl font-bold tracking-tight text-high">
            {viewMode === "incognito" ? (
              <>
                <VenetianMask size={36} className="text-mode-incognito" />
                <span>Incognito</span>
              </>
            ) : viewMode === "inbox" ? (
              "Inbox"
            ) : (
              selectedWorkspace?.name
            )}
          </h2>
          {isViewingCurrent && viewMode === "workspace" && (
            <span className="rounded-full border border-action/20 bg-action/20 px-2.5 py-1 text-[10px] font-bold tracking-widest text-action uppercase">
              <Monitor size={12} className="mr-1 inline" /> Dette Vindue
            </span>
          )}

          {isProcessingMove && (
            <div className="animate-in fade-in zoom-in ml-2 flex items-center gap-1.5 rounded-full bg-surface-elevated px-3 py-1 text-xs font-medium text-action shadow-sm duration-200">
              <Loader2 size={14} className="animate-spin" />
              <span className="animate-pulse text-[10px] font-bold tracking-wider uppercase">
                Opdaterer
              </span>
            </div>
          )}
        </div>

        {/* Højre: Handlinger */}
        <div className="flex items-center gap-3">
          {viewMode === "workspace" && (
            <>
              {/* --- UNIFIED COPY BUTTON --- */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => {
                    if (hasSelected) {
                      handleCopySelectedTabs();
                    } else {
                      setShowCopyMenu(!showCopyMenu);
                    }
                  }}
                  disabled={isCopyDisabled}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border border-subtle bg-surface-elevated px-4 py-2.5 text-sm font-bold transition hover:border-strong hover:text-high active:scale-95 ${
                    isCopyDisabled ? "cursor-not-allowed opacity-50" : ""
                  }`}
                  title={
                    hasSelected
                      ? "Kopiér valgte tabs"
                      : "Vælg format til kopiering"
                  }
                >
                  {headerCopyStatus === "copied" ? (
                    <>
                      <Check size={18} className="text-success" />
                      <span className="text-success">Kopieret!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={18} />
                      <span>
                        {hasSelected
                          ? `Kopiér (${selectedUrls.length})`
                          : "Kopiér Space"}
                      </span>
                      {!hasSelected && (
                        <ChevronDown
                          size={14}
                          className={`ml-1 transition-transform duration-200 ${showCopyMenu ? "rotate-180" : ""}`}
                        />
                      )}
                    </>
                  )}
                </button>

                {/* DROPDOWN MENU */}
                {showCopyMenu && !hasSelected && (
                  <div className="animate-in fade-in zoom-in absolute top-full right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-strong bg-surface shadow-2xl duration-150">
                    <div className="border-b border-subtle bg-surface-elevated px-3 py-2">
                      <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-medium transition hover:text-high">
                        <input
                          type="checkbox"
                          checked={includeArchivedCopy}
                          onChange={(e) =>
                            setIncludeArchivedCopy(e.target.checked)
                          }
                          className="rounded border-subtle bg-surface text-action focus:ring-action"
                        />
                        Inkludér arkiverede vinduer
                      </label>
                    </div>
                    <div className="p-1">
                      <button
                        onClick={() => {
                          handleCopySpace("notebook", includeArchivedCopy);
                          setShowCopyMenu(false);
                        }}
                        className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-medium text-medium transition-colors hover:bg-surface-elevated hover:text-high"
                      >
                        <List size={14} className="shrink-0" />
                        <div className="flex flex-col">
                          <span>Rene links (Notebook format)</span>
                          <span className="text-[10px] opacity-60">
                            Adskilt med linjeskift
                          </span>
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          handleCopySpace("standard", includeArchivedCopy);
                          setShowCopyMenu(false);
                        }}
                        className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-medium text-medium transition-colors hover:bg-surface-elevated hover:text-high"
                      >
                        <Copy size={14} className="shrink-0" />
                        <div className="flex flex-col">
                          <span>Vinduer opdelt med ###</span>
                          <span className="text-[10px] opacity-60">
                            NyviaNexus format
                          </span>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() =>
                  setPasteModalData({
                    workspaceId: selectedWorkspace!.id,
                    windowId: null,
                  })
                }
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-subtle bg-surface-elevated px-4 py-2.5 text-sm font-bold text-mode-incognito transition hover:border-mode-incognito hover:bg-mode-incognito/20 hover:text-mode-incognito-high"
                title="Indsæt links i nyt vindue"
              >
                <ClipboardPaste size={18} />
                <span>Indsæt</span>
              </button>

              {/* ARKIV KNAP */}
              {archivedWindows.length > 0 && (
                <button
                  onClick={() => setShowArchived(!showArchived)}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition ${
                    showArchived
                      ? "border-warning bg-warning/10 text-warning"
                      : "border-subtle bg-surface-elevated text-low hover:border-strong hover:text-high"
                  }`}
                  title={
                    showArchived
                      ? "Skjul arkiverede vinduer"
                      : "Vis arkiverede vinduer"
                  }
                >
                  <Archive size={18} />
                  <span>
                    {showArchived ? "Skjul Arkiv" : "Vis Arkiv"} (
                    {archivedWindows.length})
                  </span>
                </button>
              )}

              <div className="mx-1 h-8 w-px bg-subtle"></div>
            </>
          )}

          {selectedUrls.length > 0 && (
            <button
              onClick={async () => {
                if (!auth.currentUser) return;
                const uid = auth.currentUser.uid;
                if (confirm(`Slet ${selectedUrls.length} tabs?`)) {
                  const sId =
                    viewMode === "inbox" || viewMode === "incognito"
                      ? "global"
                      : selectedWindowId;
                  chrome.runtime.sendMessage({
                    type: "CLOSE_PHYSICAL_TABS",
                    payload: {
                      uids: selectedUrls,
                      internalWindowId: sId,
                      tabIds: [],
                    },
                  });
                  if (viewMode === "inbox" || viewMode === "incognito") {
                    const f = (inboxData?.tabs || []).filter(
                      (t: TabData) => !selectedUrls.includes(t.uid),
                    );
                    await updateDoc(
                      doc(db, "users", uid, "inbox_data", "global"),
                      {
                        tabs: f,
                      },
                    );
                  } else if (selectedWorkspace && selectedWindowId) {
                    const w = windows.find(
                      (win) => win.id === selectedWindowId,
                    );
                    if (w) {
                      const f = w.tabs.filter(
                        (t: TabData) => !selectedUrls.includes(t.uid),
                      );
                      await updateDoc(
                        doc(
                          db,
                          "users",
                          uid,
                          "workspaces_data",
                          selectedWorkspace.id,
                          "windows",
                          selectedWindowId,
                        ),
                        { tabs: f },
                      );
                    }
                  }
                  setSelectedUrls([]);
                }
              }}
              className="flex cursor-pointer items-center gap-2 rounded-xl bg-danger/20 px-4 py-2.5 text-sm font-bold text-danger transition hover:bg-danger hover:text-inverted"
            >
              <Trash2 size={20} /> Slet ({selectedUrls.length})
            </button>
          )}

          <button
            onClick={() => {
              let list = [];
              if (viewMode === "incognito") list = getFilteredInboxTabs(true);
              else if (viewMode === "inbox") list = getFilteredInboxTabs(false);
              else
                list =
                  windows.find((w) => w.id === selectedWindowId)?.tabs || [];
              const allU = list.map((t: TabData) => t.uid);
              setSelectedUrls(selectedUrls.length === allU.length ? [] : allU);
            }}
            className={`cursor-pointer rounded-xl border bg-surface-elevated p-2.5 transition ${
              selectedUrls.length > 0
                ? "border-action text-action"
                : "border-subtle hover:text-action"
            }`}
          >
            <CheckSquare size={24} />
          </button>

          {viewMode === "inbox" && getFilteredInboxTabs(false).length > 0 && (
            <button
              onClick={async () => {
                if (!auth.currentUser) return;
                const uid = auth.currentUser.uid;
                if (confirm("Ryd Inbox?")) {
                  const ref = doc(db, "users", uid, "inbox_data", "global");
                  const snap = await getDoc(ref);
                  const allTabs = snap.data()?.tabs || [];
                  const tabsToDelete = allTabs.filter(
                    (t: TabData) => !t.isIncognito,
                  );
                  const tabsToKeep = allTabs.filter(
                    (t: TabData) => t.isIncognito,
                  );

                  chrome.runtime.sendMessage({
                    type: "CLOSE_PHYSICAL_TABS",
                    payload: {
                      uids: tabsToDelete.map((t: TabData) => t.uid),
                      internalWindowId: "global",
                    },
                  });

                  await updateDoc(ref, { tabs: tabsToKeep });
                }
              }}
              className="flex cursor-pointer items-center gap-2 rounded-xl bg-mode-inbox/20 px-4 py-2.5 text-sm font-bold text-mode-inbox transition hover:bg-mode-inbox hover:text-inverted"
            >
              <Eraser size={20} /> Ryd Inbox
            </button>
          )}

          {viewMode === "incognito" &&
            getFilteredInboxTabs(true).length > 0 && (
              <button
                onClick={async () => {
                  if (!auth.currentUser) return;
                  const uid = auth.currentUser.uid;
                  if (confirm("Ryd Incognito liste?")) {
                    const ref = doc(db, "users", uid, "inbox_data", "global");
                    const snap = await getDoc(ref);
                    const allTabs = snap.data()?.tabs || [];
                    const tabsToDelete = allTabs.filter(
                      (t: TabData) => t.isIncognito,
                    );
                    const tabsToKeep = allTabs.filter(
                      (t: TabData) => !t.isIncognito,
                    );

                    chrome.runtime.sendMessage({
                      type: "CLOSE_PHYSICAL_TABS",
                      payload: {
                        uids: tabsToDelete.map((t: TabData) => t.uid),
                        internalWindowId: "global",
                      },
                    });

                    await updateDoc(ref, { tabs: tabsToKeep });
                  }
                }}
                className="flex cursor-pointer items-center gap-2 rounded-xl bg-mode-incognito/20 px-4 py-2.5 text-sm font-bold text-mode-incognito transition hover:bg-mode-incognito hover:text-inverted"
              >
                <Eraser size={20} /> Ryd Incognito
              </button>
            )}

          {viewMode === "workspace" && (
            <button
              onClick={() =>
                chrome.runtime.sendMessage({
                  type: "OPEN_WORKSPACE",
                  payload: {
                    workspaceId: selectedWorkspace?.id,
                    windows: openableWindows, // Sender kun dem der rent faktisk må åbnes
                    name: selectedWorkspace?.name,
                  },
                })
              }
              disabled={!canOpenSpace}
              className={`min-w-max cursor-pointer rounded-xl px-6 py-2.5 text-sm font-bold shadow-lg transition ${
                !canOpenSpace
                  ? "cursor-not-allowed bg-surface-elevated text-low shadow-none"
                  : "bg-action text-inverted shadow-action/20 hover:bg-action-hover active:scale-95"
              }`}
            >
              Åbn Space
            </button>
          )}
        </div>
      </div>

      {/* RÆKKE 2: Vindues-oversigten (har nu hele bredden) */}
      {viewMode === "workspace" && (
        <div className="w-full">
          <WindowControlStrip
            activeWindows={activeWindows}
            archivedWindows={archivedWindows}
            activeMappings={activeMappings}
            selectedWindowId={selectedWindowId}
            setSelectedWindowId={setSelectedWindowId}
            dropTargetWinId={dropTargetWinId}
            setDropTargetWinId={setDropTargetWinId}
            handleTabDrop={handleTabDrop}
            selectedWorkspace={selectedWorkspace}
            showArchived={showArchived}
          />
        </div>
      )}
    </header>
  );
};
