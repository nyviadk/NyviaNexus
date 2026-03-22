import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  db,
} from "@/lib/firebase";
import { Loader2, Monitor, DownloadCloud } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PasteModal } from "../CopyPaste/PasteModal";
import { ArchiveSidebar } from "../archive/ArchiveSidebar";
import { CategoryMenu } from "../categories/CategoryMenu";
import { DashboardHeader } from "./DashboardHeader";
import { NotesModal } from "../notes/NotesModal";
import { ReasoningModal } from "../ai/ReasoningModal";
import { Sidebar } from "./Sidebar";
import { TabGrid } from "./TabGrid";

import { useTabActions } from "./useTabActions";

import { LinkManager } from "../CopyPaste/linkManager";

import {
  AiSettings,
  ArchiveItem,
  DashboardMessage,
  NexusItem,
  UserCategory,
  WorkspaceWindow,
} from "./types";

import { windowOrderCache, getParentPath } from "./utils";
import { useNexusData } from "./useNexusData";
import { AiData, TabData, WinMapping } from "../background/main";
import { AiService } from "../ai/aiService";
import { AuthLayout } from "../auth/AuthLayout";
import { CreateItemModal } from "../settings/CreateItemModal";
import { SettingsModal } from "../settings/SettingsModal";
import { RemoteAccessModal } from "../remote/RemoteAccessModal";
import { useExtensionUpdate } from "../updates/useExtensionUpdate";

export interface PasteModalState {
  workspaceId: string;
  windowId?: string | null;
  windowName?: string;
}

