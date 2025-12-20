import { db } from "../lib/firebase";
import {
  doc,
  setDoc,
  serverTimestamp,
  getDoc,
  updateDoc,
} from "firebase/firestore";

let isRestoring = false;
// Tracker: browserWindowId -> { workspaceId, internalWindowId, workspaceName }
const activeWindows = new Map<
  number,
  { workspaceId: string; internalWindowId: string; workspaceName: string }
>();

/**
 * Grupperer faner for at give vinduet et visuelt navn (ID).
 */
async function updateWindowGrouping(windowId: number, name: string) {
  if (isRestoring) return;
  try {
    const tabs = await chrome.tabs.query({ windowId });
    const tabIds = tabs
      .filter((t) => !t.pinned && t.id && !t.url?.includes("dashboard.html"))
      .map((t) => t.id as number);

    if (tabIds.length === 0) return;

    const groups = await chrome.tabGroups.query({ windowId });
    const existingGroup = groups.find((g) => g.title === name.toUpperCase());

    if (existingGroup) {
      await chrome.tabs.group({
        tabIds: tabIds as [number, ...number[]],
        groupId: existingGroup.id,
      });
    } else {
      const groupId = await chrome.tabs.group({
        tabIds: tabIds as [number, ...number[]], // Rettelse af TS-fejl
      });
      await chrome.tabGroups.update(groupId, {
        title: name.toUpperCase(),
        color: "blue",
      });
    }
  } catch (e) {
    console.error("Grouping Error:", e);
  }
}

/**
 * Sikrer kun ét dashboard pr. vindue.
 */
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

/**
 * Gemmer faner. Hvis vinduet er i et space, gemmes det dér.
 * Ellers gemmes det i 'inbox_data' (Persistent).
 */
async function saveToFirestore(windowId: number) {
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
      updateWindowGrouping(windowId, mapping.workspaceName);
      const docRef = doc(
        db,
        "workspaces_data",
        mapping.workspaceId,
        "windows",
        mapping.internalWindowId
      );
      await setDoc(
        docRef,
        { tabs: validTabs, lastActive: serverTimestamp(), isActive: true },
        { merge: true }
      );
    } else {
      // Inbox gemmes med et unikt ID baseret på vinduet, men slettes ikke ved luk
      const inboxRef = doc(db, "inbox_data", `win_${windowId}`);
      await setDoc(
        inboxRef,
        { tabs: validTabs, lastActive: serverTimestamp(), isActive: true },
        { merge: true }
      );
    }
  } catch (e) {
    console.error("Save Error:", e);
  }
}

// --- LISTENERS ---
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (change.status === "complete" && tab.windowId) {
    saveToFirestore(tab.windowId);
    enforceDashboardSingleton(tab.windowId);
  }
});

chrome.windows.onFocusChanged.addListener((winId) => {
  if (winId !== chrome.windows.WINDOW_ID_NONE) enforceDashboardSingleton(winId);
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
  } else {
    // Inbox vindue markeres blot som inaktivt, så det bliver i databasen
    const inboxRef = doc(db, "inbox_data", `win_${windowId}`);
    const snap = await getDoc(inboxRef);
    if (snap.exists()) await updateDoc(inboxRef, { isActive: false });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { type, payload } = message;
  if (type === "OPEN_WORKSPACE")
    handleOpenWorkspace(payload.workspaceId, payload.windows, payload.name);
  else if (type === "GET_ACTIVE_MAPPINGS")
    sendResponse(Array.from(activeWindows.entries()));
  else if (type === "FORCE_SYNC_ACTIVE_WINDOW")
    handleForceSync(payload.windowId);
  else if (type === "CREATE_NEW_WINDOW_IN_WORKSPACE")
    handleCreateNewWindowInWorkspace(payload.workspaceId, payload.name);
  else if (type === "CLAIM_WINDOW") {
    activeWindows.set(payload.windowId, {
      workspaceId: payload.workspaceId,
      internalWindowId: payload.internalWindowId,
      workspaceName: payload.name,
    });
    saveToFirestore(payload.windowId);
  }
  return true;
});

async function handleOpenWorkspace(
  workspaceId: string,
  windowsToOpen: any[],
  name: string
) {
  isRestoring = true;
  for (const win of windowsToOpen) {
    let existingWinId: number | null = null;
    for (const [id, map] of activeWindows.entries()) {
      if (map.workspaceId === workspaceId && map.internalWindowId === win.id) {
        existingWinId = id;
        break;
      }
    }
    if (existingWinId !== null) {
      chrome.windows.update(existingWinId, { focused: true });
    } else {
      const urls = win.tabs.map((t: any) => t.url);
      const newWin = await chrome.windows.create({
        url: urls.length > 0 ? urls : "about:blank",
      });
      if (newWin?.id) {
        activeWindows.set(newWin.id, {
          workspaceId,
          internalWindowId: win.id,
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
    await saveToFirestore(newWin.id);
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
    updateWindowGrouping(windowId, mapping.workspaceName);
  }
  setTimeout(() => {
    isRestoring = false;
  }, 1000);
}
