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

// --- TYPES ---
interface TabData {
  uid: string; // Unikt ID for hver instans
  title: string;
  url: string;
  favIconUrl: string;
  isIncognito?: boolean;
}

interface WinMapping {
  workspaceId: string;
  internalWindowId: string;
  workspaceName: string;
  index: number;
}

interface TrackerData {
  uid: string;
  url: string;
}

// --- STATE ---
let activeRestorations = 0;
let restorationStatus = "";
let lastDashboardTime = 0;
let activeWindows = new Map<number, WinMapping>();
const lockedWindowIds = new Set<number>();

// VIGTIGT: Tracker nu både UID og URL.
// tabId (Chrome) -> { uid: string (Firestore), url: string }
let inboxTabTracker = new Map<number, TrackerData>();

let globalState = {
  profiles: [] as any[],
  items: [] as any[],
  inbox: null as any,
  workspaceWindows: {} as Record<string, any[]>,
};

const activeListeners = new Map<string, () => void>();

const isDash = (url?: string) => url?.includes("dashboard.html");

function broadcast(type: string, payload: any) {
  chrome.runtime.sendMessage({ type, payload }).catch(() => {});
}

function updateRestorationStatus(status: string) {
  restorationStatus = status;
  broadcast("RESTORATION_STATUS_CHANGE", status);
}

// --- FIREBASE LISTENERS ---
function startFirebaseListeners() {
  if (!activeListeners.has("profiles")) {
    const unsub = onSnapshot(collection(db, "profiles"), (snap) => {
      globalState.profiles = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      broadcast("STATE_UPDATED", { profiles: globalState.profiles });
    });
    activeListeners.set("profiles", unsub);
  }

  if (!activeListeners.has("items")) {
    const unsub = onSnapshot(collection(db, "items"), (snap) => {
      globalState.items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      broadcast("STATE_UPDATED", { items: globalState.items });
    });
    activeListeners.set("items", unsub);
  }

  if (!activeListeners.has("inbox")) {
    const unsub = onSnapshot(doc(db, "inbox_data", "global"), (snap) => {
      globalState.inbox = snap.exists()
        ? { id: snap.id, ...snap.data() }
        : { tabs: [] };
      broadcast("STATE_UPDATED", { inbox: globalState.inbox });
    });
    activeListeners.set("inbox", unsub);
  }
}

