import { AiData, WinMapping } from "@/background/main";
import React, { useMemo } from "react";
import { Clock, Plus } from "lucide-react"; // Vi genbruger Clock ikonet til info-boksen, Plus til knappen
import { AiSettings, NexusItem, TabData, WorkspaceWindow } from "../../types";
import { TabItem } from "./TabItem";
import { PasteModalState } from "@/dashboard/Dashboard";

interface TabGridProps {
  viewMode: "workspace" | "inbox" | "incognito";
  getFilteredInboxTabs: (incognito: boolean) => TabData[];
  windows: WorkspaceWindow[];
  selectedWindowId: string | null;
  selectedWorkspace: NexusItem | null;
  selectedUrls: string[];
  activeMappings: [number, WinMapping][]; // VIGTIGT: Nødvendig for at tjekke om vinduet er fysisk åbent

  // Handlers
  handleTabSelect: (tab: TabData) => void;
  handleTabDelete: (tab: TabData) => void;
  // Ny prop til at håndtere "consume" (åbn og fjern fra liste)
  onConsume?: (tab: TabData) => void;
  setReasoningData: (data: AiData | null) => void;
  setMenuData: (data: any) => void;

  // Actions
  setPasteModalData: (data: PasteModalState) => void;

  // Settings
  aiSettings: AiSettings;
}

// Hjælpefunktion til at formatere dato-grupper
const getDateLabel = (timestamp?: number): string => {
  // ÆNDRET: Omdøbt fra "Nyligt" til "Arkiv" som ønsket
  if (!timestamp) return "Arkiv";

  const date = new Date(timestamp);
  const now = new Date();

  // Nulstil tidspunkter for at sammenligne datoer rent (starten af dagen)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const checkDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (checkDate.getTime() === today.getTime()) {
    return "I dag";
  } else if (checkDate.getTime() === yesterday.getTime()) {
    return "I går";
  } else {
    // Returner formateret dato (f.eks. "21. januar")
    return new Intl.DateTimeFormat("da-DK", {
      day: "numeric",
      month: "long",
    }).format(date);
  }
};

