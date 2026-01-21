import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { Loader2, Monitor } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Components
import { CreateItemModal } from "../components/CreateItemModal";
import { LoginForm } from "../components/LoginForm";
import { PasteModal } from "../components/PasteModal";
import { ArchiveSidebar } from "../components/dashboard/ArchiveSidebar";
import { CategoryMenu } from "../components/dashboard/CategoryMenu";
import { DashboardHeader } from "../components/dashboard/DashboardHeader";
import { ReasoningModal } from "../components/dashboard/ReasoningModal";
import { RemoteAccessModal } from "../components/dashboard/RemoteAccessModal";
import { SettingsModal } from "../components/dashboard/SettingsModal";
import { Sidebar } from "../components/dashboard/Sidebar";
import { TabGrid } from "../components/dashboard/TabGrid";

// Hooks
import { useNexusData } from "../hooks/useNexusData";
import { useTabActions } from "../hooks/useTabActions";

// Services & Libs
import { db } from "../lib/firebase";
import { AiService } from "../services/aiService";
import { LinkManager } from "../services/linkManager";

// Types
import { AiData, WinMapping } from "@/background/main";
import {
  AiSettings,
  ArchiveItem,
  NexusItem,
  TabData,
  UserCategory,
  WorkspaceWindow,
} from "../types";
import { DashboardMessage } from "./types";

// Utils
import { windowOrderCache } from "./utils";

export interface PasteModalState {
  workspaceId: string;
  windowId?: string | null;
  windowName?: string;
}

