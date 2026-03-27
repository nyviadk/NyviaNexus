import { DraggedTabPayload } from "@/features/dashboard/types";
import { AiData, TabData } from "../background/main";

/**
 * Nulstiller AI data hvis vi flytter på tværs af spaces
 */
export const prepareTabData = (
  tab: DraggedTabPayload,
  sourceWorkspaceId: string,
  targetWorkspaceId: string,
): DraggedTabPayload => {
  if (sourceWorkspaceId !== targetWorkspaceId) {
    console.log(
      `🧠 [AI Reset] Moving from ${sourceWorkspaceId} to ${targetWorkspaceId}. Resetting AI status.`,
    );
    return {
      ...tab,
      aiData: { status: "pending" } as AiData,
      lastUpdated: Date.now(),
      isIncognito: false,
    };
  }
  return tab;
};

export const getCleanData = (tab: DraggedTabPayload): TabData => {
  const {
    uid,
    title,
    url,
    favIconUrl,
    isIncognito,
    aiData,
    clearedTracking,
  } = tab;
  return {
    uid,
    title,
    url,
    favIconUrl: favIconUrl || "",
    isIncognito: !!isIncognito,
    aiData: aiData || { status: "pending" },
    lastUpdated: Date.now(),
    clearedTracking: clearedTracking ?? null,
  };
};

export const forceQueueIfMoving = (
  tab: DraggedTabPayload,
  sourceWorkspaceId: string,
  targetWorkspaceId: string,
  workspaceName?: string,
) => {
  if (sourceWorkspaceId !== targetWorkspaceId && tab.id) {
    chrome.runtime.sendMessage({
      type: "FORCE_QUEUE_TAB",
      payload: {
        uid: tab.uid,
        url: tab.url,
        title: tab.title,
        tabId: Number(tab.id),
        workspaceName: workspaceName || "Unknown",
      },
    });
  }
};
