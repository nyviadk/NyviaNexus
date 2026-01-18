import React from "react";
import {
  VenetianMask,
  Monitor,
  Copy,
  Check,
  ClipboardPaste,
  CheckSquare,
  Trash2,
  Eraser,
} from "lucide-react";
import { NexusItem, WorkspaceWindow, TabData } from "../../types";
import { WindowControlStrip } from "./WindowControlStrip";
import { auth, db } from "../../lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { InboxData } from "@/dashboard/types";

interface DashboardHeaderProps {
  viewMode: "workspace" | "inbox" | "incognito";
  selectedWorkspace: NexusItem | null;
  isViewingCurrent: boolean;
  sortedWindows: WorkspaceWindow[];
  selectedWindowId: string | null;
  setSelectedWindowId: (id: string | null) => void;
  dropTargetWinId: string | null;
  setDropTargetWinId: (id: string | null) => void;
  handleTabDrop: (id: string) => void;

  // Actions
  handleCopySpace: () => void;
  totalTabsInSpace: number;
  headerCopyStatus: "idle" | "copied";
  setPasteModalData: (data: any) => void;

  // Selection & Clean up
  getFilteredInboxTabs: (incognito: boolean) => TabData[];
  windows: WorkspaceWindow[];
  selectedUrls: string[];
  setSelectedUrls: (urls: string[]) => void;
  inboxData: InboxData | null;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  viewMode,
  selectedWorkspace,
  isViewingCurrent,
  sortedWindows,
  selectedWindowId,
  setSelectedWindowId,
  dropTargetWinId,
  setDropTargetWinId,
  handleTabDrop,
  handleCopySpace,
  totalTabsInSpace,
  headerCopyStatus,
  setPasteModalData,
  getFilteredInboxTabs,
  windows,
  selectedUrls,
  setSelectedUrls,
  inboxData,
}) => {
  return (
    <header className="p-8 pb-4 flex justify-between items-end border-b border-slate-800 bg-slate-800/30">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-4xl font-bold text-white tracking-tight flex items-center gap-3">
            {viewMode === "incognito" ? (
              <>
                <VenetianMask size={36} className="text-purple-500" />
                <span>Incognito</span>
              </>
            ) : viewMode === "inbox" ? (
              "Inbox"
            ) : (
              selectedWorkspace?.name
            )}
          </h2>
          {isViewingCurrent && viewMode === "workspace" && (
            <span className="text-[10px] bg-blue-600/20 text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/20 font-bold uppercase tracking-widest">
              <Monitor size={12} className="inline mr-1" /> Dette Vindue
            </span>
          )}
        </div>

        {viewMode === "workspace" && (
          <WindowControlStrip
            sortedWindows={sortedWindows}
            selectedWindowId={selectedWindowId}
            setSelectedWindowId={setSelectedWindowId}
            dropTargetWinId={dropTargetWinId}
            setDropTargetWinId={setDropTargetWinId}
            handleTabDrop={handleTabDrop}
            selectedWorkspace={selectedWorkspace}
          />
        )}
      </div>

      <div className="flex gap-3 mb-1">
        {viewMode === "workspace" && (
          <>
            <button
              onClick={handleCopySpace}
              disabled={totalTabsInSpace === 0}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition border ${
                totalTabsInSpace === 0
                  ? "border-slate-800 text-slate-600 bg-slate-800 cursor-not-allowed"
                  : "bg-slate-800 border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white cursor-pointer"
              }`}
              title="Kopier alle tabs i dette space"
            >
              {headerCopyStatus === "copied" ? (
                <>
                  <Check size={18} className="text-green-500" />
                  <span className="text-green-500">Kopieret!</span>
                </>
              ) : (
                <>
                  <Copy size={18} />
                  <span>Kopier Space</span>
                </>
              )}
            </button>

            <button
              onClick={() =>
                setPasteModalData({
                  workspaceId: selectedWorkspace!.id,
                  windowId: null,
                  windowName: "Nyt Vindue",
                })
              }
              className="flex items-center gap-2 bg-slate-800 border border-slate-700 hover:border-purple-500 text-purple-400 hover:text-purple-300 hover:bg-purple-900/20 px-4 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer"
              title="Indsæt links i et nyt vindue"
            >
              <ClipboardPaste size={18} />
              <span>Indsæt</span>
            </button>
            <div className="w-px h-8 bg-slate-700 mx-1"></div>
          </>
        )}

        <button
          onClick={() => {
            let list = [];
            if (viewMode === "incognito") list = getFilteredInboxTabs(true);
            else if (viewMode === "inbox") list = getFilteredInboxTabs(false);
            else
              list = windows.find((w) => w.id === selectedWindowId)?.tabs || [];
            const allU = list.map((t: TabData) => t.uid);
            setSelectedUrls(selectedUrls.length === allU.length ? [] : allU);
          }}
          className={`p-2.5 bg-slate-800 border rounded-xl transition cursor-pointer ${
            selectedUrls.length > 0
              ? "border-blue-500 text-blue-400"
              : "border-slate-700 hover:text-blue-400"
          }`}
        >
          <CheckSquare size={24} />
        </button>

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
                    (t: TabData) => !selectedUrls.includes(t.uid)
                  );
                  await updateDoc(
                    doc(db, "users", uid, "inbox_data", "global"),
                    {
                      tabs: f,
                    }
                  );
                } else if (selectedWorkspace && selectedWindowId) {
                  const w = windows.find((win) => win.id === selectedWindowId);
                  if (w) {
                    const f = w.tabs.filter(
                      (t: TabData) => !selectedUrls.includes(t.uid)
                    );
                    await updateDoc(
                      doc(
                        db,
                        "users",
                        uid,
                        "workspaces_data",
                        selectedWorkspace.id,
                        "windows",
                        selectedWindowId
                      ),
                      { tabs: f }
                    );
                  }
                }
                setSelectedUrls([]);
              }
            }}
            className="flex items-center gap-2 bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white px-4 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer"
          >
            <Trash2 size={20} /> Slet ({selectedUrls.length})
          </button>
        )}

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
                  (t: TabData) => !t.isIncognito
                );
                const tabsToKeep = allTabs.filter(
                  (t: TabData) => t.isIncognito
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
            className="flex items-center gap-2 bg-orange-600/20 text-orange-400 hover:bg-orange-600 hover:text-white px-4 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer"
          >
            <Eraser size={20} /> Ryd Inbox
          </button>
        )}

        {viewMode === "incognito" && getFilteredInboxTabs(true).length > 0 && (
          <button
            onClick={async () => {
              if (!auth.currentUser) return;
              const uid = auth.currentUser.uid;
              if (confirm("Ryd Incognito liste?")) {
                const ref = doc(db, "users", uid, "inbox_data", "global");
                const snap = await getDoc(ref);
                const allTabs = snap.data()?.tabs || [];
                const tabsToDelete = allTabs.filter(
                  (t: TabData) => t.isIncognito
                );
                const tabsToKeep = allTabs.filter(
                  (t: TabData) => !t.isIncognito
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
            className="flex items-center gap-2 bg-purple-600/20 text-purple-400 hover:bg-purple-600 hover:text-white px-4 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer"
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
                  windows: sortedWindows,
                  name: selectedWorkspace?.name,
                },
              })
            }
            disabled={windows.length === 0}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg transition cursor-pointer ${
              windows.length === 0
                ? "bg-slate-800 text-slate-500 cursor-not-allowed shadow-none"
                : "bg-blue-600 hover:bg-blue-500 shadow-blue-600/20 text-white active:scale-95"
            }`}
          >
            Åbn Space
          </button>
        )}
      </div>
    </header>
  );
};
