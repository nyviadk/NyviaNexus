import { Loader2, Monitor, DownloadCloud } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  NexusItem,
  UserCategory,
} from "./types";

import { getParentPath } from "./utils";
import { useNexusData } from "./useNexusData";
import { useChromeSync } from "./useChromeSync";
import { useWorkspaceData } from "./useWorkspaceData";
import { useDeepLinking } from "./useDeepLinking";
import { AiData, TabData } from "../background/main";
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

  // Chrome Sync Hook (active mappings, window IDs, restoration status)
  const { activeMappings, currentWindowId, restorationStatus, chromeWindows } =
    useChromeSync(user);

  // Local State
  const [activeProfile, setActiveProfile] = useState<string>("");

  // REFACTOR: Bruger nu kun ID'et som state for at undgå useEffect synkronisering
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    null,
  );

  const [viewMode, setViewMode] = useState<"workspace" | "inbox" | "incognito">(
    "workspace",
  );

  const [modal, setModal] = useState<{
    type: "folder" | "workspace" | "settings" | "remote-access" | null;
    parentId: string;
  }>({ type: null, parentId: "root" });

  // Vi styrer nu notes modal uafhængigt af selectedWorkspace
  const [notesModalTarget, setNotesModalTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Workspace Data Hook (windows, archive, sorting, cache)
  const {
    windows,
    setWindows,
    archiveItems,
    setArchiveItems,
    sortedWindows,
    activeWindows,
    archivedWindows,
    totalTabsInSpace,
  } = useWorkspaceData(user, selectedWorkspaceId, viewMode);

  const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null);

  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
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

  const parentPath = useMemo(
    () => getParentPath(modal.parentId, items),
    [modal.parentId, items],
  );

  // --- DERIVED STATE REFACTOR ---
  // Denne effekt sikrer, at hvis 'items' opdateres (f.eks. ved rename i sidebar),
  // så opdateres det valgte workspace objekt i Dashboard state med det samme.
  // OPPDATERING: Effekten er fjernet! Vi beregner det nu direkte under render. Det er "best practice".
  const selectedWorkspace = useMemo(() => {
    return selectedWorkspaceId
      ? items.find((i) => i.id === selectedWorkspaceId) || null
      : null;
  }, [items, selectedWorkspaceId]);
  // -----------------------------------------

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

  // Wraps setActiveProfile og gemmer i localStorage i samme operation (erstatter useEffect)
  const handleSetActiveProfile = useCallback((id: string) => {
    setActiveProfile(id);
    if (id) localStorage.setItem("lastActiveProfileId", id);
  }, []);

  const handleDeleteSuccess = useCallback(
    (deletedId: string) => {
      if (selectedWorkspaceId === deletedId) {
        setSelectedWorkspaceId(null);
        setWindows([]);
        setArchiveItems([]);
        setViewMode("workspace");
      }
    },
    [selectedWorkspaceId],
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

  // --- EFFECTS ---

  useEffect(() => {
    // Hent indstillinger
    AiService.getSettings().then(setAiSettings);

    // Håndter valg af profil
    const lastProfile = localStorage.getItem("lastActiveProfileId");

    if (profiles.length === 1) {
      // Hvis der kun er én, vælg den altid
      handleSetActiveProfile(profiles[0].id);
    } else if (lastProfile && profiles.some((p) => p.id === lastProfile)) {
      // Hvis der er flere, og vi har en gemt profil der stadig findes
      setActiveProfile(lastProfile);
    }
  }, [profiles, handleSetActiveProfile]);

  const handleWorkspaceClick = useCallback(
    (item: NexusItem, specificWindowId?: string) => {
      // Hvis vi allerede er på spacet, men vil skifte vindue:
      if (selectedWorkspaceId === item.id) {
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
      setSelectedWorkspaceId(item.id);
    },
    [selectedWorkspaceId, selectedWindowId],
  );

  // Deep Linking Hook (URL params + auto-select window)
  useDeepLinking(
    items,
    selectedWorkspaceId,
    activeWindows,
    viewMode,
    selectedWindowId,
    setViewMode,
    setSelectedWindowId,
    setNotesModalTarget,
    handleWorkspaceClick,
  );

  /**
   * Opgraderet handleCopySpace der understøtter både Standard (###) og Notebook (Newline) format.
   * Modtager nu også et boolean for, om arkiverede vinduer skal med.
   */
  const handleCopySpace = async (
    format: "standard" | "notebook" = "standard",
    includeArchived: boolean = false,
  ) => {
    const winsToCopy = includeArchived ? sortedWindows : activeWindows;
    if (!selectedWorkspaceId || !winsToCopy || winsToCopy.length === 0) return;

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
    (viewMode === "workspace" && selectedWorkspaceId) ||
    viewMode === "inbox" ||
    viewMode === "incognito";

  // Inbox og Incognito deler "global" ID
  const currentArchiveWorkspaceId =
    viewMode === "inbox" || viewMode === "incognito"
      ? "global"
      : selectedWorkspaceId || "";

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
        setActiveProfile={handleSetActiveProfile}
        items={items}
        chromeWindows={chromeWindows}
        currentWindowId={currentWindowId}
        activeMappings={activeMappings}
        viewMode={viewMode}
        setViewMode={setViewMode}
        selectedWorkspace={selectedWorkspace}
        setSelectedWorkspace={(item) =>
          item
            ? handleWorkspaceClick(item)
            : handleDeleteSuccess(selectedWorkspaceId!)
        }
        setModalType={(type) => setModal((m) => ({ ...m, type }))}
        setModalParentId={(parentId) => setModal((m) => ({ ...m, parentId }))}
        handleSidebarTabDrop={handleSidebarTabDrop}
        handleWorkspaceClick={handleWorkspaceClick}
        handleDeleteSuccess={handleDeleteSuccess}
        inboxData={inboxData}
        isLoading={items.length === 0}
        selectedWindowId={selectedWindowId}
        setSelectedUrls={setSelectedUrls}
      />

      <main className="relative flex flex-1 flex-col overflow-hidden bg-background">
        {selectedWorkspaceId ||
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

      {(modal.type === "folder" || modal.type === "workspace") && (
        <CreateItemModal
          type={modal.type}
          activeProfile={activeProfile}
          parentId={modal.parentId}
          parentPath={parentPath}
          onClose={() => {
            setModal({ type: null, parentId: "root" });
            AiService.getSettings().then(setAiSettings);
          }}
          onSuccess={() => {
            setModal({ type: null, parentId: "root" });
            AiService.getSettings().then(setAiSettings);
          }}
        />
      )}
      {modal.type === "settings" && (
        <SettingsModal
          profiles={profiles}
          onClose={() => {
            setModal({ type: null, parentId: "root" });
            AiService.getSettings().then(setAiSettings);
          }}
          activeProfile={activeProfile}
          setActiveProfile={handleSetActiveProfile}
        />
      )}
      {modal.type === "remote-access" && (
        <RemoteAccessModal
          onClose={() => {
            setModal({ type: null, parentId: "root" });
            AiService.getSettings().then(setAiSettings);
          }}
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
