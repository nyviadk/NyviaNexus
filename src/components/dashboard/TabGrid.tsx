import { AiData } from "@/background/main";
import React, { useMemo } from "react";
import { AiSettings, NexusItem, TabData, WorkspaceWindow } from "../../types";
import { TabItem } from "./TabItem";

interface TabGridProps {
  viewMode: "workspace" | "inbox" | "incognito";
  getFilteredInboxTabs: (incognito: boolean) => TabData[];
  windows: WorkspaceWindow[];
  selectedWindowId: string | null;
  selectedWorkspace: NexusItem | null;
  selectedUrls: string[];

  // Handlers
  handleTabSelect: (tab: TabData) => void;
  handleTabDelete: (tab: TabData) => void;
  setReasoningData: (data: AiData | null) => void;
  setMenuData: (data: any) => void;

  // Settings
  aiSettings: AiSettings;
}

export const TabGrid: React.FC<TabGridProps> = ({
  viewMode,
  getFilteredInboxTabs,
  windows,
  selectedWindowId,
  selectedWorkspace,
  selectedUrls,
  handleTabSelect,
  handleTabDelete,
  setReasoningData,
  setMenuData,
  aiSettings,
}) => {
  const renderedTabs = useMemo(() => {
    let list: TabData[] = [];
    if (viewMode === "incognito") list = getFilteredInboxTabs(true);
    else if (viewMode === "inbox") list = getFilteredInboxTabs(false);
    else list = windows.find((w) => w.id === selectedWindowId)?.tabs || [];

    const sourceWSId =
      viewMode === "inbox" || viewMode === "incognito"
        ? "global"
        : selectedWorkspace?.id;

    return list.map((tab: TabData, i: number) => (
      <TabItem
        key={tab.uid || i}
        tab={tab}
        isSelected={selectedUrls.includes(tab.uid)}
        onSelect={handleTabSelect}
        onDelete={handleTabDelete}
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
    ));
  }, [
    viewMode,
    windows,
    selectedWindowId,
    getFilteredInboxTabs,
    selectedWorkspace,
    selectedUrls,
    handleTabSelect,
    handleTabDelete,
    aiSettings.userCategories,
    setReasoningData,
    setMenuData,
  ]);

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {renderedTabs}
      </div>
    </div>
  );
};
