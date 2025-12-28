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
import { AiService } from "../services/aiService";

// --- TYPES ---
interface TabData {
  uid: string;
  title: string;
  url: string;
  favIconUrl: string;
  isIncognito?: boolean;
  aiData?: any;
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

// VIGTIGT: Debounce Set for at forhindre kø-spam
const recentQueueAdds = new Set<string>();

let tabTracker = new Map<number, TrackerData>();

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
  console.log("🔥 Starting Firebase Listeners...");
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
    loadAndVerifyWindows();
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
  try {
    const data = await chrome.storage.local.get("nexus_active_windows");
    if (
      data?.nexus_active_windows &&
      Array.isArray(data.nexus_active_windows)
    ) {
      const rawMappings = data.nexus_active_windows as [number, WinMapping][];
      activeWindows.clear();
      for (const [winId, mapping] of rawMappings) {
        try {
          await chrome.windows.get(winId);
          activeWindows.set(winId, mapping);
        } catch (e) {
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
    await rebuildTabTracker();

    // Start Queue Loop
    processAiQueue().catch(console.error);
  } catch (error) {
    console.error("Critical error in loadAndVerifyWindows:", error);
  }
}

async function rebuildTabTracker() {
  try {
    const allWindows = await chrome.windows.getAll();
    const unmappedWindows = allWindows.filter(
      (w) => w.id && !activeWindows.has(w.id) && !lockedWindowIds.has(w.id)
    );

    const inboxSnap = await getDoc(doc(db, "inbox_data", "global"));
    if (inboxSnap.exists()) {
      const dbTabs = (inboxSnap.data().tabs || []) as TabData[];
      const availableDbTabs = [...dbTabs];

      for (const w of unmappedWindows) {
        if (!w.id) continue;
        const tabs = await chrome.tabs.query({ windowId: w.id });
        for (const t of tabs) {
          if (t.id && t.url && !isDash(t.url) && !t.url.startsWith("chrome")) {
            const matchIndex = availableDbTabs.findIndex(
              (dt) => dt.url === t.url && dt.isIncognito === t.incognito
            );
            if (matchIndex !== -1) {
              const matchedDbTab = availableDbTabs[matchIndex];
              tabTracker.set(t.id, {
                uid: matchedDbTab.uid,
                url: matchedDbTab.url,
              });
              availableDbTabs.splice(matchIndex, 1);
            }
          }
        }
      }
    }

    for (const [winId, mapping] of activeWindows.entries()) {
      const winSnap = await getDoc(
        doc(
          db,
          "workspaces_data",
          mapping.workspaceId,
          "windows",
          mapping.internalWindowId
        )
      );
      if (winSnap.exists()) {
        const dbTabs = (winSnap.data().tabs || []) as TabData[];
        const availableDbTabs = [...dbTabs];
        const tabs = await chrome.tabs.query({ windowId: winId });
        for (const t of tabs) {
          if (t.id && t.url && !isDash(t.url)) {
            const matchIndex = availableDbTabs.findIndex(
              (dt) => dt.url === t.url
            );
            if (matchIndex !== -1) {
              const matchedDbTab = availableDbTabs[matchIndex];
              tabTracker.set(t.id, {
                uid: matchedDbTab.uid,
                url: matchedDbTab.url,
              });
              availableDbTabs.splice(matchIndex, 1);
            }
          }
        }
      }
    }
  } catch (e) {
    console.error("Error rebuilding tab tracker:", e);
  }
}

// --- AI QUEUE SYSTEM ---

interface QueueItem {
  uid: string;
  url: string;
  title: string;
  tabId: number;
  attempts: number;
}

interface LockData {
  isProcessing: boolean;
  timestamp: number;
}

interface StorageResponse {
  [key: string]: any;
  nexus_ai_queue?: QueueItem[];
  nexus_ai_lock?: LockData;
  nexus_ai_last_call?: number;
}

const AI_STORAGE_KEY = "nexus_ai_queue";
const AI_LOCK_KEY = "nexus_ai_lock";
const AI_LAST_CALL_KEY = "nexus_ai_last_call";

async function extractMetadata(tabId: number): Promise<string> {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const title = document.title || "";
        const metaDesc =
          document
            .querySelector('meta[name="description"]')
            ?.getAttribute("content") || "";
        const ogDesc =
          document
            .querySelector('meta[property="og:description"]')
            ?.getAttribute("content") || "";
        const h1 = document.querySelector("h1")?.innerText || "";
        return `${title} | ${metaDesc} | ${ogDesc} | ${h1}`;
      },
    });
    return result[0]?.result || "";
  } catch (e) {
    return "";
  }
}