export const Dashboard = () => {
  // Global Data Hook
  const { user, profiles, items, inboxData } = useNexusData();

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

  const [windows, setWindows] = useState<WorkspaceWindow[]>([]);
  const [archiveItems, setArchiveItems] = useState<ArchiveItem[]>([]);

  const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null);

  // FIX: Type definition her er vigtig for at matche activeMappings i ArchiveSidebar
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
      const createA = getTime(a.createdAt);
      const createB = getTime(b.createdAt);
      return createA - createB;
    });
  }, [windows]);

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
    windows.forEach((w) => scanTabs(w.tabs));
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

  const totalTabsInSpace = useMemo(
    () => windows.reduce((acc, win) => acc + (win.tabs?.length || 0), 0),
    [windows],
  );

  // Update Cache logic (Using imported windowOrderCache)
  if (selectedWorkspace && sortedWindows.length > 0) {
    const wsId = selectedWorkspace.id;
    const signature = `${wsId}-${sortedWindows.length}-${sortedWindows
      .map((w) => w.id)
      .join("")}`;
    const cached = windowOrderCache.get(wsId);
    if (!cached || cached.signature !== signature) {
      const indices: Record<string, number> = {};
      sortedWindows.forEach((w, i) => {
        indices[w.id] = i + 1;
      });
      windowOrderCache.set(wsId, { signature, indices });
    }
  }

  // --- EFFECTS ---

  useEffect(() => {
    const lastProfile = localStorage.getItem("lastActiveProfileId");
    if (lastProfile) setActiveProfile(lastProfile);
    AiService.getSettings().then(setAiSettings);
  }, []);

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

  // Archive Sync
  useEffect(() => {
    if (!user || !selectedWorkspace) {
      setArchiveItems([]);
      return;
    }
    const docRef = doc(
      db,
      "users",
      user.uid,
      "workspaces_data",
      selectedWorkspace.id,
      "archive_data",
      "list",
    );
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setArchiveItems((data.items || []) as ArchiveItem[]);
      } else {
        setArchiveItems([]);
      }
    });
    return () => unsubscribe();
  }, [user, selectedWorkspace]);

  // Listeners
  useEffect(() => {
    if (user) {
      chrome.windows.getCurrent((win) => win.id && setCurrentWindowId(win.id));

      chrome.storage.local.get("nexus_active_windows", (data) => {
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
      if (area === "local" && changes.nexus_active_windows) {
        const newMappings = (changes.nexus_active_windows.newValue || []) as [
          number,
          WinMapping,
        ][];
        setActiveMappings(newMappings);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    chrome.storage.onChanged.addListener(storageListener);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
      chrome.storage.onChanged.removeListener(storageListener);
    };
  }, [user, refreshChromeWindows]);

  // ... (URL Params & Auto-select effects unchanged) ...
  useEffect(() => {
    if (items.length > 0 && !hasLoadedUrlParams.current) {
      const params = new URLSearchParams(window.location.search);
      const wsId = params.get("workspaceId");
      const winId = params.get("windowId");
      if (wsId) {
        const targetWs = items.find((i) => i.id === wsId);
        if (targetWs && selectedWorkspace?.id !== targetWs.id) {
          handleWorkspaceClick(targetWs);
          if (winId) setSelectedWindowId(winId);
        }
      }
      hasLoadedUrlParams.current = true;
    }
  }, [items]);

  useEffect(() => {
    if (
      selectedWorkspace &&
      viewMode === "workspace" &&
      sortedWindows.length > 0 &&
      !selectedWindowId
    ) {
      if (!hasLoadedUrlParams.current) return;
      const params = new URLSearchParams(window.location.search);
      const preselect = params.get("windowId");
      if (preselect && sortedWindows.some((w) => w.id === preselect))
        setSelectedWindowId(preselect);
      else if (sortedWindows[0]?.id) setSelectedWindowId(sortedWindows[0].id);
    }
  }, [sortedWindows, selectedWorkspace, viewMode, selectedWindowId]);

  const handleWorkspaceClick = useCallback(
    (item: NexusItem) => {
      if (selectedWorkspace?.id === item.id) return;
      setViewMode("workspace");
      setSelectedWindowId(null);
      setWindows([]);
      setArchiveItems([]);
      setSelectedWorkspace(item);
    },
    [selectedWorkspace],
  );

  const handleCopySpace = async () => {
    if (!selectedWorkspace) return;
    const allTabs = windows.flatMap((w) => w.tabs || []);
    if (allTabs.length === 0) return;
    const count = await LinkManager.copyTabsToClipboard(allTabs);
    if (count > 0) {
      setHeaderCopyStatus("copied");
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

  if (!user)
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900">
        <LoginForm />
      </div>
    );

  return (
    <div className="relative flex h-screen overflow-hidden bg-slate-900 font-sans text-slate-200">
      {restorationStatus && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-slate-900/60 backdrop-blur-sm">
          <Loader2 size={64} className="animate-spin text-blue-500" />
          <div className="animate-pulse text-2xl font-bold text-white">
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
      />

      <main className="relative flex flex-1 flex-col overflow-hidden bg-slate-900">
        {isProcessingMove && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
            <Loader2 className="animate-spin text-blue-500" size={48} />
          </div>
        )}

        {selectedWorkspace ||
        viewMode === "inbox" ||
        viewMode === "incognito" ? (
          <>
            <DashboardHeader
              viewMode={viewMode}
              selectedWorkspace={selectedWorkspace}
              isViewingCurrent={isViewingCurrent}
              sortedWindows={sortedWindows}
              selectedWindowId={selectedWindowId}
              setSelectedWindowId={setSelectedWindowId}
              dropTargetWinId={dropTargetWinId}
              setDropTargetWinId={setDropTargetWinId}
              handleTabDrop={handleTabDrop}
              handleCopySpace={handleCopySpace}
              totalTabsInSpace={totalTabsInSpace}
              headerCopyStatus={headerCopyStatus}
              setPasteModalData={setPasteModalData}
              getFilteredInboxTabs={getFilteredInboxTabs}
              windows={windows}
              selectedUrls={selectedUrls}
              setSelectedUrls={setSelectedUrls}
              inboxData={inboxData}
            />

            {/* --- HOVED CONTENT AREA (FLEX ROW) --- */}
            <div className="flex flex-1 overflow-hidden">
              {/* VENSTRE: TAB GRID (Skrumper automatisk) */}
              <div className="flex-1 overflow-y-auto">
                <TabGrid
                  viewMode={viewMode}
                  getFilteredInboxTabs={getFilteredInboxTabs}
                  windows={windows}
                  selectedWindowId={selectedWindowId}
                  selectedWorkspace={selectedWorkspace}
                  selectedUrls={selectedUrls}
                  handleTabSelect={handleTabSelect}
                  handleTabDelete={handleTabDelete}
                  onConsume={handleTabConsume}
                  setReasoningData={setReasoningData}
                  setMenuData={setMenuData}
                  aiSettings={aiSettings}
                />
              </div>

              {/* HØJRE: ARKIV SIDEBAR */}
              {viewMode === "workspace" && selectedWorkspace && (
                <ArchiveSidebar
                  workspaceId={selectedWorkspace.id}
                  items={archiveItems}
                  activeMappings={activeMappings} // Sender nu activeMappings med
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-slate-600">
            <Monitor size={64} className="opacity-20" />
            <p className="text-xl font-medium">Vælg et space</p>
          </div>
        )}
      </main>

      {(modalType === "folder" || modalType === "workspace") && (
        <CreateItemModal
          type={modalType}
          activeProfile={activeProfile}
          parentId={modalParentId}
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
          windows={sortedWindows}
          onClose={() => setPasteModalData(null)}
        />
      )}
    </div>
  );
};