auth.onAuthStateChanged((user) => {
  if (user) {
    startFirebaseListeners();
  } else {
    activeListeners.forEach((unsub) => unsub());
    activeListeners.clear();
  }
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
        // Vinduet findes ikke fysisk mere, marker som inaktivt i DB
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

  rebuildInboxTracker();
}

// Hjælpefunktion: Forsøger at matche fysiske tabs med DB tabs for at genskabe trackeren
async function rebuildInboxTracker() {
  const allWindows = await chrome.windows.getAll();
  const unmappedWindows = allWindows.filter(
    (w) => w.id && !activeWindows.has(w.id) && !lockedWindowIds.has(w.id)
  );

  if (unmappedWindows.length === 0) return;

  const inboxSnap = await getDoc(doc(db, "inbox_data", "global"));
  if (!inboxSnap.exists()) return;
  const dbTabs = (inboxSnap.data().tabs || []) as TabData[];

  const availableDbTabs = [...dbTabs];

  for (const w of unmappedWindows) {
    if (w.id) {
      const tabs = await chrome.tabs.query({ windowId: w.id });
      for (const t of tabs) {
        if (t.id && t.url && !isDash(t.url) && !t.url.startsWith("chrome")) {
          // Find en matchende tab i DB (samme URL)
          const matchIndex = availableDbTabs.findIndex(
            (dt) => dt.url === t.url && dt.isIncognito === t.incognito
          );

          if (matchIndex !== -1) {
            const matchedDbTab = availableDbTabs[matchIndex];
            inboxTabTracker.set(t.id, {
              uid: matchedDbTab.uid,
              url: matchedDbTab.url,
            });
            availableDbTabs.splice(matchIndex, 1);
          }
        }
      }
    }
  }
}

loadAndVerifyWindows();

async function updateWindowGrouping(
  windowId: number,
  mapping: WinMapping | null
) {
  try {
    let groupName = "INBOX";
    let color = "grey";

    if (mapping) {
      groupName = `${mapping.workspaceName.toUpperCase()} (${mapping.index})`;
      color = "blue";
    }

    const tabs = await chrome.tabs.query({ windowId });
    const tabsToGroup = tabs
      .filter((t) => !t.pinned && t.id && !isDash(t.url))
      .map((t) => t.id as number);

    if (tabsToGroup.length === 0) return;

    const groups = await chrome.tabGroups.query({ windowId });
    const existingGroup = groups.find((g) => g.title === groupName);
    const safeTabIds = tabsToGroup as [number, ...number[]];

    if (existingGroup) {
      await chrome.tabs.group({
        tabIds: safeTabIds,
        groupId: existingGroup.id,
      });
      if (existingGroup.color !== color) {
        await chrome.tabGroups.update(existingGroup.id, {
          color: color as any,
        });
      }
    } else {
      const groupId = (await chrome.tabs.group({
        tabIds: safeTabIds,
      })) as number;
      await chrome.tabGroups.update(groupId, {
        title: groupName,
        color: color as any,
        collapsed: false,
      });
    }
  } catch (e) {}
}

async function registerNewInboxWindow(windowId: number) {
  const tabs = await chrome.tabs.query({ windowId });
  const tabsToAdd: TabData[] = [];

  const inboxDocRef = doc(db, "inbox_data", "global");
  const inboxSnap = await getDoc(inboxDocRef);
  let currentTabs = inboxSnap.exists() ? inboxSnap.data().tabs || [] : [];

  for (const t of tabs) {
    if (t.id && t.url && !isDash(t.url) && !t.url.startsWith("chrome")) {
      if (!inboxTabTracker.has(t.id)) {
        const newUid = crypto.randomUUID();
        inboxTabTracker.set(t.id, {
          uid: newUid,
          url: t.url,
        });

        tabsToAdd.push({
          uid: newUid,
          title: t.title || "Ny fane",
          url: t.url,
          favIconUrl: t.favIconUrl || "",
          isIncognito: t.incognito,
        });
      }
    }
  }

  if (tabsToAdd.length > 0) {
    await updateDoc(inboxDocRef, {
      tabs: [...currentTabs, ...tabsToAdd],
      lastUpdate: serverTimestamp(),
    });
  }
}

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

    if (mapping) {
      // --- WORKSPACE LOGIK ---
      if (!windowExists) return;
      const tabs = await chrome.tabs.query({ windowId });

      const validTabs: TabData[] = tabs
        .filter((t) => t.url && !t.url.startsWith("chrome") && !isDash(t.url))
        .map((t) => ({
          uid: crypto.randomUUID(),
          title: t.title || "Ny fane",
          url: t.url || "",
          favIconUrl: t.favIconUrl || "",
          isIncognito: false,
        }));

      await updateWindowGrouping(windowId, mapping);

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
      // --- INBOX LOGIK ---
      // Kun visual grouping. Gem sker via events.
      if (windowExists) {
        const win = await chrome.windows.get(windowId);
        if (!win.incognito) await updateWindowGrouping(windowId, null);
      }
    }
  } catch (e) {
    console.error("Save error:", e);
  }
}

// --- EVENT LISTENERS ---

// 1. OnUpdated: Håndter URL ændringer via UID
chrome.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  if (change.status === "complete" && tab.windowId) {
    // Workspace -> Fuld sync
    if (activeWindows.has(tab.windowId)) {
      saveToFirestore(tab.windowId, false);
    }
    // Inbox -> Opdater specifik UID
    else if (!tab.url?.startsWith("chrome") && !isDash(tab.url)) {
      const tracked = inboxTabTracker.get(tabId);
      const newUrl = tab.url || "";

      if (tracked) {
        if (tracked.url !== newUrl) {
          const inboxRef = doc(db, "inbox_data", "global");
          const snap = await getDoc(inboxRef);

          if (snap.exists()) {
            const data = snap.data();
            let tabs: TabData[] = data.tabs || [];

            const idx = tabs.findIndex((t) => t.uid === tracked.uid);

            if (idx !== -1) {
              tabs[idx].url = newUrl;
              tabs[idx].title = tab.title || "Ny Fane";
              tabs[idx].favIconUrl = tab.favIconUrl || "";

              await updateDoc(inboxRef, {
                tabs,
                lastUpdate: serverTimestamp(),
              });
              inboxTabTracker.set(tabId, { uid: tracked.uid, url: newUrl });
            }
          }
        }
      } else {
        // Ny fane
        const newUid = crypto.randomUUID();
        inboxTabTracker.set(tabId, { uid: newUid, url: newUrl });

        const inboxRef = doc(db, "inbox_data", "global");
        const snap = await getDoc(inboxRef);
        let tabs = snap.exists() ? snap.data().tabs || [] : [];

        tabs.push({
          uid: newUid,
          title: tab.title || "Ny Fane",
          url: newUrl,
          favIconUrl: tab.favIconUrl || "",
          isIncognito: tab.incognito,
        });

        await updateDoc(inboxRef, { tabs, lastUpdate: serverTimestamp() });
      }
    }
  }
});