async function processAiQueue() {
  if (activeRestorations > 0) {
    chrome.alarms.create("retry_ai_queue", { when: Date.now() + 5000 });
    return;
  }

  try {
    // 1. Initial Read
    const storage = (await chrome.storage.local.get([
      AI_STORAGE_KEY,
      AI_LOCK_KEY,
      AI_LAST_CALL_KEY,
    ])) as StorageResponse;

    let queue: QueueItem[] = Array.isArray(storage[AI_STORAGE_KEY])
      ? storage[AI_STORAGE_KEY]
      : [];
    const lock = storage[AI_LOCK_KEY];
    const lastCall: number = storage[AI_LAST_CALL_KEY] || 0;

    if (queue.length === 0) return;

    const now = Date.now();
    if (lock?.isProcessing && now - lock.timestamp < 30000) return;

    // Rate limit
    if (now - lastCall < 2000) {
      const delay = 2000 - (now - lastCall);
      chrome.alarms.create("process_ai_next", { when: now + delay });
      return;
    }

    // Lock
    await chrome.storage.local.set({
      [AI_LOCK_KEY]: { isProcessing: true, timestamp: now },
    });

    const item = queue[0];
    broadcast("AI_STATUS_UPDATE", { uid: item.uid, status: "processing" });

    // Hent data
    let metadata = "";
    try {
      await chrome.tabs.get(item.tabId);
      metadata = await extractMetadata(item.tabId);
    } catch (e) {}

    // Kør AI
    const result = await AiService.analyzeTab(item.title, item.url, metadata);

    if (result) {
      console.log(`✅ AI Categorized: ${result.category}`);
      const aiData = {
        status: "completed",
        category: result.category,
        confidence: result.confidence,
        reasoning: result.reasoning,
        lastChecked: Date.now(),
      };

      const inboxRef = doc(db, "inbox_data", "global");
      const inboxSnap = await getDoc(inboxRef);

      if (inboxSnap.exists()) {
        const tabs = inboxSnap.data().tabs || [];
        const idx = tabs.findIndex((t: any) => t.uid === item.uid);
        if (idx !== -1) {
          tabs[idx].aiData = aiData;
          await updateDoc(inboxRef, { tabs });
          console.log("💾 Firestore successfully updated!");
        }
      }
    } else {
      console.log("⚠️ AI Analysis failed or returned null");
    }

    // --- CRITICAL FIX: RE-FETCH QUEUE TO AVOID RACE CONDITIONS ---
    const freshStorage = (await chrome.storage.local.get(
      AI_STORAGE_KEY
    )) as StorageResponse;
    const freshQueue = Array.isArray(freshStorage[AI_STORAGE_KEY])
      ? freshStorage[AI_STORAGE_KEY]
      : [];

    // Vi fjerner KUN det item vi lige har behandlet (og eventuelle dubletter af det)
    const updatedQueue = freshQueue.filter((q) => q.uid !== item.uid);

    await chrome.storage.local.set({
      [AI_STORAGE_KEY]: updatedQueue,
      [AI_LOCK_KEY]: { isProcessing: false, timestamp: Date.now() },
      [AI_LAST_CALL_KEY]: Date.now(),
    });

    // Recursion
    if (updatedQueue.length > 0) {
      chrome.alarms.create("process_ai_next", { when: Date.now() + 100 });
    }
  } catch (error) {
    console.error("AI Queue Error", error);
    await chrome.storage.local.set({
      [AI_LOCK_KEY]: { isProcessing: false, timestamp: 0 },
    });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "process_ai_next" || alarm.name === "retry_ai_queue") {
    processAiQueue();
  }
});

