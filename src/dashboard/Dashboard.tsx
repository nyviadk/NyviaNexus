import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { Loader2, Monitor } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Components
import { CreateItemModal } from "../components/CreateItemModal";
import { LoginForm } from "../components/LoginForm";
import { PasteModal } from "../components/PasteModal";
import { CategoryMenu } from "../components/dashboard/CategoryMenu";
import { DashboardHeader } from "../components/dashboard/DashboardHeader";
import { ReasoningModal } from "../components/dashboard/ReasoningModal";
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
import { AiData } from "@/background/main";
import { AiSettings, NexusItem, TabData, WorkspaceWindow } from "../types";
import { DashboardMessage, WindowMapping } from "./types";

// Utils
import { windowOrderCache } from "./utils";

export const Dashboard = () => {
  // Global Data Hook
  const { user, profiles, items, inboxData } = useNexusData();

  // Local State
  const [activeProfile, setActiveProfile] = useState<string>("");
  const [selectedWorkspace, setSelectedWorkspace] = useState<NexusItem | null>(
    null
  );
  const [viewMode, setViewMode] = useState<"workspace" | "inbox" | "incognito">(
    "workspace"
  );
  const [modalType, setModalType] = useState<
    "folder" | "workspace" | "settings" | null
  >(null);
  const [modalParentId, setModalParentId] = useState<string>("root");

  const [windows, setWindows] = useState<WorkspaceWindow[]>([]);
  const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null);
  const [activeMappings, setActiveMappings] = useState<
    [number, WindowMapping][]
  >([]);
  const [currentWindowId, setCurrentWindowId] = useState<number | null>(null);
  const [restorationStatus, setRestorationStatus] = useState<string | null>(
    null
  );
  const [chromeWindows, setChromeWindows] = useState<chrome.windows.Window[]>(
    []
  );

  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [dropTargetWinId, setDropTargetWinId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [isProcessingMove, setIsProcessingMove] = useState(false);

  const [pasteModalData, setPasteModalData] = useState<{
    workspaceId: string;
    windowId?: string | null;
    windowName?: string;
  } | null>(null);
  const [headerCopyStatus, setHeaderCopyStatus] = useState<"idle" | "copied">(
    "idle"
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

  // --- ACTIONS HOOK (Flyt, Drop, Slet logik) ---
  const { handleSidebarTabDrop, handleTabDrop, handleTabDelete } =
    useTabActions(
      activeMappings,
      viewMode,
      selectedWorkspace,
      selectedWindowId,
      setIsProcessingMove
    );

  // --- HELPERS & MEMOS ---

  const handleDeleteSuccess = useCallback(
    (deletedId: string) => {
      if (selectedWorkspace?.id === deletedId) {
        setSelectedWorkspace(null);
        setWindows([]);
        setViewMode("workspace");
      }
    },
    [selectedWorkspace]
  );

  const getFilteredInboxTabs = useCallback(
    (incognitoMode: boolean) => {
      if (!inboxData?.tabs) return [];
      return inboxData.tabs.filter((t: TabData) =>
        incognitoMode ? t.isIncognito : !t.isIncognito
      );
    },
    [inboxData]
  );

  const sortedWindows = useMemo(() => {
    // Helper function til sikkert at hente tid, uanset om det er Timestamp objekt eller JSON
    const getTime = (t: any) => {
      if (!t) return 0;
      if (typeof t.toMillis === "function") return t.toMillis();
      if (typeof t.seconds === "number") return t.seconds * 1000;
      return 0;
    };

    return [...windows].sort((a, b) => {
      if (selectedWorkspace) {
        const cached = windowOrderCache.get(selectedWorkspace.id);
        if (cached) {
          const indexA = cached.indices[a.id];
          const indexB = cached.indices[b.id];
          if (indexA !== undefined && indexB !== undefined)
            return indexA - indexB;
        }
      }
      const timeA = getTime(a.lastActive);
      const timeB = getTime(b.lastActive);
      return timeA - timeB;
    });
  }, [windows, selectedWorkspace]);

  const totalTabsInSpace = useMemo(
    () => windows.reduce((acc, win) => acc + (win.tabs?.length || 0), 0),
    [windows]
  );

  // Update Cache
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
      setChromeWindows(wins)
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
        "windows"
      ),
      orderBy("lastActive", "asc")
    );
    return onSnapshot(q, (snap) => {
      const w = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as WorkspaceWindow[];
      setWindows(w);
    });
  }, [user, selectedWorkspace]);

  // Chrome Events
  useEffect(() => {
    if (user) {
      chrome.windows.getCurrent((win) => win.id && setCurrentWindowId(win.id));

      chrome.storage.local.get("nexus_active_windows", (data) => {
        if (data?.nexus_active_windows) {
          // FIX 1: Explicit cast til den forventede type
          setActiveMappings(
            data.nexus_active_windows as [number, WindowMapping][]
          );
        }
      });

      chrome.runtime.sendMessage({ type: "GET_RESTORING_STATUS" }, (res) =>
        setRestorationStatus(res || null)
      );
      refreshChromeWindows();
    }

    const messageListener = (msg: DashboardMessage) => {
      if (msg.type === "RESTORATION_STATUS_CHANGE")
        setRestorationStatus(
          typeof msg.payload === "string" ? msg.payload : null
        );
      if (msg.type === "PHYSICAL_WINDOWS_CHANGED") refreshChromeWindows();
    };

    const storageListener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area === "local" && changes.nexus_active_windows) {
        // FIX 2: Cast newValue (eller fallback arrayet) til typen
        const newMappings = (changes.nexus_active_windows.newValue || []) as [
          number,
          WindowMapping
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

  // URL Params & Selection
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
      setSelectedWorkspace(item);
    },
    [selectedWorkspace]
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
        : [...prev, idToSelect]
    );
  }, []);

  const isViewingCurrent = activeMappings.some(
    ([id, m]) =>
      id === currentWindowId && m.internalWindowId === selectedWindowId
  );

  if (!user)
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900">
        <LoginForm />
      </div>
    );

  return (
    <div className="flex h-screen bg-slate-900 text-slate-200 overflow-hidden font-sans relative">
      {restorationStatus && (
        <div className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center flex-col gap-4">
          <Loader2 size={64} className="text-blue-500 animate-spin" />
          <div className="text-2xl font-bold text-white animate-pulse">
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
        sortedWindows={sortedWindows}
        selectedWorkspace={selectedWorkspace}
        viewMode={viewMode}
        setViewMode={setViewMode}
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

      <main className="flex-1 flex flex-col bg-slate-900 relative">
        {isProcessingMove && (
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center">
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
            <TabGrid
              viewMode={viewMode}
              getFilteredInboxTabs={getFilteredInboxTabs}
              windows={windows}
              selectedWindowId={selectedWindowId}
              selectedWorkspace={selectedWorkspace}
              selectedUrls={selectedUrls}
              handleTabSelect={handleTabSelect}
              handleTabDelete={handleTabDelete}
              setReasoningData={setReasoningData}
              setMenuData={setMenuData}
              aiSettings={aiSettings}
            />
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-4">
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
          categories={[...aiSettings.userCategories]} // Simplified category passing
          onClose={() => setMenuData(null)}
        />
      )}
      {pasteModalData && (
        <PasteModal
          workspaceId={pasteModalData.workspaceId}
          windowId={pasteModalData.windowId}
          windowName={pasteModalData.windowName}
          onClose={() => setPasteModalData(null)}
        />
      )}
    </div>
  );
};
