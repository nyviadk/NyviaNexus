import { db } from "../lib/firebase";
import {
  doc,
  setDoc,
  serverTimestamp,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";

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
}

// State
let isRestoring = false;
let lastDashboardTime = 0;
const activeWindows = new Map<number, WinMapping>();
const lockedWindowIds = new Set<number>();

const isDash = (url?: string) => url?.includes("dashboard.html");

/**
 * Hjælper til at finde vinduets index i et workspace for navngivning (1, 2, 3...)
 */
async function getWorkspaceWindowIndex(
  workspaceId: string,
  internalWindowId: string
): Promise<number> {
  try {
    const q = query(
      collection(db, "workspaces_data", workspaceId, "windows"),
      orderBy("lastActive", "asc")
    );
    const snap = await getDocs(q);
    const index = snap.docs.findIndex((d) => d.id === internalWindowId);
    return index !== -1 ? index + 1 : 1;
  } catch (e) {
    return 1;
  }
}

/**
 * GRUPPERING: Navngiver gruppen med Space Navn + Nummer (f.eks. KODE (1))
 */
async function updateWindowGrouping(
  windowId: number,
  mapping: WinMapping | null
) {
  if (isRestoring || lockedWindowIds.has(windowId)) return;

  try {
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

    let groupTitle = "INBOX";
    if (mapping) {
      const index = await getWorkspaceWindowIndex(
        mapping.workspaceId,
        mapping.internalWindowId
      );
      groupTitle = `${mapping.workspaceName.toUpperCase()} (${index})`;
    }

    const existingGroup = groups[0];

    if (!existingGroup || existingGroup.title !== groupTitle) {
      const groupId = await (chrome.tabs.group({
        tabIds: tabIds as [number, ...number[]],
      }) as any);
      await chrome.tabGroups.update(groupId, {
        title: groupTitle,
        color: mapping ? "blue" : "grey",
      });
    } else {
      await chrome.tabs.group({
        tabIds: tabIds as [number, ...number[]],
        groupId: existingGroup.id,
      });
    }
  } catch (e) {
    console.warn("[Nexus] Grouping failed", e);
  }
}

/**
 * SYNC: Gemmer vinduets tilstand til Firestore.
 */
async function saveToFirestore(windowId: number) {
  if (lockedWindowIds.has(windowId) || isRestoring) return;

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
          const filtered = winTabs
            .filter(
              (t) => t.url && !t.url.startsWith("chrome") && !isDash(t.url)
            )
            .map((t) => ({
              title: t.title || "Ny fane",
              url: t.url || "",
              favIconUrl: t.favIconUrl || "",
            }));
          allInboxTabs = [...allInboxTabs, ...filtered];
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
  if (
    winId === chrome.windows.WINDOW_ID_NONE ||
    lockedWindowIds.has(winId) ||
    isRestoring
  )
    return;

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
      payload.name
    );
  else if (type === "GET_ACTIVE_MAPPINGS")
    _sendResponse(Array.from(activeWindows.entries()));
  else if (type === "FORCE_SYNC_ACTIVE_WINDOW")
    handleForceSync(payload.windowId);
  else if (type === "CREATE_NEW_WINDOW_IN_WORKSPACE")
    handleCreateNewWindowInWorkspace(payload.workspaceId, payload.name);
  else if (type === "CLOSE_PHYSICAL_TAB")
    handleClosePhysicalTab(payload.url, payload.internalWindowId);
  else if (type === "CLAIM_WINDOW") {
    if (!lockedWindowIds.has(payload.windowId)) {
      activeWindows.set(payload.windowId, {
        workspaceId: payload.workspaceId,
        internalWindowId: payload.internalWindowId,
        workspaceName: payload.name,
      });
      saveToFirestore(payload.windowId);
    }
  }
  return true;
});

async function handleClosePhysicalTab(url: string, internalWindowId: string) {
  let chromeWinId: number | undefined;
  for (const [id, map] of activeWindows.entries()) {
    if (map.internalWindowId === internalWindowId) {
      chromeWinId = id;
      break;
    }
  }
  // Hvis det er et space-vindue
  if (chromeWinId) {
    const tabs = await chrome.tabs.query({ windowId: chromeWinId });
    const tabToClose = tabs.find((t) => t.url === url);
    if (tabToClose?.id) await chrome.tabs.remove(tabToClose.id);
  } else {
    // Hvis det er i Inbox (global)
    const allTabs = await chrome.tabs.query({});
    const tabToClose = allTabs.find(
      (t) => t.url === url && !activeWindows.has(t.windowId)
    );
    if (tabToClose?.id) await chrome.tabs.remove(tabToClose.id);
  }
}

async function handleOpenSpecificWindow(
  workspaceId: string,
  winData: any,
  name: string
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

  isRestoring = true;
  try {
    const urls = winData.tabs
      .map((t: any) => t.url)
      .filter((u: string) => !isDash(u));
    const newWin = await chrome.windows.create({
      url: "dashboard.html",
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
      };
      activeWindows.set(winId, mapping);

      for (const url of urls) {
        await chrome.tabs.create({ windowId: winId, url });
      }

      await updateWindowGrouping(winId, mapping);
      lockedWindowIds.delete(winId);
    }
  } finally {
    isRestoring = false;
  }
}

async function handleOpenWorkspace(
  workspaceId: string,
  windowsToOpen: any[],
  name: string
) {
  isRestoring = true;
  try {
    for (const winData of windowsToOpen) {
      await handleOpenSpecificWindow(workspaceId, winData, name);
    }
  } finally {
    isRestoring = false;
  }
}

async function handleCreateNewWindowInWorkspace(
  workspaceId: string,
  name: string
) {
  isRestoring = true;
  try {
    const newWin = await chrome.windows.create({ url: "dashboard.html" });
    if (newWin && newWin.id) {
      const winId = newWin.id;
      const tabs = await chrome.tabs.query({ windowId: winId });
      if (tabs[0]?.id) await chrome.tabs.update(tabs[0].id, { pinned: true });

      const mapping = {
        workspaceId,
        internalWindowId: `win_${Date.now()}`,
        workspaceName: name,
      };
      activeWindows.set(winId, mapping);
      await updateWindowGrouping(winId, mapping);
    }
  } finally {
    isRestoring = false;
  }
}

async function handleForceSync(windowId: number) {
  const mapping = activeWindows.get(windowId);
  if (!mapping) return;

  lockedWindowIds.add(windowId);
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
    saveToFirestore(windowId);
  }
}