export const TabGrid: React.FC<TabGridProps> = ({
  viewMode,
  getFilteredInboxTabs,
  windows,
  selectedWindowId,
  selectedWorkspace,
  selectedUrls,
  activeMappings,
  handleTabSelect,
  handleTabDelete,
  onConsume, // Modtager nu onConsume
  setReasoningData,
  setMenuData,
  setPasteModalData,
  aiSettings,
}) => {
  // Håndterer klik på en dato-header (Bulk Select/Deselect)
  const toggleGroupSelection = (groupTabs: TabData[]) => {
    const allSelected = groupTabs.every((t) => selectedUrls.includes(t.uid));

    groupTabs.forEach((tab) => {
      const isSelected = selectedUrls.includes(tab.uid);
      if (allSelected) {
        if (isSelected) handleTabSelect(tab); // Fravælg
      } else {
        if (!isSelected) handleTabSelect(tab); // Vælg
      }
    });
  };

  const renderedContent = useMemo(() => {
    // 1. Hent den rå liste af tabs baseret på viewMode
    let rawList: TabData[] = [];
    if (viewMode === "incognito") rawList = getFilteredInboxTabs(true);
    else if (viewMode === "inbox") rawList = getFilteredInboxTabs(false);
    else rawList = windows.find((w) => w.id === selectedWindowId)?.tabs || [];

    const sourceWSId =
      viewMode === "inbox" || viewMode === "incognito"
        ? "global"
        : selectedWorkspace?.id;

    // Helper til at rendere en enkelt TabItem (DRY)
    const renderTabItem = (tab: TabData, index: number) => (
      <TabItem
        key={tab.uid || index}
        tab={tab}
        isSelected={selectedUrls.includes(tab.uid)}
        selectionCount={selectedUrls.length}
        onSelect={handleTabSelect}
        onDelete={handleTabDelete}
        onConsume={
          viewMode === "inbox" || viewMode === "incognito"
            ? onConsume
            : undefined
        }
        sourceWorkspaceId={sourceWSId}
        userCategories={aiSettings.userCategories}
        onShowReasoning={setReasoningData}
        onOpenMenu={(e: React.MouseEvent, t: TabData) => {
          setMenuData({
            tab: t,
            position: { x: e.clientX, y: e.clientY },
          });
        }}
      />
    );

    // 2. Hvis vi er i Inbox eller Incognito, skal vi gruppere efter dato
    if (viewMode === "inbox" || viewMode === "incognito") {
      // Opret grupper først
      const groups: Record<string, TabData[]> = {};

      rawList.forEach((tab) => {
        const label = getDateLabel(tab.aiData?.lastChecked);
        if (!groups[label]) {
          groups[label] = [];
        }
        groups[label].push(tab);
      });

      // Konverter til array af entries for at kunne sortere sektionerne
      const groupEntries = Object.entries(groups);

      // A. Sorter SEKTIONERNE (Headers) -> Nyeste dato (Højeste timestamp) øverst
      groupEntries.sort(([_labelA, tabsA], [_labelB, tabsB]) => {
        const maxTimeA = Math.max(
          ...tabsA.map((t) => t.aiData?.lastChecked || 0),
        );
        const maxTimeB = Math.max(
          ...tabsB.map((t) => t.aiData?.lastChecked || 0),
        );

        // Særtilfælde: Hvis lastChecked er 0 (Arkiv), vil vi ofte have dem i bunden.
        // Med nuværende logik (maxTime = 0) vil de automatisk ryge i bunden hvis andre har datoer.
        return maxTimeB - maxTimeA;
      });

      // B. Sorter FANERNE INTERNT i hver sektion -> Ældste først (Venstre mod Højre)
      groupEntries.forEach(([_, tabs]) => {
        tabs.sort((a, b) => {
          const timeA = a.aiData?.lastChecked || 0;
          const timeB = b.aiData?.lastChecked || 0;
          return timeA - timeB;
        });
      });

      const hasContent = rawList.length > 0;

      return (
        <>
          {/* Top Info Banner - Vises kun hvis der er indhold i Inbox/Incognito */}
          {hasContent && (
            <div className="mb-6 flex items-center gap-2 px-1 text-xs text-slate-500">
              <Clock size={12} className="opacity-70" />
              <span className="font-medium tracking-wide uppercase opacity-70">
                Grupperet efter seneste AI-analyse
              </span>
            </div>
          )}

          {/* Sektioner */}
          {!hasContent
            ? null
            : groupEntries.map(([label, groupTabs]) => {
                const isGroupFullySelected =
                  groupTabs.length > 0 &&
                  groupTabs.every((t) => selectedUrls.includes(t.uid));
                const isArchive = label === "Arkiv";

                return (
                  <div key={label} className="mb-10 last:mb-0">
                    {/* Klikbar Header */}
                    <div
                      className="group mb-4 flex w-fit cursor-pointer flex-col gap-0.5 rounded-lg py-1.5 pr-3 pl-1 transition-colors select-none hover:bg-slate-800/50"
                      onClick={() => toggleGroupSelection(groupTabs)}
                      title={
                        isGroupFullySelected
                          ? "Fravælg alle i gruppen"
                          : "Vælg alle i gruppen"
                      }
                    >
                      <div className="flex items-center gap-3">
                        <h3
                          className={`text-sm font-bold tracking-wider uppercase transition-colors ${
                            isGroupFullySelected
                              ? "text-blue-400"
                              : "text-slate-400 group-hover:text-slate-200"
                          }`}
                        >
                          {label}
                        </h3>

                        <span
                          className={`flex h-5 min-w-5 items-center justify-center rounded px-1.5 font-mono text-[10px] font-medium transition-colors ${
                            isGroupFullySelected
                              ? "bg-blue-500/10 text-blue-400"
                              : "bg-slate-800 text-slate-500 group-hover:bg-slate-700 group-hover:text-slate-300"
                          }`}
                        >
                          {groupTabs.length}
                        </span>
                      </div>

                      {/* Hjælpetekst specifikt til "Arkiv" eller som generel info */}
                      {isArchive && (
                        <span className="text-[10px] font-medium text-slate-600 italic group-hover:text-slate-500">
                          Venter på tidsstempling fra AI...
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
                      {groupTabs.map((tab, i) => renderTabItem(tab, i))}
                    </div>
                  </div>
                );
              })}
        </>
      );
    }

    // 3. Workspace view (Fladt grid)

    // Tjek om det valgte vindue faktisk eksisterer i databasen (windows listen)
    // Dette sikrer at knappen ikke vises for "Ghost" vinduer der er ved at blive slettet
    const windowObject = windows.find((w) => w.id === selectedWindowId);
    const windowExists = !!windowObject;

    // Tjek om det valgte vindue er fysisk åbnet i Chrome via activeMappings
    const isPhysicallyOpen =
      viewMode === "workspace" &&
      selectedWindowId &&
      activeMappings.some(
        ([_, mapping]) => mapping.internalWindowId === selectedWindowId,
      );

    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
        {rawList.map((tab, i) => renderTabItem(tab, i))}

        {/* "Tilføj Fane" kort 
           - Vises KUN hvis vi er i workspace mode
           - Vises KUN hvis et vindue er valgt
           - Vises KUN hvis vinduet faktisk eksisterer i Firestore (windowExists)
           - Vises KUN hvis vinduet IKKE er åbnet fysisk (isPhysicallyOpen === false)
        */}
        {viewMode === "workspace" &&
          selectedWindowId &&
          windowExists &&
          !isPhysicallyOpen && (
            <button
              onClick={() => {
                if (selectedWorkspace && selectedWindowId) {
                  const winTitle = windowObject?.name || "Dette vindue";

                  setPasteModalData({
                    workspaceId: selectedWorkspace.id,
                    windowId: selectedWindowId,
                    windowName: winTitle,
                  });
                }
              }}
              className="group flex min-h-25 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-700/50 bg-slate-800/20 p-4 text-slate-500 transition-all hover:border-purple-500/50 hover:bg-purple-900/10 hover:text-purple-400 hover:shadow-lg active:scale-95"
              title="Vinduet er ikke åbent. Klik for at tilføje links til listen."
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800/80 shadow-sm transition-transform group-hover:scale-110 group-hover:bg-purple-500/20">
                <Plus
                  size={24}
                  className="transition-colors group-hover:text-purple-400"
                />
              </div>
              <div className="flex flex-col items-center">
                <span className="text-sm font-bold">
                  Tilføj til dette vindue
                </span>
                <span className="text-[10px] font-medium text-slate-600 group-hover:text-purple-400/70">
                  (Offline redigering)
                </span>
              </div>
            </button>
          )}
      </div>
    );
  }, [
    viewMode,
    windows,
    selectedWindowId,
    getFilteredInboxTabs,
    selectedWorkspace,
    selectedUrls,
    activeMappings,
    handleTabSelect,
    handleTabDelete,
    onConsume,
    aiSettings.userCategories,
    setReasoningData,
    setMenuData,
    setPasteModalData,
  ]);

  return <div className="flex-1 overflow-y-auto p-8">{renderedContent}</div>;
};
