import { db } from "../lib/firebase";
import {
  doc,
  setDoc,
  serverTimestamp,
  getDoc,
  updateDoc,
} from "firebase/firestore";

// System State
let isRestoring = false;
let lastDashboardTime = 0;
const activeWindows = new Map<
  number,
  { workspaceId: string; internalWindowId: string; workspaceName: string }
>();

const isDash = (url?: string) => url?.includes("dashboard.html");

/**
 * Grupperer faner præcist uden timeouts.
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
    console.warn("[Nexus] Grouping failed (window might be closing)");
  }
}

/**
 * Kerne-logik: Gem til Firestore
 */
async function saveToFirestore(windowId: number) {
  if (isRestoring) return;

  try {
    const win = await chrome.windows.get(windowId);
    const mapping = activeWindows.get(windowId);
    const tabs = await chrome.tabs.query({ windowId });

    const validTabs = tabs
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

      // Global Inbox (Flad liste)
      const allWindows = await chrome.windows.getAll();
      let allInboxTabs: any[] = [];
      for (const w of allWindows) {
        if (!activeWindows.has(w.id!)) {
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
    console.error("[Nexus] Sync Error:", e);
  }
}

// --- EVENT LISTENERS ---

chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (change.status === "complete" && tab.windowId)
    saveToFirestore(tab.windowId);
});

chrome.tabs.onRemoved.addListener((_id, removeInfo) => {
  if (!removeInfo.isWindowClosing) saveToFirestore(removeInfo.windowId);
});

chrome.tabs.onMoved.addListener((_id, moveInfo) =>
  saveToFirestore(moveInfo.windowId)
);

chrome.windows.onFocusChanged.addListener(async (winId) => {
  if (winId === chrome.windows.WINDOW_ID_NONE || isRestoring) return;

  const now = Date.now();
  if (now - lastDashboardTime < 1500) return;

  try {
    const win = await chrome.windows.get(winId);
    // Vigtigt: Opret ikke dashboards i nye inkognito vinduer automatisk
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
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { type, payload } = message;
  if (type === "OPEN_WORKSPACE") handleOpenWorkspace(payload);
  else if (type === "GET_ACTIVE_MAPPINGS")
    sendResponse(Array.from(activeWindows.entries()));
  else if (type === "FORCE_SYNC_ACTIVE_WINDOW")
    handleForceSync(payload.windowId);
  else if (type === "CREATE_NEW_WINDOW_IN_WORKSPACE")
    handleCreateNewWindow(payload);
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
 * Åbner et Space vindue for vindue og mapper dem før næste vindue startes.
 */
async function handleOpenWorkspace({ workspaceId, windows, name }: any) {
  isRestoring = true;

  for (const winData of windows) {
    const urls = winData.tabs
      .map((t: any) => t.url)
      .filter((u: string) => !isDash(u));

    // Vi venter på at vinduet er oprettet før vi går videre
    const newWin = await chrome.windows.create({
      url: urls.length > 0 ? urls : undefined,
      incognito: winData.isIncognito || false,
    });

    if (newWin?.id) {
      // Map vinduet med det samme så listeners genkender det
      activeWindows.set(newWin.id, {
        workspaceId,
        internalWindowId: winData.id,
        workspaceName: name,
      });

      // Grupper med det samme
      await updateWindowGrouping(newWin.id, name);
    }
  }

  // Giv systemet ro til at færdiggøre rendering
  setTimeout(() => {
    isRestoring = false;
  }, 2000);
}

async function handleCreateNewWindow({ workspaceId, name }: any) {
  isRestoring = true;
  const newWin = await chrome.windows.create({ url: "about:blank" });
  if (newWin?.id) {
    activeWindows.set(newWin.id, {
      workspaceId,
      internalWindowId: `win_${Date.now()}`,
      workspaceName: name,
    });
    await updateWindowGrouping(newWin.id, name);
    await saveToFirestore(newWin.id);
  }
  isRestoring = false;
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
      if (tab.id && !isDash(tab.url)) await chrome.tabs.remove(tab.id);
    }
    await updateWindowGrouping(windowId, mapping.workspaceName);
  }
  isRestoring = false;
}