// --- SAFE QUEUE ADDER (DEBOUNCED) ---
async function addToAiQueue(items: QueueItem[]) {
  try {
    const data = (await chrome.storage.local.get(
      AI_STORAGE_KEY
    )) as StorageResponse;
    const currentQueue: QueueItem[] = Array.isArray(data[AI_STORAGE_KEY])
      ? data[AI_STORAGE_KEY]
      : [];

    // 1. Filtrer dubletter der allerede er i køen
    // 2. Filtrer items der "lige" er blevet tilføjet (memory debounce)
    const newItems = items.filter((i) => {
      const inQueue = currentQueue.some((q) => q.uid === i.uid);
      const recentlyAdded = recentQueueAdds.has(i.uid);
      return !inQueue && !recentlyAdded;
    });

    if (newItems.length === 0) {
      // console.log("⚠️ Items skipped (duplicate or debounced)");
      return;
    }

    console.log(`📥 Adding ${newItems.length} items to AI Queue`);

    // Opdater memory set
    newItems.forEach((i) => {
      recentQueueAdds.add(i.uid);
      // Frigiv UID efter 10 sekunder
      setTimeout(() => recentQueueAdds.delete(i.uid), 10000);
    });

    const updatedQueue = [...currentQueue, ...newItems];
    await chrome.storage.local.set({ [AI_STORAGE_KEY]: updatedQueue });

    processAiQueue();
  } catch (e) {
    console.error("Error adding to AI queue:", e);
  }
}

// --- STANDARD LOGIC ---
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

function getOrAssignUid(tabId: number, url: string): string {
  const tracked = tabTracker.get(tabId);
  if (tracked) {
    if (tracked.url !== url) {
      tabTracker.set(tabId, { uid: tracked.uid, url });
    }
    return tracked.uid;
  }
  const newUid = crypto.randomUUID();
  tabTracker.set(tabId, { uid: newUid, url });
  return newUid;
}