// 2. OnRemoved: Slet specifik UID - MEN KUN HVIS VINDUET IKKE LUKKER
chrome.tabs.onRemoved.addListener(async (tabId, info) => {
  // Hvis det er et Workspace-vindue
  if (activeWindows.has(info.windowId)) {
    if (!info.isWindowClosing) saveToFirestore(info.windowId, true);
  }
  // Hvis det er et Inbox-vindue (normal eller incognito)
  else {
    // Vi rydder ALTID op i trackeren for at undgå memory leaks
    const tracked = inboxTabTracker.get(tabId);
    inboxTabTracker.delete(tabId);

    // MEN vi sletter KUN fra databasen, hvis det IKKE er fordi vinduet lukker.
    // "isWindowClosing" er true, hvis brugeren lukkede hele vinduet.
    if (tracked && !info.isWindowClosing) {
      const inboxRef = doc(db, "inbox_data", "global");
      const snap = await getDoc(inboxRef);

      if (snap.exists()) {
        const data = snap.data();
        let tabs: TabData[] = data.tabs || [];

        // Filtrer baseret på UID
        const newTabs = tabs.filter((t) => t.uid !== tracked.uid);

        if (newTabs.length !== tabs.length) {
          await updateDoc(inboxRef, {
            tabs: newTabs,
            lastUpdate: serverTimestamp(),
          });
        }
      }
    }
  }
});

