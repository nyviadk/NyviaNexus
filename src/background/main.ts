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
 * GRUPPERING: Navngiver gruppen præcist.
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
 * isRemoval flagget sikrer, at vi kun sletter vinduet, når en fane faktisk lukkes.
 */
async function saveToFirestore(windowId: number, isRemoval: boolean = false) {
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

    // NY LOGIK: Slet kun vindue hvis det er tomt OG det er en aktiv fjernelse (isRemoval)
    if (mapping && validTabs.length === 0 && isRemoval) {
      console.log(
        "[Nexus] Sidste fane lukket. Sletter vindue data og lukker vindue."
      );
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
    saveToFirestore(tab.windowId, false);
});

chrome.tabs.onRemoved.addListener((_id, info) => {
  if (!info.isWindowClosing) saveToFirestore(info.windowId, true);
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
  else if (type === "GET_RESTORING_STATUS")
    _sendResponse(activeRestorations > 0);
  else if (type === "FORCE_SYNC_ACTIVE_WINDOW")
    handleForceSync(payload.windowId);
  else if (type === "CREATE_NEW_WINDOW_IN_WORKSPACE")
    handleCreateNewWindowInWorkspace(payload.workspaceId, payload.name);
  else if (type === "CLOSE_PHYSICAL_TABS")
    handleClosePhysicalTabs(payload.urls, payload.internalWindowId);
  else if (type === "CLAIM_WINDOW") {
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
    const index = snap.docs.findIndex((d) => d.id === internalWindowId);
    return index !== -1 ? index + 1 : 1;
  } catch (e) {
    return 1;
  }
}

async function waitForWindowToLoad(windowId: number) {
  return new Promise<void>((resolve) => {
    const check = async () => {
      try {
        const tabs = await chrome.tabs.query({ windowId });
        const stillLoading = tabs.some((t) => t.status === "loading");
        if (!stillLoading) resolve();
        else setTimeout(check, 500);
      } catch (e) {
        resolve();
      }
    };
    setTimeout(resolve, 10000);
    check();
  });
}

async function handleOpenSpecificWindow(
  workspaceId: string,
  winData: any,
  name: string,
  index: number
) {
  // 1. Tjek om vinduet allerede er åbent
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
    // FIX: Håndter hvis winData.tabs er undefined eller null
    const safeTabs = winData.tabs || [];
    const urls = safeTabs
      .map((t: any) => t.url)
      .filter((u: string) => u && !isDash(u));

    // Altid åbn dashboard.html, selvom der ikke er andre tabs
    const finalUrls = ["dashboard.html", ...urls];

    const newWin = await chrome.windows.create({
      url: finalUrls,
      incognito: winData.isIncognito || false,
    });

    if (newWin && newWin.id) {
      const winId = newWin.id;
      lockedWindowIds.add(winId);

      // Vent på at dashboard tab'en oprettes og pin den
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

      // Kun vent på load hvis der rent faktisk er URL'er udover dashboardet
      if (urls.length > 0) {
        await waitForWindowToLoad(winId);
      }

      lockedWindowIds.delete(winId);
    }
  } catch (err) {
    console.error("[Nexus] Fejl ved åbning af vindue:", err);
  } finally {
    activeRestorations--;
  }
}

async function handleOpenWorkspace(
  workspaceId: string,
  windowsToOpen: any[],
  name: string
) {
  // Hvis der slet ikke er nogen vinduer gemt, så opret det første
  if (!windowsToOpen || windowsToOpen.length === 0) {
    console.log("[Nexus] Ingen vinduer fundet, opretter det første i " + name);
    await handleCreateNewWindowInWorkspace(workspaceId, name);
    return;
  }

  // Ellers åbn dem der findes
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

      // Vent lidt på at tab'en er klar, og pin den
      const tabs = await chrome.tabs.query({ windowId: winId });
      if (tabs[0]?.id) await chrome.tabs.update(tabs[0].id, { pinned: true });

      const internalId = `win_${Date.now()}`;

      // Find næste index
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

      // FORCE SYNC: Gem det med det samme så det dukker op på dashboardet
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
      // FIX: Sikr dig at tabs eksisterer
      const urls = (data.tabs || [])
        .map((t: any) => t.url)
        .filter((u: string) => u && !isDash(u));

      const currentTabs = await chrome.tabs.query({ windowId });

      // Opret nye tabs fra data
      for (const url of urls) {
        await chrome.tabs.create({ windowId, url });
      }

      // Fjern gamle tabs (undtagen dashboard/pinned)
      for (const tab of currentTabs) {
        if (tab.id && !isDash(tab.url) && !tab.pinned) {
          await chrome.tabs.remove(tab.id);
        }
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