export const Dashboard = () => {
  // Global Data Hook
  const { user, profiles, items, inboxData } = useNexusData();

  // Extension Update Hook
  const { updateAvailable, applyUpdate } = useExtensionUpdate();

  // Local State
  const [activeProfile, setActiveProfile] = useState<string>("");
  const [selectedWorkspace, setSelectedWorkspace] = useState<NexusItem | null>(
    null,
  );
  const [viewMode, setViewMode] = useState<"workspace" | "inbox" | "incognito">(
    "workspace",
  );

  const [modalType, setModalType] = useState<
    "folder" | "workspace" | "settings" | "remote-access" | null
  >(null);
  const [modalParentId, setModalParentId] = useState<string>("root");

  // Vi styrer nu notes modal uafhængigt af selectedWorkspace
  const [notesModalTarget, setNotesModalTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [windows, setWindows] = useState<WorkspaceWindow[]>([]);
  const [archiveItems, setArchiveItems] = useState<ArchiveItem[]>([]);

  const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null);

  const [activeMappings, setActiveMappings] = useState<[number, WinMapping][]>(
    [],
  );

  const [currentWindowId, setCurrentWindowId] = useState<number | null>(null);
  const [restorationStatus, setRestorationStatus] = useState<string | null>(
    null,
  );
  const [chromeWindows, setChromeWindows] = useState<chrome.windows.Window[]>(
    [],
  );

  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [dropTargetWinId, setDropTargetWinId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [isProcessingMove, setIsProcessingMove] = useState(false);

  const [pasteModalData, setPasteModalData] = useState<PasteModalState | null>(
    null,
  );
  const [headerCopyStatus, setHeaderCopyStatus] = useState<"idle" | "copied">(
    "idle",
  );

  const [aiSettings, setAiSettings] = useState<AiSettings>({
    allowDynamic: true,
    useUncategorized: false,
    userCategories: [],
  });
  const [reasoningData, setReasoningData] = useState<AiData | null>(null);
  const [menuData, setMenuData] = useState<{
    tab: TabData;
    position: { x: number; y: number };
  } | null>(null);

  const hasLoadedUrlParams = useRef(false);

  const parentPath = useMemo(
    () => getParentPath(modalParentId, items),
    [modalParentId, items],
  );

  // --- ACTIONS HOOK ---
  const {
    handleSidebarTabDrop,
    handleTabDrop,
    handleTabDelete,
    handleTabConsume,
  } = useTabActions(
    activeMappings,
    viewMode,
    selectedWorkspace,
    selectedWindowId,
    setIsProcessingMove,
  );

  // --- HELPERS & MEMOS ---

  // --- SYNC SELECTED WORKSPACE NAME ---
  // Denne effekt sikrer, at hvis 'items' opdateres (f.eks. ved rename i sidebar),
  // så opdateres det valgte workspace objekt i Dashboard state med det samme.
  useEffect(() => {
    if (selectedWorkspace) {
      const freshItem = items.find((i) => i.id === selectedWorkspace.id);
      // Hvis vi finder den i den opdaterede liste, og objektet er ændret (f.eks. nyt navn)
      if (freshItem && freshItem !== selectedWorkspace) {
        setSelectedWorkspace(freshItem);
      }
    }
  }, [items, selectedWorkspace]);
  // -----------------------------------------

  const handleDeleteSuccess = useCallback(
    (deletedId: string) => {
      if (selectedWorkspace?.id === deletedId) {
        setSelectedWorkspace(null);
        setWindows([]);
        setArchiveItems([]);
        setViewMode("workspace");
      }
    },
    [selectedWorkspace],
  );

  const getFilteredInboxTabs = useCallback(
    (incognitoMode: boolean) => {
      if (!inboxData?.tabs) return [];
      return inboxData.tabs.filter((t: TabData) =>
        incognitoMode ? t.isIncognito : !t.isIncognito,
      );
    },
    [inboxData],
  );

  const sortedWindows = useMemo(() => {
    const getTime = (timestamp: any) => {
      if (!timestamp) return 0;
      if (typeof timestamp.toMillis === "function") return timestamp.toMillis();
      if (typeof timestamp.seconds === "number")
        return timestamp.seconds * 1000;
      return 0;
    };

    return [...windows].sort((a, b) => {
      // Sikrer at "win_uncategorized" ALTID pinner til toppen
      const isPinnedA = (a as any).isPinned ?? a.id === "win_uncategorized";
      const isPinnedB = (b as any).isPinned ?? b.id === "win_uncategorized";

      if (isPinnedA && !isPinnedB) return -1;
      if (!isPinnedA && isPinnedB) return 1;

      const createA = getTime(a.createdAt);
      const createB = getTime(b.createdAt);
      return createA - createB;
    });
  }, [windows]);

  // Opdel vinduer i aktive og arkiverede
  const activeWindows = useMemo(
    () => sortedWindows.filter((w) => !w.isArchived),
    [sortedWindows],
  );
  const archivedWindows = useMemo(
    () => sortedWindows.filter((w) => w.isArchived),
    [sortedWindows],
  );

  // --- AI CATEGORY AGGREGATION ---
  const aiGeneratedCategories = useMemo(() => {
    const uniqueAiCats = new Set<string>();
    const scanTabs = (tabs: TabData[] | undefined) => {
      tabs?.forEach((t) => {
        if (t.aiData?.status === "completed" && t.aiData?.category)
          uniqueAiCats.add(t.aiData.category);
      });
    };
    if (inboxData?.tabs) scanTabs(inboxData.tabs);
    if (windows) windows.forEach((w) => scanTabs(w.tabs));
    const existingNames = new Set(
      aiSettings.userCategories.map((c) => c.name.toLowerCase()),
    );
    return Array.from(uniqueAiCats)
      .filter((catName) => !existingNames.has(catName.toLowerCase()))
      .map((catName) => ({
        id: `ai-${catName}`,
        name: catName,
        color: "#64748b",
      })) as UserCategory[];
  }, [inboxData, windows, aiSettings.userCategories]);

  const allAvailableCategories = useMemo(
    () => [...aiSettings.userCategories, ...aiGeneratedCategories],
    [aiSettings.userCategories, aiGeneratedCategories],
  );

  // Vi tæller kun tabs i aktive vinduer for det primære overblik
  const totalTabsInSpace = useMemo(
    () => activeWindows.reduce((acc, win) => acc + (win.tabs?.length || 0), 0),
    [activeWindows],
  );

  // Update Cache logic (nu baseret på activeWindows for korrekt indexering, ignorerer ukategoriseret vindue)
  const normalWindows = activeWindows.filter(
    (w) => w.id !== "win_uncategorized",
  );
  if (selectedWorkspace && normalWindows.length > 0) {
    const wsId = selectedWorkspace.id;
    const signature = `${wsId}-${normalWindows.length}-${normalWindows
      .map((w) => w.id)
      .join("")}`;
    const cached = windowOrderCache.get(wsId);
    if (!cached || cached.signature !== signature) {
      const indices: Record<string, number> = {};
      normalWindows.forEach((w, i) => {
        indices[w.id] = i + 1;
      });
      windowOrderCache.set(wsId, { signature, indices });
    }
  }

  // --- EFFECTS ---

  useEffect(() => {
    // 1. Hent indstillinger
    AiService.getSettings().then(setAiSettings);

    // 2. Håndter valg af profil
    const lastProfile = localStorage.getItem("lastActiveProfileId");

    if (profiles.length === 1) {
      // Hvis der kun er én, vælg den altid
      setActiveProfile(profiles[0].id);
    } else if (lastProfile && profiles.some((p) => p.id === lastProfile)) {
      // Hvis der er flere, og vi har en gemt profil der stadig findes
      setActiveProfile(lastProfile);
    }
  }, [profiles]);

  useEffect(() => {
    if (!modalType) AiService.getSettings().then(setAiSettings);
  }, [modalType]);

  useEffect(() => {
    if (activeProfile)
      localStorage.setItem("lastActiveProfileId", activeProfile);
  }, [activeProfile]);

  const refreshChromeWindows = useCallback(() => {
    chrome.windows.getAll({ populate: false }, (wins) =>
      setChromeWindows(wins),
    );
  }, []);

  // Window Sync
  useEffect(() => {
    if (!user || !selectedWorkspace) {
      setWindows([]);
      return;
    }
    const q = query(
      collection(
        db,
        "users",
        user.uid,
        "workspaces_data",
        selectedWorkspace.id,
        "windows",
      ),
      orderBy("createdAt", "asc"),
    );
    return onSnapshot(q, (snap) => {
      const w = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as WorkspaceWindow[];
      setWindows(w);
    });
  }, [user, selectedWorkspace]);

  // Archive Sync (Updated to handle Inbox/Global AND Incognito)
  useEffect(() => {
    if (!user) return;

    // Bestem korrekt path baseret på viewMode
    let docRef;

    // Både Inbox og Incognito deler den globale mappe
    if (viewMode === "inbox" || viewMode === "incognito") {
      docRef = doc(
        db,
        "users",
        user.uid,
        "inbox_data",
        "global",
        "archive_data",
        "list",
      );
    } else if (viewMode === "workspace" && selectedWorkspace) {
      docRef = doc(
        db,
        "users",
        user.uid,
        "workspaces_data",
        selectedWorkspace.id,
        "archive_data",
        "list",
      );
    } else {
      setArchiveItems([]);
      return;
    }

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setArchiveItems((data.items || []) as ArchiveItem[]);
      } else {
        setArchiveItems([]);
      }
    });
    return () => unsubscribe();
  }, [user, selectedWorkspace, viewMode]);

  // Listeners
  useEffect(() => {
    if (user) {
      chrome.windows.getCurrent((win) => win.id && setCurrentWindowId(win.id));

      chrome.storage.local.get(["nexus_active_windows"], (data) => {
        if (data?.nexus_active_windows) {
          setActiveMappings(
            data.nexus_active_windows as [number, WinMapping][],
          );
        }
      });

      chrome.runtime.sendMessage({ type: "GET_RESTORING_STATUS" }, (res) =>
        setRestorationStatus(res || null),
      );
      refreshChromeWindows();
    }

    const messageListener = (msg: DashboardMessage) => {
      if (msg.type === "RESTORATION_STATUS_CHANGE")
        setRestorationStatus(
          typeof msg.payload === "string" ? msg.payload : null,
        );
      if (msg.type === "PHYSICAL_WINDOWS_CHANGED") refreshChromeWindows();
    };

    const storageListener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area === "local") {
        if (changes.nexus_active_windows) {
          const newMappings = (changes.nexus_active_windows.newValue || []) as [
            number,
            WinMapping,
          ][];
          setActiveMappings(newMappings);
        }
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    chrome.storage.onChanged.addListener(storageListener);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
      chrome.storage.onChanged.removeListener(storageListener);
    };
  }, [user, refreshChromeWindows]);

  const handleWorkspaceClick = useCallback(
    (item: NexusItem, specificWindowId?: string) => {
      // Hvis vi allerede er på spacet, men vil skifte vindue:
      if (selectedWorkspace?.id === item.id) {
        if (specificWindowId && selectedWindowId !== specificWindowId) {
          setSelectedWindowId(specificWindowId);
        }
        return;
      }

      setViewMode("workspace");
      // Sæt specifikt vindue ID hvis angivet, ellers nulstil
      setSelectedWindowId(specificWindowId || null);
      setSelectedUrls([]);
      setWindows([]);
      setArchiveItems([]);
      setNotesModalTarget(null);
      setSelectedWorkspace(item);
    },
    [selectedWorkspace, selectedWindowId],
  );

  // --- URL PARAMS & DEEP LINKING LOGIC ---
  useEffect(() => {
    if (items.length > 0 && !hasLoadedUrlParams.current) {
      const params = new URLSearchParams(window.location.search);

      const wsId = params.get("workspaceId");
      const winId = params.get("windowId");
      const noteSpaceId = params.get("noteSpace");
      const viewParam = params.get("view"); // Håndterer automatisk inbox/incognito navigation

      // 0. Håndter direkte genstart/restore af Inbox og Incognito
      if (viewParam === "inbox") setViewMode("inbox");
      if (viewParam === "incognito") setViewMode("incognito");

      // 1. Håndter Deep Link til Noter
      if (noteSpaceId) {
        if (noteSpaceId === "global") {
          setNotesModalTarget({ id: "global", name: "Inbox" });
        } else {
          const noteWs = items.find((i) => i.id === noteSpaceId);
          if (noteWs) {
            setNotesModalTarget({ id: noteWs.id, name: noteWs.name });
          }
        }
      }

      // 2. Håndter normal navigation til Workspaces
      if (wsId) {
        const targetWs = items.find((i) => i.id === wsId);
        if (targetWs && selectedWorkspace?.id !== targetWs.id) {
          // Brug winId fra URL params hvis tilgængeligt
          handleWorkspaceClick(targetWs, winId || undefined);
        }
      }

      // RYD URL STRAKS (Så vi har en ren URL og brugeren kan navigere uden at være fastlåst)
      if (wsId || noteSpaceId || viewParam) {
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete("noteSpace");
        newUrl.searchParams.delete("workspaceId");
        newUrl.searchParams.delete("windowId");
        newUrl.searchParams.delete("view");
        window.history.replaceState({}, "", newUrl.toString());
      }

      hasLoadedUrlParams.current = true;
    }
  }, [items, selectedWorkspace, handleWorkspaceClick]);

  // Denne effekt sikrer at vi vælger et standard vindue hvis intet er valgt
  useEffect(() => {
    if (
      selectedWorkspace &&
      viewMode === "workspace" &&
      activeWindows.length > 0 &&
      !selectedWindowId
    ) {
      if (!hasLoadedUrlParams.current) return;

      const params = new URLSearchParams(window.location.search);
      const preselect = params.get("windowId");

      if (preselect && activeWindows.some((w) => w.id === preselect))
        setSelectedWindowId(preselect);
      else if (activeWindows[0]?.id) setSelectedWindowId(activeWindows[0].id);
    }
  }, [activeWindows, selectedWorkspace, viewMode, selectedWindowId]);

  /**
   * Opgraderet handleCopySpace der understøtter både Standard (###) og Notebook (Newline) format.
   * Modtager nu også et boolean for, om arkiverede vinduer skal med.
   */
  const handleCopySpace = async (
    format: "standard" | "notebook" = "standard",
    includeArchived: boolean = false,
  ) => {
    const winsToCopy = includeArchived ? sortedWindows : activeWindows;
    if (!selectedWorkspace || !winsToCopy || winsToCopy.length === 0) return;

    const count = await LinkManager.copyWindowsToClipboard(winsToCopy, format);

    if (count > 0) {
      setHeaderCopyStatus("copied");
      setSelectedUrls([]);
      setTimeout(() => setHeaderCopyStatus("idle"), 2000);
    }
  };

  /**
   * Håndterer kopiering af specifikt valgte tabs direkte som en liste.
   */
  const handleCopySelectedTabs = async () => {
    if (selectedUrls.length === 0) return;

    let allAvailableTabs: TabData[] = [];
    if (viewMode === "incognito") {
      allAvailableTabs = getFilteredInboxTabs(true);
    } else if (viewMode === "inbox") {
      allAvailableTabs = getFilteredInboxTabs(false);
    } else {
      windows.forEach((w) => {
        if (w.tabs) allAvailableTabs.push(...w.tabs);
      });
    }

    const selectedTabs = allAvailableTabs.filter((t) =>
      selectedUrls.includes(t.uid),
    );

    const count = await LinkManager.copyTabsToClipboard(selectedTabs);
    if (count > 0) {
      setHeaderCopyStatus("copied");
      setSelectedUrls([]);
      setTimeout(() => setHeaderCopyStatus("idle"), 2000);
    }
  };

  const handleTabSelect = useCallback((tab: TabData) => {
    const idToSelect = tab.uid;
    setSelectedUrls((prev) =>
      prev.includes(idToSelect)
        ? prev.filter((u) => u !== idToSelect)
        : [...prev, idToSelect],
    );
  }, []);

  const isViewingCurrent = activeMappings.some(
    ([id, m]) =>
      id === currentWindowId && m.internalWindowId === selectedWindowId,
  );

  // Vis arkiv i Workspace, Inbox OG Incognito
  const shouldShowArchive =
    (viewMode === "workspace" && selectedWorkspace) ||
    viewMode === "inbox" ||
    viewMode === "incognito";

  // Inbox og Incognito deler "global" ID
  const currentArchiveWorkspaceId =
    viewMode === "inbox" || viewMode === "incognito"
      ? "global"
      : selectedWorkspace?.id || "";

  // Helper til at give modalen et pænt navn
  const getNoteModalTitle = () => {
    if (viewMode === "workspace") return selectedWorkspace?.name || "Workspace";
    if (viewMode === "incognito") return "Incognito (Global)";
    return "Inbox (Global)";
  };

  if (!user) {
    return <AuthLayout />;
  }

  return (
    <div className="relative flex h-screen overflow-hidden bg-background font-sans text-high">
      {/* UPDATE BANNER */}
      {updateAvailable && (
        <div className="animate-in slide-in-from-top-4 absolute top-0 right-0 left-0 z-50 flex items-center justify-center gap-4 border-b border-subtle bg-surface-elevated px-4 py-2 text-high shadow-sm backdrop-blur-sm">
          <DownloadCloud size={16} className="text-action" />
          <span className="text-sm font-medium">
            En ny version af Nexus er klar!
          </span>
          <button
            onClick={applyUpdate}
            className="cursor-pointer rounded-md bg-action px-3 py-1 text-xs font-semibold text-inverted shadow-sm transition-colors hover:bg-action-hover"
          >
            Genstart og opdater
          </button>
        </div>
      )}

      {restorationStatus && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/60 backdrop-blur-sm">
          <Loader2 size={64} className="animate-spin text-action" />
          <div className="animate-pulse text-2xl font-bold text-high">
            {restorationStatus}
          </div>
        </div>
      )}

      <Sidebar
        profiles={profiles}
        activeProfile={activeProfile}
        setActiveProfile={setActiveProfile}
        items={items}
        chromeWindows={chromeWindows}
        currentWindowId={currentWindowId}
        activeMappings={activeMappings}
        viewMode={viewMode}
        setViewMode={setViewMode}
        selectedWorkspace={selectedWorkspace}
        setSelectedWorkspace={setSelectedWorkspace}
        setModalType={setModalType}
        setModalParentId={setModalParentId}
        activeDragId={activeDragId}
        setActiveDragId={setActiveDragId}
        handleSidebarTabDrop={handleSidebarTabDrop}
        handleWorkspaceClick={handleWorkspaceClick}
        handleDeleteSuccess={handleDeleteSuccess}
        inboxData={inboxData}
        isLoading={items.length === 0}
        selectedWindowId={selectedWindowId}
        setSelectedUrls={setSelectedUrls}
      />

      <main className="relative flex flex-1 flex-col overflow-hidden bg-background">
        {selectedWorkspace ||
        viewMode === "inbox" ||
        viewMode === "incognito" ? (
          <>
            <DashboardHeader
              viewMode={viewMode}
              selectedWorkspace={selectedWorkspace}
              isViewingCurrent={isViewingCurrent}
              activeWindows={activeWindows}
              archivedWindows={archivedWindows}
              activeMappings={activeMappings}
              selectedWindowId={selectedWindowId}
              setSelectedWindowId={setSelectedWindowId}
              dropTargetWinId={dropTargetWinId}
              setDropTargetWinId={setDropTargetWinId}
              handleTabDrop={handleTabDrop}
              handleCopySpace={handleCopySpace}
              handleCopySelectedTabs={handleCopySelectedTabs}
              totalTabsInSpace={totalTabsInSpace}
              headerCopyStatus={headerCopyStatus}
              setPasteModalData={setPasteModalData}
              getFilteredInboxTabs={getFilteredInboxTabs}
              windows={windows} // TabGrid sletninger og selektioner kan stadig finde tabs her
              selectedUrls={selectedUrls}
              setSelectedUrls={setSelectedUrls}
              inboxData={inboxData}
              isProcessingMove={isProcessingMove}
            />

            {/* --- HOVED CONTENT AREA (FLEX ROW) --- */}
            <div className="flex flex-1 overflow-hidden">
              {/* VENSTRE: TAB GRID (Skrumper automatisk) */}
              <div className="flex-1 overflow-y-auto">
                <TabGrid
                  viewMode={viewMode}
                  getFilteredInboxTabs={getFilteredInboxTabs}
                  windows={activeWindows} // Sikrer at TabGrid KUN viser tabs for aktive vinduer
                  selectedWindowId={selectedWindowId}
                  selectedWorkspace={selectedWorkspace}
                  selectedUrls={selectedUrls}
                  activeMappings={activeMappings} // Tilføjet prop
                  handleTabSelect={handleTabSelect}
                  handleTabDelete={handleTabDelete}
                  onConsume={handleTabConsume}
                  setReasoningData={setReasoningData}
                  setMenuData={setMenuData}
                  setPasteModalData={setPasteModalData}
                  aiSettings={aiSettings}
                />
              </div>

              {/* HØJRE: ARKIV SIDEBAR */}
              {shouldShowArchive && (
                <ArchiveSidebar
                  workspaceId={currentArchiveWorkspaceId}
                  items={archiveItems}
                  activeMappings={activeMappings}
                  onOpenNotes={() =>
                    setNotesModalTarget({
                      id: currentArchiveWorkspaceId,
                      name: getNoteModalTitle(),
                    })
                  }
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-low">
            <Monitor size={64} className="opacity-20" />
            <p className="text-xl font-medium">Vælg et space</p>
          </div>
        )}
      </main>

      {/* --- MODALS --- */}
      {/* Viser NotesModal uafhængigt af hvilket space man ser på i dashboardet */}
      {notesModalTarget && (
        <NotesModal
          workspaceId={notesModalTarget.id}
          workspaceName={notesModalTarget.name}
          onClose={() => setNotesModalTarget(null)}
        />
      )}

      {(modalType === "folder" || modalType === "workspace") && (
        <CreateItemModal
          type={modalType}
          activeProfile={activeProfile}
          parentId={modalParentId}
          parentPath={parentPath}
          onClose={() => {
            setModalType(null);
            setModalParentId("root");
          }}
          onSuccess={() => {
            setModalType(null);
            setModalParentId("root");
          }}
        />
      )}
      {modalType === "settings" && (
        <SettingsModal
          profiles={profiles}
          onClose={() => setModalType(null)}
          activeProfile={activeProfile}
          setActiveProfile={setActiveProfile}
        />
      )}
      {modalType === "remote-access" && (
        <RemoteAccessModal onClose={() => setModalType(null)} />
      )}
      {reasoningData && (
        <ReasoningModal
          data={reasoningData}
          onClose={() => setReasoningData(null)}
        />
      )}
      {menuData && (
        <CategoryMenu
          tab={menuData.tab}
          workspaceId={selectedWorkspace?.id || null}
          winId={selectedWindowId}
          position={menuData.position}
          categories={allAvailableCategories}
          onClose={() => setMenuData(null)}
        />
      )}
      {pasteModalData && (
        <PasteModal
          workspaceId={pasteModalData.workspaceId}
          windowId={pasteModalData.windowId}
          windowName={pasteModalData.windowName}
          activeMappings={activeMappings}
          windows={activeWindows}
          onClose={() => setPasteModalData(null)}
        />
      )}
    </div>
  );
};
