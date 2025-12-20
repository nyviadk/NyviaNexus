import { db } from "../lib/firebase";
import {
  doc,
  setDoc,
  serverTimestamp,
  getDoc,
  updateDoc,
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
 * GRUPPERING: Finder eller opretter ÉN gruppe.
 */
async function updateWindowGrouping(windowId: number, name: string | null) {
  try {
    const groups = await chrome.tabGroups.query({ windowId });

    if (!name) {
      // Inbox: Opløs alle grupper
      for (const g of groups) {
        const tabs = await chrome.tabs.query({ windowId, groupId: g.id });
        const ids = tabs.map((t) => t.id).filter(Boolean) as number[];
        if (ids.length > 0)
          await chrome.tabs.ungroup(ids as [number, ...number[]]);
      }
      return;
    }

    const tabs = await chrome.tabs.query({ windowId });
    const tabIds = tabs
      .filter((t) => !t.pinned && t.id && !isDash(t.url))
      .map((t) => t.id as number);

    if (tabIds.length === 0) return;

    const existingGroup = groups.find((g) => g.title === name.toUpperCase());

    if (!existingGroup) {
      const groupId = await (chrome.tabs.group({
        tabIds: tabIds as [number, ...number[]],
      }) as any);
      await chrome.tabGroups.update(groupId, {
        title: name.toUpperCase(),
        color: "blue",
      });
    } else {
      await chrome.tabs.group({
        tabIds: tabIds as [number, ...number[]],
        groupId: existingGroup.id,
      });
    }
  } catch (e) {
    // Ignorer fejl hvis vinduet er ved at lukke
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
  } catch (e) {
    // Vinduet kan være lukket under query
  }
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
  if (winId === chrome.windows.WINDOW_ID_NONE || lockedWindowIds.has(winId))
    return;

  const now = Date.now();
  if (now - lastDashboardTime < 2000) return;

  try {
    const win = await chrome.windows.get(winId);
    if (win.incognito && !activeWindows.has(winId)) return;

    const tabs = await chrome.tabs.query({ windowId: winId });
    const hasDash = tabs.some((t) => isDash(t.url));

    if (!hasDash) {
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const { type, payload } = msg;
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

/**
 * ÅBN SPACE: Deterministisk indlæsning af vinduer og faner.
 */
async function handleOpenWorkspace(
  workspaceId: string,
  windowsToOpen: any[],
  name: string
) {
  isRestoring = true;

  for (const winData of windowsToOpen) {
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
      if (tabs[0]?.id) {
        await chrome.tabs.update(tabs[0].id, { pinned: true });
      }

      activeWindows.set(winId, {
        workspaceId,
        internalWindowId: winData.id,
        workspaceName: name,
      });

      // Opret faner
      for (const url of urls) {
        await chrome.tabs.create({ windowId: winId, url });
      }

      await updateWindowGrouping(winId, name);

      // Frigiv vinduet efter en kort pause så Firestore når at følge med
      setTimeout(() => {
        lockedWindowIds.delete(winId);
        saveToFirestore(winId);
      }, 1000);
    }
  }

  isRestoring = false;
}

async function handleCreateNewWindowInWorkspace(
  workspaceId: string,
  name: string
) {
  const newWin = await chrome.windows.create({ url: "dashboard.html" });
  if (newWin && newWin.id) {
    const winId = newWin.id;
    const tabs = await chrome.tabs.query({ windowId: winId });
    if (tabs[0]?.id) await chrome.tabs.update(tabs[0].id, { pinned: true });

    activeWindows.set(winId, {
      workspaceId,
      internalWindowId: `win_${Date.now()}`,
      workspaceName: name,
    });

    await updateWindowGrouping(winId, name);
    saveToFirestore(winId);
  }
}

async function handleForceSync(windowId: number) {
  const mapping = activeWindows.get(windowId);
  if (!mapping) return;

  lockedWindowIds.add(windowId);
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
    await updateWindowGrouping(windowId, mapping.workspaceName);
  }

  lockedWindowIds.delete(windowId);
  saveToFirestore(windowId);
}
