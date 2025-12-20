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

// I background.ts - Opdater updateWindowGrouping funktionen
async function updateWindowGrouping(windowId: number, name: string | null) {
  if (isRestoring) return;
  try {
    const groups = await chrome.tabGroups.query({ windowId });

    // Hvis det er Inbox (intet navn), så fjern alle eksisterende grupper
    if (!name) {
      for (const g of groups) {
        const tabs = await chrome.tabs.query({ groupId: g.id });
        const ids = tabs.map((t) => t.id).filter(Boolean) as number[];
        if (ids.length > 0)
          await chrome.tabs.ungroup(ids as [number, ...number[]]);
      }
      return;
    }

    // Find faner der skal grupperes (undgå Dashboard og Pinned)
    const tabs = await chrome.tabs.query({ windowId });
    const tabIds = tabs
      .filter((t) => !t.pinned && t.id && !t.url?.includes("dashboard.html"))
      .map((t) => t.id as number);

    if (tabIds.length === 0) return;

    // Tjek om gruppen allerede findes med det rigtige navn
    const existingGroup = groups.find((g) => g.title === name.toUpperCase());

    if (!existingGroup) {
      // Opret gruppen og navngiv den - dette giver dig din visuelle identifikation!
      const groupId = await (chrome.tabs.group({
        tabIds: tabIds as [number, ...number[]],
      }) as any);
      await chrome.tabGroups.update(groupId, {
        title: name.toUpperCase(),
        color: "blue",
      });
    } else {
      // Hvis gruppen findes, så bare tilføj de faner der mangler
      await chrome.tabs.group({
        tabIds: tabIds as [number, ...number[]],
        groupId: existingGroup.id,
      });
    }
  } catch (e) {
    console.error("Visual ID error:", e);
  }
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
      // Gem til Workspace som før
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
      // Inbox logik: Hent alle 'løse' faner fra ALLE vinduer uden mapping
      const allWindows = await chrome.windows.getAll();
      let allInboxTabs: any[] = [];

      for (const win of allWindows) {
        if (!activeWindows.has(win.id!)) {
          const winTabs = await chrome.tabs.query({ windowId: win.id });
          const filtered = winTabs
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
          allInboxTabs = [...allInboxTabs, ...filtered];
        }
      }

      // Gem alt i ét dokument
      const inboxRef = doc(db, "inbox_data", "global");
      await setDoc(inboxRef, {
        tabs: allInboxTabs,
        lastUpdate: serverTimestamp(),
      });
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

let lastDashboardOpenTime = 0;

chrome.windows.onFocusChanged.addListener(async (winId) => {
  if (winId === chrome.windows.WINDOW_ID_NONE) return;

  // Vent mindst 2 sekunder mellem hver dashboard-oprettelse for at undgå spam
  const now = Date.now();
  if (now - lastDashboardOpenTime < 2000) return;

  const url = chrome.runtime.getURL("dashboard.html");
  const tabs = await chrome.tabs.query({ windowId: winId });
  const hasDash = tabs.some((t) => t.url && t.url.includes("dashboard.html"));

  if (!hasDash) {
    lastDashboardOpenTime = now; // Opdater tiden
    await chrome.tabs.create({ windowId: winId, url, pinned: true, index: 0 });
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
      const urls = win.tabs
        .map((t: any) => t.url)
        .filter((u: string) => !u.includes("dashboard.html"));

      const newWin = await chrome.windows.create({
        url: urls.length > 0 ? urls : undefined, // undefined åbner 'Ny fane'
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
