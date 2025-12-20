import { db } from "../lib/firebase";
import {
  doc,
  setDoc,
  serverTimestamp,
  getDoc,
  updateDoc,
} from "firebase/firestore";

let isRestoring = false;
const activeWindows = new Map<
  number,
  { workspaceId: string; internalWindowId: string; workspaceName: string }
>();

/**
 * Rydder alle eksisterende grupper i et vindue.
 */
async function purgeAllGroupsInWindow(windowId: number) {
  try {
    const groups = await chrome.tabGroups.query({ windowId });
    for (const group of groups) {
      const tabsInGroup = await chrome.tabs.query({ groupId: group.id });
      const tabIds = tabsInGroup
        .map((t) => t.id)
        .filter((id) => id !== undefined) as number[];
      if (tabIds.length > 0) {
        await chrome.tabs.ungroup(tabIds as [number, ...number[]]);
      }
    }
  } catch (e) {
    console.error("Purge Error:", e);
  }
}

/**
 * Grupperer faner intelligent. Hvis vinduet ikke længere er aktivt i et space,
 * opløses gruppen automatisk.
 */
async function updateWindowGrouping(windowId: number, name: string | null) {
  if (isRestoring) return;
  try {
    const groups = await chrome.tabGroups.query({ windowId });

    if (!name) {
      await purgeAllGroupsInWindow(windowId);
      return;
    }

    const tabs = await chrome.tabs.query({ windowId });
    const tabIds = tabs
      .filter((t) => !t.pinned && t.id && !t.url?.includes("dashboard.html"))
      .map((t) => t.id as number);

    if (tabIds.length === 0) return;

    const existingGroup = groups.find((g) => g.title === name.toUpperCase());

    // Fjern grupper med forkert navn
    for (const g of groups) {
      if (g.title !== name.toUpperCase()) {
        const otherTabs = await chrome.tabs.query({ groupId: g.id });
        const otherIds = otherTabs
          .map((t) => t.id!)
          .filter((id) => id !== undefined);
        if (otherIds.length > 0)
          await chrome.tabs.ungroup(otherIds as [number, ...number[]]);
      }
    }

    if (existingGroup) {
      await chrome.tabs.group({
        tabIds: tabIds as [number, ...number[]],
        groupId: existingGroup.id,
      });
    } else {
      const groupId = await (chrome.tabs.group({
        tabIds: tabIds as [number, ...number[]],
      }) as any);
      await chrome.tabGroups.update(groupId, {
        title: name.toUpperCase(),
        color: "blue",
      });
    }
  } catch (e) {}
}

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
      await updateWindowGrouping(windowId, mapping.workspaceName);
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
      await updateWindowGrouping(windowId, null); // Fjern "Kode" gruppen hvis vinduet ikke er aktivt
      const inboxRef = doc(db, "inbox_data", `win_${windowId}`);
      await setDoc(
        inboxRef,
        {
          tabs: validTabs,
          lastActive: serverTimestamp(),
          isActive: true,
          windowName: "Inbox",
        },
        { merge: true }
      );
    }
  } catch (error) {
    console.error("Sync Error:", error);
  }
}

// --- EVENT LISTENERS FOR REAL-TIME SYNC ---

// Når en fane opdateres
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (change.status === "complete" && tab.windowId) {
    saveToFirestore(tab.windowId);
  }
});

// NÅR EN FANE LUKKES (Løser problem 2)
chrome.tabs.onRemoved.addListener((_id, removeInfo) => {
  if (!removeInfo.isWindowClosing) {
    saveToFirestore(removeInfo.windowId);
  }
});

// Når faner flyttes rundt
chrome.tabs.onMoved.addListener((_id, moveInfo) => {
  saveToFirestore(moveInfo.windowId);
});

chrome.windows.onFocusChanged.addListener((winId) => {
  if (winId !== chrome.windows.WINDOW_ID_NONE) {
    const url = chrome.runtime.getURL("dashboard.html");
    chrome.tabs.query({ windowId: winId }, (tabs) => {
      const hasDash = tabs.some(
        (t) => t.url && t.url.includes("dashboard.html")
      );
      if (!hasDash)
        chrome.tabs.create({ windowId: winId, url, pinned: true, index: 0 });
    });
  }
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
    await updateWindowGrouping(windowId, mapping.workspaceName);
  }
  setTimeout(() => {
    isRestoring = false;
  }, 1000);
}
