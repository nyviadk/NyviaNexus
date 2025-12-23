import { db, auth } from "../lib/firebase";
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
  onSnapshot,
} from "firebase/firestore";

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

let activeRestorations = 0;
let lastDashboardTime = 0;
let activeWindows = new Map<number, WinMapping>();
const lockedWindowIds = new Set<number>();

let globalState = {
  profiles: [] as any[],
  items: [] as any[],
  inbox: null as any,
  workspaceWindows: {} as Record<string, any[]>,
};
let activeWindowsUnsubscribe: (() => void) | null = null;
let currentWatchedWorkspaceId: string | null = null;

const isDash = (url?: string) => url?.includes("dashboard.html");
function broadcast(type: string, payload: any) {
  chrome.runtime.sendMessage({ type, payload }).catch(() => {});
}

// --- FIREBASE LISTENERS ---
function startFirebaseListeners() {
  onSnapshot(collection(db, "profiles"), (snap) => {
    globalState.profiles = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    broadcast("STATE_UPDATED", { profiles: globalState.profiles });
  });
  onSnapshot(collection(db, "items"), (snap) => {
    globalState.items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    broadcast("STATE_UPDATED", { items: globalState.items });
  });
  onSnapshot(doc(db, "inbox_data", "global"), (snap) => {
    globalState.inbox = snap.exists()
      ? { id: snap.id, ...snap.data() }
      : { tabs: [] };
    broadcast("STATE_UPDATED", { inbox: globalState.inbox });
  });
}

auth.onAuthStateChanged((user) => {
  if (user) startFirebaseListeners();
});

// --- STORAGE & RESTORATION ---
async function saveActiveWindowsToStorage() {
  const data = Array.from(activeWindows.entries());
  await chrome.storage.local.set({ nexus_active_windows: data });
}

async function loadAndVerifyWindows() {
  const data = await chrome.storage.local.get("nexus_active_windows");
  if (data?.nexus_active_windows && Array.isArray(data.nexus_active_windows)) {
    const rawMappings = data.nexus_active_windows as [number, WinMapping][];
    activeWindows.clear();
    for (const [winId, mapping] of rawMappings) {
      try {
        await chrome.windows.get(winId);
        activeWindows.set(winId, mapping);
      } catch (e) {
        // Vinduet findes ikke længere, markér som inaktivt i DB
        const docRef = doc(
          db,
          "workspaces_data",
          mapping.workspaceId,
          "windows",
          mapping.internalWindowId
        );
        updateDoc(docRef, { isActive: false }).catch(() => {});
      }
    }
    await saveActiveWindowsToStorage();
  }
}
loadAndVerifyWindows();

// --- TAB GROUPING HELPERS ---
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

// --- SAVE FUNCTION WITH STARTUP PROTECTION ---
async function saveToFirestore(windowId: number, isRemoval: boolean = false) {
  if (lockedWindowIds.has(windowId) || activeRestorations > 0) return;

  try {
    let windowExists = true;
    try {
      await chrome.windows.get(windowId);
    } catch (e) {
      windowExists = false;
    }

    const mapping = activeWindows.get(windowId);

    // ============================================
    // SPACE LOGIK (Normal opførsel)
    // ============================================
    if (mapping) {
      if (!windowExists) return;

      const tabs = await chrome.tabs.query({ windowId });
      const validTabs: TabData[] = tabs
        .filter((t) => t.url && !t.url.startsWith("chrome") && !isDash(t.url))
        .map((t) => ({
          title: t.title || "Ny fane",
          url: t.url || "",
          favIconUrl: t.favIconUrl || "",
        }));

      if (validTabs.length === 0 && isRemoval) {
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
        },
        { merge: true }
      );
    }
    // ============================================
    // INBOX LOGIK (Med Startup Protection)
    // ============================================
    else {
      // 1. Hvis vinduet er væk, gør intet (bevar Zombies)
      if (!windowExists) return;

      // 2. Hvis ingen Inbox-vinduer er åbne i hele browseren, gør intet.
      const allWindows = await chrome.windows.getAll();
      const visibleInboxWindows = allWindows.filter(
        (w) => w.id && !activeWindows.has(w.id) && !lockedWindowIds.has(w.id)
      );

      if (visibleInboxWindows.length === 0) return;

      await updateWindowGrouping(windowId, null);

      // 3. Saml alle tabs fra alle Inbox-vinduer
      let allInboxTabs: TabData[] = [];
      for (const w of visibleInboxWindows) {
        if (w.id) {
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

      // ============================================================
      // STARTUP PROTECTION (FIXET HER)
      // ============================================================
      // Hvis vi har fundet 0 tabs (kun Dashboard/NewTab), så tjek DB.
      // Hvis DB har data, så er det en kold start -> STOP GEMNING.
      // ============================================================
      if (allInboxTabs.length === 0) {
        const inboxDoc = await getDoc(doc(db, "inbox_data", "global"));
        if (inboxDoc.exists()) {
          const storedTabs = inboxDoc.data().tabs || [];
          if (storedTabs.length > 0) {
            console.log(
              "Startup Protection: Browser er tom, men DB har data. Stopper overskrivning."
            );
            return;
          }
        }
      }

      // Hvis vi når herit, er det sikkert at gemme
      await setDoc(doc(db, "inbox_data", "global"), {
        tabs: allInboxTabs,
        lastUpdate: serverTimestamp(),
      });
    }
  } catch (e) {
    console.error("Save error:", e);
  }
}

// --- EVENT LISTENERS ---
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (change.status === "complete" && tab.windowId) {
    saveToFirestore(tab.windowId, false);
  }
});