chrome.windows.onCreated.addListener(async (win) => {
  if (win.id && !activeWindows.has(win.id)) {
    setTimeout(() => registerNewInboxWindow(win.id!), 1000);
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

// --- MESSAGING ---
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const { type, payload } = msg;

  if (type === "GET_WINDOW_NAME") {
    const mapping = activeWindows.get(payload.windowId);
    sendResponse({ name: mapping ? mapping.workspaceName : "Inbox" });
    return true;
  }

  if (type === "GET_LATEST_STATE") {
    sendResponse(globalState);
    return true;
  }

  if (type === "WATCH_WORKSPACE") {
    const workspaceId = payload;
    if (activeListeners.has(`workspace_${workspaceId}`)) {
      const cached = globalState.workspaceWindows[workspaceId];
      if (cached)
        broadcast("WORKSPACE_WINDOWS_UPDATED", {
          workspaceId,
          windows: cached,
        });
    } else {
      const unsub = onSnapshot(
        collection(db, "workspaces_data", workspaceId, "windows"),
        (snap) => {
          const windows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          globalState.workspaceWindows[workspaceId] = windows;
          broadcast("WORKSPACE_WINDOWS_UPDATED", { workspaceId, windows });
        }
      );
      activeListeners.set(`workspace_${workspaceId}`, unsub);
    }
    return true;
  }

  if (type === "OPEN_WORKSPACE")
    handleOpenWorkspace(payload.workspaceId, payload.windows, payload.name);
  if (type === "OPEN_SPECIFIC_WINDOW")
    handleOpenSpecificWindow(
      payload.workspaceId,
      payload.windowData,
      payload.name,
      payload.index
    );
  if (type === "GET_ACTIVE_MAPPINGS")
    sendResponse(Array.from(activeWindows.entries()));

  if (type === "GET_RESTORING_STATUS") sendResponse(restorationStatus);

  if (type === "FORCE_SYNC_ACTIVE_WINDOW") handleForceSync(payload.windowId);
  if (type === "CREATE_NEW_WINDOW_IN_WORKSPACE")
    handleCreateNewWindowInWorkspace(payload.workspaceId, payload.name);

  if (type === "CLOSE_PHYSICAL_TABS") {
    handleClosePhysicalTabs(payload.urls, payload.internalWindowId);
  }

  if (type === "CLAIM_WINDOW") {
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

// --- HELPERS ---
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
    updateRestorationStatus(
      `Klargør vindue ${i + 1} af ${windowsToOpen.length}...`
    );
    await handleOpenSpecificWindow(workspaceId, windowsToOpen[i], name, i + 1);
  }
}

async function handleOpenSpecificWindow(
  workspaceId: string,
  winData: any,
  name: string,
  index: number
) {
  updateRestorationStatus("Tjekker eksisterende vinduer...");
  for (const [chromeId, map] of activeWindows.entries()) {
    if (
      map.workspaceId === workspaceId &&
      map.internalWindowId === winData.id
    ) {
      try {
        await chrome.windows.update(chromeId, { focused: true });
        updateRestorationStatus("");
        return;
      } catch (e) {
        activeWindows.delete(chromeId);
        await saveActiveWindowsToStorage();
      }
    }
  }

  activeRestorations++;
  try {
    const urls = (winData.tabs || [])
      .map((t: any) => t.url)
      .filter((u: string) => u && !isDash(u));

    updateRestorationStatus(`Opretter vindue med ${urls.length} faner...`);

    const dashUrl = `dashboard.html?workspaceId=${workspaceId}&windowId=${winData.id}`;

    const newWin = await chrome.windows.create({
      url: [dashUrl, ...urls],
      incognito: false,
    });
    if (newWin?.id) {
      const winId = newWin.id;
      lockedWindowIds.add(winId);

      updateRestorationStatus("Initialiserer...");
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

      updateRestorationStatus("Organiserer...");
      await updateWindowGrouping(winId, mapping);

      if (urls.length > 0) {
        await waitForWindowToLoad(winId);
      }
      lockedWindowIds.delete(winId);
    }
  } finally {
    activeRestorations--;
    if (activeRestorations === 0) updateRestorationStatus("");
  }
}

async function handleCreateNewWindowInWorkspace(
  workspaceId: string,
  name: string
) {
  activeRestorations++;
  updateRestorationStatus("Opretter nyt tomt workspace...");
  try {
    const dashUrl = `dashboard.html?workspaceId=${workspaceId}&newWindow=true`;

    const newWin = await chrome.windows.create({ url: dashUrl });
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
    if (activeRestorations === 0) updateRestorationStatus("");
  }
}

async function handleForceSync(windowId: number) {
  const mapping = activeWindows.get(windowId);
  if (!mapping) return;
  lockedWindowIds.add(windowId);
  activeRestorations++;
  updateRestorationStatus("Forbereder synkronisering...");
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

      updateRestorationStatus(`Genindlæser ${urls.length} faner...`);
      for (const url of urls) await chrome.tabs.create({ windowId, url });

      updateRestorationStatus("Fjerner gamle faner...");
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
    if (activeRestorations === 0) updateRestorationStatus("");
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
    const allWindows = await chrome.windows.getAll();
    const unmappedIds = allWindows
      .filter((w) => w.id && !activeWindows.has(w.id))
      .map((w) => w.id as number);

    for (const winId of unmappedIds) {
      const tabs = await chrome.tabs.query({ windowId: winId });
      // Hvis du kun vil slette specifikke, skal du sende UIDs med ned her.
      const tabIds = tabs
        .filter((t) => t.id && urls.includes(t.url || ""))
        .map((t) => t.id as number);

      if (tabIds.length > 0) await chrome.tabs.remove(tabIds);
    }
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
    let attempts = 0;
    const maxAttempts = 32;

    const check = async () => {
      try {
        const tabs = await chrome.tabs.query({ windowId });
        const total = tabs.length - 1;
        const loadingCount = tabs.filter((t) => t.status === "loading").length;
        const completeCount = total - loadingCount;

        updateRestorationStatus(
          `Indlæser indhold (${completeCount}/${total})...`
        );

        if (loadingCount === 0 || attempts >= maxAttempts) {
          resolve();
        } else {
          attempts++;
          setTimeout(check, 250);
        }
      } catch (e) {
        resolve();
      }
    };
    check();
  });
}
