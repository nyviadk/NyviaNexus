import { db } from "../lib/firebase";
import {
  doc,
  setDoc,
  serverTimestamp,
  getDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";

let isRestoring = false;
const activeWindows = new Map<
  number,
  { workspaceId: string; internalWindowId: string; workspaceName: string }
>();

/**
 * Grupperer faner intelligent. Finder eksisterende gruppe med samme navn
 * og genbruger den, eller opretter en ny hvis nødvendigt.
 */
async function updateWindowGrouping(windowId: number, name: string) {
  if (isRestoring) return;

  try {
    const tabs = await chrome.tabs.query({ windowId });
    const tabIds = tabs
      .filter((t) => !t.pinned && t.id && !t.url?.includes("dashboard.html"))
      .map((t) => t.id as number);

    if (tabIds.length === 0) return;

    // Tjek eksisterende grupper i vinduet
    const groups = await chrome.tabGroups.query({ windowId });
    const existingGroup = groups.find((g) => g.title === name.toUpperCase());

    if (existingGroup) {
      // Tilføj faner til eksisterende gruppe
      await chrome.tabs.group({
        tabIds: tabIds as [number, ...number[]], // Rettelse af TS-fejl
        groupId: existingGroup.id,
      });
    } else {
      // Opret ny gruppe
      const groupId = await chrome.tabs.group({
        tabIds: tabIds as [number, ...number[]], // Rettelse af TS-fejl
      });
      await chrome.tabGroups.update(groupId, {
        title: name.toUpperCase(),
        color: "blue",
      });
    }
  } catch (e) {
    console.error("NyviaNexus Grouping Error:", e);
  }
}

async function enforceDashboardSingleton(windowId: number) {
  const tabs = await chrome.tabs.query({ windowId });
  const dashTabs = tabs.filter(
    (t) => t.url && t.url.includes("dashboard.html")
  );

  if (dashTabs.length === 0) {
    const url = chrome.runtime.getURL("dashboard.html");
    await chrome.tabs.create({ windowId, url, pinned: true, index: 0 });
  } else if (dashTabs.length > 1) {
    const idsToRemove = dashTabs.slice(1).map((t) => t.id as number);
    await chrome.tabs.remove(idsToRemove);
  }
}

async function saveWindowToFirestore(windowId: number) {
  if (isRestoring) return;
  const mapping = activeWindows.get(windowId);

  try {
    const tabs = await chrome.tabs.query({ windowId });
    const validTabs = tabs
      .filter(
        (t) =>
          t.url &&
          !t.url.startsWith("chrome") &&
          !t.url.includes("dashboard.html")
      )
      .map((t) => ({
        title: t.title || "Ny fane",
        url: t.url || "",
        favIconUrl: t.favIconUrl || "",
      }));

    if (mapping) {
      // Gem til det aktive Space
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
        },
        { merge: true }
      );
    } else {
      // Gem til Inbox (for ikke-tildelte vinduer)
      const inboxRef = doc(db, "inbox_data", `win_${windowId}`);
      await setDoc(inboxRef, {
        windowId: windowId,
        tabs: validTabs,
        lastActive: serverTimestamp(),
        isActive: true,
      });
    }
  } catch (error) {
    console.error("Sync Error:", error);
  }
}

// Event Listeners
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (change.status === "complete" && tab.windowId)
    saveWindowToFirestore(tab.windowId);
});

chrome.windows.onFocusChanged.addListener((winId) => {
  if (isRestoring || winId === chrome.windows.WINDOW_ID_NONE) return;
  enforceDashboardSingleton(winId);
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
    await updateDoc(docRef, { isActive: false }); // Fjerner ghost status
    activeWindows.delete(windowId);
  } else {
    // Fjern fra Inbox når vinduet lukkes
    await deleteDoc(doc(db, "inbox_data", `win_${windowId}`));
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "OPEN_WORKSPACE") {
    handleOpenWorkspace(
      message.payload.workspaceId,
      message.payload.windows,
      message.payload.name
    );
  } else if (message.type === "GET_ACTIVE_MAPPINGS") {
    sendResponse(Array.from(activeWindows.entries()));
  } else if (message.type === "FORCE_SYNC_ACTIVE_WINDOW") {
    handleForceSync(message.payload.windowId);
  } else if (message.type === "CREATE_NEW_WINDOW_IN_WORKSPACE") {
    handleCreateNewWindowInWorkspace(
      message.payload.workspaceId,
      message.payload.name
    );
  } else if (message.type === "CLAIM_WINDOW") {
    activeWindows.set(message.payload.windowId, {
      workspaceId: message.payload.workspaceId,
      internalWindowId: message.payload.internalWindowId,
      workspaceName: message.payload.name,
    });
    saveWindowToFirestore(message.payload.windowId);
  }
  return true;
});

async function handleOpenWorkspace(
  workspaceId: string,
  windowsToOpen: any[],
  name: string
) {
  isRestoring = true;

  for (const winToOpen of windowsToOpen) {
    let existingWinId: number | null = null;
    for (const [id, map] of activeWindows.entries()) {
      if (
        map.workspaceId === workspaceId &&
        map.internalWindowId === winToOpen.id
      ) {
        existingWinId = id;
        break;
      }
    }

    if (existingWinId !== null) {
      chrome.windows.update(existingWinId, { focused: true });
    } else {
      const urls = winToOpen.tabs.map((t: any) => t.url);
      const newWin = await chrome.windows.create({
        url: urls.length > 0 ? urls : "about:blank",
      });
      if (newWin?.id) {
        activeWindows.set(newWin.id, {
          workspaceId,
          internalWindowId: winToOpen.id,
          workspaceName: name,
        });
        await enforceDashboardSingleton(newWin.id);
        await updateWindowGrouping(newWin.id, name);
      }
    }
  }

  setTimeout(() => {
    isRestoring = false;
  }, 3000);
}

async function handleCreateNewWindowInWorkspace(
  workspaceId: string,
  name: string
) {
  isRestoring = true;
  const newWin = await chrome.windows.create({ url: "about:blank" });
  if (newWin?.id) {
    const newInternalId = `win_${Date.now()}`;
    activeWindows.set(newWin.id, {
      workspaceId,
      internalWindowId: newInternalId,
      workspaceName: name,
    });
    await enforceDashboardSingleton(newWin.id);
    await updateWindowGrouping(newWin.id, name);
    await saveWindowToFirestore(newWin.id);
  }
  setTimeout(() => {
    isRestoring = false;
  }, 1000);
}

async function handleForceSync(windowId: number) {
  const mapping = activeWindows.get(windowId);
  if (!mapping) return;
  isRestoring = true;
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
      if (tab.id && !tab.url?.includes("dashboard.html"))
        await chrome.tabs.remove(tab.id);
    }
  }
  setTimeout(() => {
    isRestoring = false;
  }, 1000);
}
