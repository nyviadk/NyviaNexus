import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";

// Typer
interface TabData {
  title: string;
  url: string;
  favIconUrl: string;
}

interface WinMapping {
  workspaceId: string;
  internalWindowId: string;
  workspaceName: string;
  index: number;
}

// State
let activeRestorations = 0;
let lastDashboardTime = 0;
let activeWindows = new Map<number, WinMapping>();
const lockedWindowIds = new Set<number>();

const isDash = (url?: string) => url?.includes("dashboard.html");

// --- PERSISTENCE ---
async function saveActiveWindowsToStorage() {
  const data = Array.from(activeWindows.entries());
  await chrome.storage.local.set({ nexus_active_windows: data });
}

async function loadActiveWindowsFromStorage() {
  const data = await chrome.storage.local.get("nexus_active_windows");
  if (
    data &&
    data.nexus_active_windows &&
    Array.isArray(data.nexus_active_windows)
  ) {
    activeWindows = new Map<number, WinMapping>(
      data.nexus_active_windows as [number, WinMapping][]
    );
  }
}
loadActiveWindowsFromStorage();

/**
 * GRUPPERING: Navngiver gruppen præcist ud fra det medsendte index.
 */
async function updateWindowGrouping(
  windowId: number,
  mapping: WinMapping | null
) {
  try {
    const groupName = mapping
      ? `${mapping.workspaceName.toUpperCase()} (${mapping.index})`
      : "INBOX";

    const groups = await chrome.tabGroups.query({ windowId });
    const tabs = await chrome.tabs.query({ windowId });
    const tabIds = tabs
      .filter((t) => !t.pinned && t.id && !isDash(t.url))
      .map((t) => t.id as number);

    if (tabIds.length === 0) {
      for (const g of groups) {
        const gTabs = await chrome.tabs.query({ windowId, groupId: g.id });
        const ids = gTabs.map((t) => t.id).filter(Boolean) as number[];
        if (ids.length > 0)
          await chrome.tabs.ungroup(ids as [number, ...number[]]);
      }
      return;
    }

    const existingGroup = groups[0];
    if (!existingGroup || existingGroup.title !== groupName) {
      const groupId = await (chrome.tabs.group({
        tabIds: tabIds as [number, ...number[]],
      }) as any);
      await chrome.tabGroups.update(groupId, {
        title: groupName,
        color: mapping ? "blue" : "grey",
      });
    } else {
      await chrome.tabs.group({
        tabIds: tabIds as [number, ...number[]],
        groupId: existingGroup.id,
      });
    }
  } catch (e) {}
}

/**
 * SYNC: Gemmer til Firestore.
 */
async function saveToFirestore(windowId: number) {
  if (lockedWindowIds.has(windowId) || activeRestorations > 0) return;

  try {
    const win = await chrome.windows.get(windowId);
    const mapping = activeWindows.get(windowId);
    const tabs = await chrome.tabs.query({ windowId });

    const validTabs: TabData[] = tabs
      .filter((t) => t.url && !t.url.startsWith("chrome") && !isDash(t.url))
      .map((t) => ({
        title: t.title || "Ny fane",
        url: t.url || "",
        favIconUrl: t.favIconUrl || "",
      }));

    if (validTabs.length === 0 && mapping) {
      const docRef = doc(
        db,
        "workspaces_data",
        mapping.workspaceId,
        "windows",
        mapping.internalWindowId
      );
      await deleteDoc(docRef);
      activeWindows.delete(windowId);
      await saveActiveWindowsToStorage();
      chrome.windows.remove(windowId);
      return;
    }

    if (mapping) {
      await updateWindowGrouping(windowId, mapping);
      const docRef = doc(
        db,
        "workspaces_data",
        mapping.workspaceId,
        "windows",
        mapping.internalWindowId
      );
      await setDoc(
        docRef,
        {
          tabs: validTabs,
          lastActive: serverTimestamp(),
          isActive: true,
          isIncognito: win.incognito,
        },
        { merge: true }
      );
    } else {
      await updateWindowGrouping(windowId, null);
      const allWindows = await chrome.windows.getAll();
      let allInboxTabs: TabData[] = [];
      for (const w of allWindows) {
        if (w.id && !activeWindows.has(w.id) && !lockedWindowIds.has(w.id)) {
          const winTabs = await chrome.tabs.query({ windowId: w.id });
          allInboxTabs = [
            ...allInboxTabs,
            ...winTabs
              .filter(
                (t) => t.url && !t.url.startsWith("chrome") && !isDash(t.url)
              )
              .map((t) => ({
                title: t.title || "Ny fane",
                url: t.url || "",
                favIconUrl: t.favIconUrl || "",
              })),
          ];
        }
      }
      await setDoc(doc(db, "inbox_data", "global"), {
        tabs: allInboxTabs,
        lastUpdate: serverTimestamp(),
      });
    }
  } catch (e) {}
}