async function registerNewInboxWindow(windowId: number) {
  if (activeRestorations > 0) return;

  const tabs = await chrome.tabs.query({ windowId });
  const tabsToAdd: TabData[] = [];

  const inboxDocRef = doc(db, "inbox_data", "global");
  const inboxSnap = await getDoc(inboxDocRef);
  let currentTabs = inboxSnap.exists() ? inboxSnap.data().tabs || [] : [];

  for (const t of tabs) {
    if (t.id && t.url && !isDash(t.url) && !t.url.startsWith("chrome")) {
      const uid = getOrAssignUid(t.id, t.url);
      if (!currentTabs.some((ct: any) => ct.uid === uid)) {
        tabsToAdd.push({
          uid: uid,
          title: t.title || "Ny fane",
          url: t.url,
          favIconUrl: t.favIconUrl || "",
          isIncognito: t.incognito,
          aiData: { status: "pending" },
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
      if (!windowExists) return;
      const tabs = await chrome.tabs.query({ windowId });

      const validTabs: TabData[] = [];
      for (const t of tabs) {
        if (t.id && t.url && !t.url.startsWith("chrome") && !isDash(t.url)) {
          const uid = getOrAssignUid(t.id, t.url);
          validTabs.push({
            uid: uid,
            title: t.title || "Ny fane",
            url: t.url,
            favIconUrl: t.favIconUrl || "",
            isIncognito: false,
          });
        }
      }

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
      if (windowExists) {
        const win = await chrome.windows.get(windowId);
        if (!win.incognito) await updateWindowGrouping(windowId, null);
      }
    }
  } catch (e) {
    console.error("Save error:", e);
  }
}

chrome.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  if (activeRestorations > 0) return;

  if (change.status === "complete" && tab.windowId) {
    if (activeWindows.has(tab.windowId)) {
      saveToFirestore(tab.windowId, false);
    } else if (!tab.url?.startsWith("chrome") && !isDash(tab.url)) {
      const url = tab.url || "";
      const uid = getOrAssignUid(tabId, url);

      const inboxRef = doc(db, "inbox_data", "global");
      const snap = await getDoc(inboxRef);
      if (snap.exists()) {
        const data = snap.data();
        let tabs: TabData[] = data.tabs || [];
        const idx = tabs.findIndex((t) => t.uid === uid);

        let needsUpdate = false;

        if (idx !== -1) {
          const oldUrl = tabs[idx].url; // GEM GAMMEL URL
          const oldTitle = tabs[idx].title;

          // Opdater data i memory
          tabs[idx].url = url;
          tabs[idx].title = tab.title || "Ny Fane";
          tabs[idx].favIconUrl = tab.favIconUrl || "";

          // Tjek om der er ændringer
          if (oldUrl !== url || oldTitle !== tab.title) {
            needsUpdate = true;
            // Hvis URL er ændret, reset AI status
            if (oldUrl !== url) {
              console.log(
                "🔄 URL changed, resetting AI status for:",
                tab.title
              );
              tabs[idx].aiData = { status: "pending" };
            }
          }
        } else {
          // Ny fane
          tabs.push({
            uid: uid,
            title: tab.title || "Ny Fane",
            url: url,
            favIconUrl: tab.favIconUrl || "",
            isIncognito: tab.incognito,
            aiData: { status: "pending" },
          });
          needsUpdate = true;
        }

        if (needsUpdate) {
          await updateDoc(inboxRef, {
            tabs,
            lastUpdate: serverTimestamp(),
          });

          // --- TRIGGER AI AUTOMATISK ---
          const currentTab = idx !== -1 ? tabs[idx] : tabs[tabs.length - 1];
          // Kør kun hvis status ikke er completed (eller lige er blevet reset til pending)
          // TJEK OGSÅ AT VI IKKE ER PROCESSING I FORVEJEN
          if (
            currentTab.aiData?.status !== "completed" &&
            currentTab.aiData?.status !== "processing"
          ) {
            // DEBOUNCE CHECK HAPPENS INSIDE addToAiQueue
            console.log("🤖 Attempting to queue AI for tab:", tab.title);
            addToAiQueue([
              {
                uid: uid,
                url: url,
                title: tab.title || "Ny Fane",
                tabId: tabId,
                attempts: 0,
              },
            ]);
          }
        }
      }
    }
  }
});

chrome.tabs.onRemoved.addListener(async (tabId, info) => {
  if (activeRestorations > 0) return;

  const tracked = tabTracker.get(tabId);
  tabTracker.delete(tabId);

  if (activeWindows.has(info.windowId)) {
    if (!info.isWindowClosing) saveToFirestore(info.windowId, true);
  } else {
    if (tracked && !info.isWindowClosing) {
      const inboxRef = doc(db, "inbox_data", "global");
      const snap = await getDoc(inboxRef);
      if (snap.exists()) {
        const data = snap.data();
        let tabs: TabData[] = data.tabs || [];
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
  if (activeRestorations > 0) return;

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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const { type, payload } = msg;

  if (type === "TRIGGER_AI_SORT") {
    console.log("🖱️ TRIGGER_AI_SORT received from UI");
    getDoc(doc(db, "inbox_data", "global")).then(async (snap) => {
      if (snap.exists()) {
        const tabs = (snap.data().tabs || []) as TabData[];
        const queueItems: QueueItem[] = [];

        console.log(
          `🔍 Found ${tabs.length} tabs in inbox. Checking for candidates...`
        );

        for (const t of tabs) {
          if (t.aiData?.status === "completed") continue;

          let physId = -1;
          for (const [pid, data] of tabTracker.entries()) {
            if (data.uid === t.uid) {
              physId = pid;
              break;
            }
          }

          if (physId !== -1) {
            queueItems.push({
              uid: t.uid,
              url: t.url,
              title: t.title,
              tabId: physId,
              attempts: 0,
            });
          }
        }

        console.log(
          `📋 Found ${queueItems.length} valid candidates for AI processing.`
        );

        if (queueItems.length > 0) {
          addToAiQueue(queueItems);
          sendResponse({ success: true, count: queueItems.length });
        } else {
          console.warn(
            "⚠️ No physical tabs matched. Are the tabs open in Chrome?"
          );
          sendResponse({ success: false, reason: "No processable tabs" });
        }
      }
    });
    return true;
  }

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
    handleClosePhysicalTabs(payload.uids);
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

// --- HELPERS (Samme som før) ---
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

      if (winData.tabs && winData.tabs.length > 0) {
        let tabIndex = 1;
        for (const tData of winData.tabs) {
          if (!tData.url || isDash(tData.url)) continue;
          if (tabs[tabIndex]) {
            tabTracker.set(tabs[tabIndex].id!, {
              uid: tData.uid,
              url: tData.url,
            });
            tabIndex++;
          }
        }
      }

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

async function handleClosePhysicalTabs(uids: string[]) {
  if (!uids || uids.length === 0) return;

  const tabsToRemove: number[] = [];

  for (const [chromeTabId, data] of tabTracker.entries()) {
    if (uids.includes(data.uid)) {
      try {
        await chrome.tabs.get(chromeTabId);
        tabsToRemove.push(chromeTabId);
      } catch (e) {
        tabTracker.delete(chromeTabId);
      }
    }
  }

  if (tabsToRemove.length > 0) {
    await chrome.tabs.remove(tabsToRemove);
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
