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
import { PasteModalState } from "@/dashboard/Dashboard";

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
  setPasteModalData: (data: PasteModalState) => void;

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
    <header className="flex items-end justify-between border-b border-subtle bg-surface-hover/30 p-8 pb-4">
      <div className="space-y-4">
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

      <div className="mb-1 flex gap-3">
        {viewMode === "workspace" && (
          <>
            <button
              onClick={handleCopySpace}
              disabled={totalTabsInSpace === 0}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition ${
                totalTabsInSpace === 0
                  ? "cursor-not-allowed border-subtle bg-surface-elevated text-strong"
                  : "cursor-pointer border-subtle bg-surface-elevated text-medium hover:border-strong hover:text-high"
              }`}
              title="Kopier alle tabs i dette space"
            >
              {headerCopyStatus === "copied" ? (
                <>
                  <Check size={18} className="text-success" />
                  <span className="text-success">Kopieret!</span>
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
                })
              }
              className="hover:text-mode-incognito-high flex cursor-pointer items-center gap-2 rounded-xl border border-subtle bg-surface-elevated px-4 py-2.5 text-sm font-bold text-mode-incognito transition hover:border-mode-incognito hover:bg-mode-incognito/20"
              title="Indsæt links i nyt vindue"
            >
              <ClipboardPaste size={18} />
              <span>Indsæt</span>
            </button>
            <div className="mx-1 h-8 w-px bg-subtle"></div>
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
          className={`cursor-pointer rounded-xl border bg-surface-elevated p-2.5 transition ${
            selectedUrls.length > 0
              ? "border-action text-action"
              : "border-subtle hover:text-action"
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
                    (t: TabData) => !selectedUrls.includes(t.uid),
                  );
                  await updateDoc(
                    doc(db, "users", uid, "inbox_data", "global"),
                    {
                      tabs: f,
                    },
                  );
                } else if (selectedWorkspace && selectedWindowId) {
                  const w = windows.find((win) => win.id === selectedWindowId);
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
                  windows: sortedWindows,
                  name: selectedWorkspace?.name,
                },
              })
            }
            disabled={windows.length === 0}
            className={`min-w-max cursor-pointer rounded-xl px-6 py-2.5 text-sm font-bold shadow-lg transition ${
              windows.length === 0
                ? "cursor-not-allowed bg-surface-elevated text-low shadow-none"
                : "bg-action text-inverted shadow-action/20 hover:bg-action-hover active:scale-95"
            }`}
          >
            Åbn Space
          </button>
        )}
      </div>
    </header>
  );
};