// --- LISTENERS ---
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (change.status === "complete" && tab.windowId)
    saveToFirestore(tab.windowId);
});

chrome.tabs.onRemoved.addListener((_id, info) => {
  if (!info.isWindowClosing) saveToFirestore(info.windowId);
});

chrome.windows.onFocusChanged.addListener(async (winId) => {
  if (winId === chrome.windows.WINDOW_ID_NONE || activeRestorations > 0) return;
  const now = Date.now();
  if (now - lastDashboardTime < 1500) return;
  try {
    const win = await chrome.windows.get(winId);
    if (win.incognito && !activeWindows.has(winId)) return;
    const tabs = await chrome.tabs.query({ windowId: winId });
    if (!tabs.some((t) => isDash(t.url))) {
      lastDashboardTime = now;
      await chrome.tabs.create({
        windowId: winId,
        url: "dashboard.html",
        pinned: true,
        index: 0,
      });
    }
  } catch (e) {}
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const mapping = activeWindows.get(windowId);
  if (mapping) {
    const docRef = doc(
      db,
      "workspaces_data",
      mapping.workspaceId,
      "windows",
      mapping.internalWindowId
    );
    await updateDoc(docRef, { isActive: false });
    activeWindows.delete(windowId);
    await saveActiveWindowsToStorage();
  }
  lockedWindowIds.delete(windowId);
});

chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
  const { type, payload } = msg;
  if (type === "OPEN_WORKSPACE")
    handleOpenWorkspace(payload.workspaceId, payload.windows, payload.name);
  else if (type === "OPEN_SPECIFIC_WINDOW")
    handleOpenSpecificWindow(
      payload.workspaceId,
      payload.windowData,
      payload.name,
      payload.index
    );
  else if (type === "GET_ACTIVE_MAPPINGS")
    _sendResponse(Array.from(activeWindows.entries()));
  else if (type === "FORCE_SYNC_ACTIVE_WINDOW")
    handleForceSync(payload.windowId);
  else if (type === "CREATE_NEW_WINDOW_IN_WORKSPACE")
    handleCreateNewWindowInWorkspace(payload.workspaceId, payload.name);
  else if (type === "CLOSE_PHYSICAL_TABS")
    handleClosePhysicalTabs(payload.urls, payload.internalWindowId);
  else if (type === "CLAIM_WINDOW") {
    if (activeRestorations === 0) {
      activeWindows.set(payload.windowId, {
        workspaceId: payload.workspaceId,
        internalWindowId: payload.internalWindowId,
        workspaceName: payload.name,
        index: payload.index || 1,
      });
      saveActiveWindowsToStorage();
    }
  }
  return true;
});

