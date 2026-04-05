import { TabData } from "../background/main";
import { WorkspaceWindow } from "../dashboard/types";

interface SelectionParams {
  viewMode: "workspace" | "inbox" | "incognito";
  getFilteredInboxTabs: (incognito: boolean) => TabData[];
  windows: WorkspaceWindow[];
  selectedWindowId: string | null;
  selectedUrls: string[];
  setSelectedUrls: (urls: string[]) => void;
}

/**
 * handleToggleSelection
 * Logik: Marker alle ikke-åbne (Ghosts) -> marker alle -> nulstil.
 * Krydstjekker trackeren mod Chrome for at eliminere zombie-data.
 */
export const handleToggleSelection = async ({
  viewMode,
  getFilteredInboxTabs,
  windows,
  selectedWindowId,
  selectedUrls,
  setSelectedUrls,
}: SelectionParams): Promise<void> => {
  let list: TabData[] = [];
  if (viewMode === "incognito") list = getFilteredInboxTabs(true);
  else if (viewMode === "inbox") list = getFilteredInboxTabs(false);
  else list = windows.find((w) => w.id === selectedWindowId)?.tabs || [];

  if (list.length === 0) {
    return;
  }

  const allUidsInView = list.map((t: TabData) => t.uid);

  if (viewMode === "inbox" || viewMode === "incognito") {
    // 1. Hent de FAKTISKE åbne faner fra Chrome (Fysisk sandhed)
    const physicalTabs = await chrome.tabs.query({});
    const physicalTabIds = new Set(physicalTabs.map((t) => t.id));

    // 2. Hent trackeren fra storage (Mapping sandhed)
    const data = await chrome.storage.local.get("nexus_tab_tracker");
    const trackerArray =
      (data.nexus_tab_tracker as [number, { uid: string; url: string }][]) ||
      [];

    // 3. Find de UIDs der er "Truly Live" (Findes i tracker OG har et aktivt fysisk tabId)
    const trulyLiveUids = new Set<string>();
    trackerArray.forEach(([tabId, tData]) => {
      if (physicalTabIds.has(tabId)) {
        trulyLiveUids.add(tData.uid);
      }
    });

    // 4. Definer Ghosts (Faner i listen, som ikke er Truly Live)
    const ghostUids = list
      .filter((t: TabData) => !trulyLiveUids.has(t.uid))
      .map((t: TabData) => t.uid);

    const isNoneSelected = selectedUrls.length === 0;
    const isAllSelected = selectedUrls.length === allUidsInView.length;

    const isExactlyGhostsSelected =
      ghostUids.length > 0 &&
      selectedUrls.length === ghostUids.length &&
      ghostUids.every((uid) => selectedUrls.includes(uid));

    // --- 3-STADIE BESLUTNING ---
    if (
      isNoneSelected &&
      ghostUids.length > 0 &&
      ghostUids.length < allUidsInView.length
    ) {
      // STADIE 1: Marker alle ikke-åbne (Ghosts)
      setSelectedUrls(ghostUids);
    } else if (isNoneSelected || (isExactlyGhostsSelected && !isAllSelected)) {
      // STADIE 2: Marker alle
      setSelectedUrls(allUidsInView);
    } else {
      // STADIE 3: Nulstil
      setSelectedUrls([]);
    }
  } else {
    // Standard logik for Spaces: Toggle alle/ingen
    setSelectedUrls(
      selectedUrls.length === allUidsInView.length ? [] : allUidsInView,
    );
  }
};