chrome.tabs.onRemoved.addListener((_id, info) => {
  if (!info.isWindowClosing) {
    saveToFirestore(info.windowId, true);
  }
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const { type, payload } = msg;
  if (type === "GET_LATEST_STATE") {
    sendResponse(globalState);
  } else if (type === "WATCH_WORKSPACE") {
    const workspaceId = payload;
    if (currentWatchedWorkspaceId !== workspaceId) {
      if (activeWindowsUnsubscribe) activeWindowsUnsubscribe();
      currentWatchedWorkspaceId = workspaceId;
      activeWindowsUnsubscribe = onSnapshot(
        collection(db, "workspaces_data", workspaceId, "windows"),
        (snap) => {
          const windows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          globalState.workspaceWindows[workspaceId] = windows;
          broadcast("WORKSPACE_WINDOWS_UPDATED", { workspaceId, windows });
        }
      );
    } else {
      const cached = globalState.workspaceWindows[workspaceId];
      if (cached)
        broadcast("WORKSPACE_WINDOWS_UPDATED", {
          workspaceId,
          windows: cached,
        });
    }
  } else if (type === "OPEN_WORKSPACE") {
    handleOpenWorkspace(payload.workspaceId, payload.windows, payload.name);
  } else if (type === "OPEN_SPECIFIC_WINDOW") {
    handleOpenSpecificWindow(
      payload.workspaceId,
      payload.windowData,
      payload.name,
      payload.index
    );
  } else if (type === "GET_ACTIVE_MAPPINGS") {
    sendResponse(Array.from(activeWindows.entries()));
  } else if (type === "GET_RESTORING_STATUS") {
    sendResponse(activeRestorations > 0);
  } else if (type === "FORCE_SYNC_ACTIVE_WINDOW") {
    handleForceSync(payload.windowId);
  } else if (type === "CREATE_NEW_WINDOW_IN_WORKSPACE") {
    handleCreateNewWindowInWorkspace(payload.workspaceId, payload.name);
  } else if (type === "CLOSE_PHYSICAL_TABS") {
    handleClosePhysicalTabs(payload.urls, payload.internalWindowId);
  } else if (type === "CLAIM_WINDOW") {
    if (activeRestorations === 0) {
      getWorkspaceWindowIndex(
        payload.workspaceId,
        payload.internalWindowId
      ).then((idx) => {
        activeWindows.set(payload.windowId, {
          workspaceId: payload.workspaceId,
          internalWindowId: payload.internalWindowId,
          workspaceName: payload.name,
          index: idx,
        });
        saveActiveWindowsToStorage();
      });
    }
  }
  return true;
});

async function handleOpenWorkspace(
  workspaceId: string,
  windowsToOpen: any[],
  name: string
) {
  if (!windowsToOpen || windowsToOpen.length === 0) {
    await handleCreateNewWindowInWorkspace(workspaceId, name);
    return;
  }
  for (let i = 0; i < windowsToOpen.length; i++) {
    await handleOpenSpecificWindow(workspaceId, windowsToOpen[i], name, i + 1);
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
      try {
        await chrome.windows.update(chromeId, { focused: true });
        return;
      } catch (e) {
        activeWindows.delete(chromeId);
        await saveActiveWindowsToStorage();
      }
    }
  }
  activeRestorations++;
  try {
    const safeTabs = winData.tabs || [];
    const urls = safeTabs
      .map((t: any) => t.url)
      .filter((u: string) => u && !isDash(u));
    const newWin = await chrome.windows.create({
      url: ["dashboard.html", ...urls],
      incognito: winData.isIncognito || false,
    });
    if (newWin?.id) {
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
      if (urls.length > 0) await waitForWindowToLoad(winId);
      lockedWindowIds.delete(winId);
    }
  } finally {
    activeRestorations--;
  }
}

async function handleCreateNewWindowInWorkspace(
  workspaceId: string,
  name: string
) {
  activeRestorations++;
  try {
    const newWin = await chrome.windows.create({ url: "dashboard.html" });
    if (newWin?.id) {
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
      await saveToFirestore(winId, false);
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
      const data = snap.data();
      const urls = (data.tabs || [])
        .map((t: any) => t.url)
        .filter((u: string) => u && !isDash(u));
      const currentTabs = await chrome.tabs.query({ windowId });
      for (const url of urls) await chrome.tabs.create({ windowId, url });
      for (const tab of currentTabs) {
        if (tab.id && !isDash(tab.url) && !tab.pinned)
          await chrome.tabs.remove(tab.id);
      }
      await updateWindowGrouping(windowId, mapping);
    }
  } finally {
    await waitForWindowToLoad(windowId);
    lockedWindowIds.delete(windowId);
    activeRestorations--;
    saveToFirestore(windowId, false);
  }
}

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
    const tabIds = tabs
      .filter((t) => t.id && urls.includes(t.url || ""))
      .map((t) => t.id as number);
    if (tabIds.length > 0) await chrome.tabs.remove(tabIds);
  } else if (internalWindowId === "global") {
    const allTabs = await chrome.tabs.query({});
    const tabIds = allTabs
      .filter(
        (t) =>
          t.id && urls.includes(t.url || "") && !activeWindows.has(t.windowId)
      )
      .map((t) => t.id as number);
    if (tabIds.length > 0) await chrome.tabs.remove(tabIds);
  }
}

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
    return snap.docs.findIndex((d) => d.id === internalWindowId) + 1 || 1;
  } catch (e) {
    return 1;
  }
}

async function waitForWindowToLoad(windowId: number) {
  return new Promise<void>((resolve) => {
    const check = async () => {
      try {
        const tabs = await chrome.tabs.query({ windowId });
        if (!tabs.some((t) => t.status === "loading")) resolve();
        else setTimeout(check, 500);
      } catch (e) {
        resolve();
      }
    };
    setTimeout(resolve, 10000);
    check();
  });
}