async function handleClosePhysicalTabs(
  urls: string[],
  internalWindowId: string
) {
  let chromeWinId: number | undefined;
  for (const [id, map] of activeWindows.entries()) {
    if (map.internalWindowId === internalWindowId) {
      chromeWinId = id;
      break;
    }
  }
  if (chromeWinId) {
    const tabs = await chrome.tabs.query({ windowId: chromeWinId });
    const tabIdsToClose = tabs
      .filter((t) => t.id && urls.includes(t.url || ""))
      .map((t) => t.id as number);
    if (tabIdsToClose.length > 0) await chrome.tabs.remove(tabIdsToClose);
  } else if (internalWindowId === "global") {
    const allTabs = await chrome.tabs.query({});
    const tabIdsToClose = allTabs
      .filter(
        (t) =>
          t.id && urls.includes(t.url || "") && !activeWindows.has(t.windowId)
      )
      .map((t) => t.id as number);
    if (tabIdsToClose.length > 0) await chrome.tabs.remove(tabIdsToClose);
  }
}

async function handleOpenSpecificWindow(
  workspaceId: string,
  winData: any,
  name: string,
  index: number
) {
  for (const [chromeId, map] of activeWindows.entries()) {
    if (
      map.workspaceId === workspaceId &&
      map.internalWindowId === winData.id
    ) {
      chrome.windows.update(chromeId, { focused: true });
      return;
    }
  }

  activeRestorations++;
  try {
    const urls = winData.tabs
      .map((t: any) => t.url)
      .filter((u: string) => !isDash(u));
    const newWin = await chrome.windows.create({
      url: ["dashboard.html", ...urls],
      incognito: winData.isIncognito || false,
    });

    if (newWin && newWin.id) {
      const winId = newWin.id;
      lockedWindowIds.add(winId);
      const tabs = await chrome.tabs.query({ windowId: winId });
      if (tabs[0]?.id) await chrome.tabs.update(tabs[0].id, { pinned: true });

      const mapping = {
        workspaceId,
        internalWindowId: winData.id,
        workspaceName: name,
        index,
      };
      activeWindows.set(winId, mapping);
      await saveActiveWindowsToStorage();
      await updateWindowGrouping(winId, mapping);

      await new Promise((r) => setTimeout(r, 1000));
      lockedWindowIds.delete(winId);
    }
  } finally {
    activeRestorations--;
  }
}

async function handleOpenWorkspace(
  workspaceId: string,
  windowsToOpen: any[],
  name: string
) {
  for (let i = 0; i < windowsToOpen.length; i++) {
    await handleOpenSpecificWindow(workspaceId, windowsToOpen[i], name, i + 1);
  }
}

async function handleCreateNewWindowInWorkspace(
  workspaceId: string,
  name: string
) {
  activeRestorations++;
  try {
    const newWin = await chrome.windows.create({ url: "dashboard.html" });
    if (newWin && newWin.id) {
      const winId = newWin.id;
      const tabs = await chrome.tabs.query({ windowId: winId });
      if (tabs[0]?.id) await chrome.tabs.update(tabs[0].id, { pinned: true });

      const internalId = `win_${Date.now()}`;
      const snap = await getDocs(
        collection(db, "workspaces_data", workspaceId, "windows")
      );
      const mapping = {
        workspaceId,
        internalWindowId: internalId,
        workspaceName: name,
        index: snap.size + 1,
      };

      activeWindows.set(winId, mapping);
      await saveActiveWindowsToStorage();
      await updateWindowGrouping(winId, mapping);
    }
  } finally {
    activeRestorations--;
  }
}

async function handleForceSync(windowId: number) {
  const mapping = activeWindows.get(windowId);
  if (!mapping) return;
  lockedWindowIds.add(windowId);
  activeRestorations++;
  try {
    const snap = await getDoc(
      doc(
        db,
        "workspaces_data",
        mapping.workspaceId,
        "windows",
        mapping.internalWindowId
      )
    );
    if (snap.exists()) {
      const urls = snap.data().tabs.map((t: any) => t.url);
      const currentTabs = await chrome.tabs.query({ windowId });
      for (const url of urls) await chrome.tabs.create({ windowId, url });
      for (const tab of currentTabs) {
        if (tab.id && !isDash(tab.url)) await chrome.tabs.remove(tab.id);
      }
      await updateWindowGrouping(windowId, mapping);
    }
  } finally {
    lockedWindowIds.delete(windowId);
    activeRestorations--;
    saveToFirestore(windowId);
  }
}
