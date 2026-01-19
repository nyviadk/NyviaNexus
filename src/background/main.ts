import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { AiService } from "../services/aiService";

// --- TYPES & INTERFACES ---

export interface AiData {
  status: "pending" | "completed" | "failed" | "processing";
  category?: string;
  confidence?: number;
  reasoning?: string;
  lastChecked?: number;
  isLocked?: boolean;
}

export interface TabData {
  uid: string;
  title: string;
  url: string;
  favIconUrl: string;
  isIncognito?: boolean;
  aiData?: AiData;
}

// Definerer strukturen af et vindue, som det ser ud i Firestore
export interface FirestoreWindowData {
  id: string; // internalWindowId
  tabs: TabData[];
  isActive: boolean;
  lastActive: Timestamp; // Firestore Timestamp
  name?: string; // Optional, often derived from workspace
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

interface QueueItem {
  uid: string;
  url: string;
  title: string;
  tabId: number;
  attempts: number;
  workspaceName?: string;
}

interface LockData {
  isProcessing: boolean;
  timestamp: number;
}

interface StorageResponse {
  nexus_ai_queue?: QueueItem[];
  nexus_ai_lock?: LockData;
  nexus_ai_last_call?: number;
  nexus_active_windows?: [number, WinMapping][];
  nexus_tab_tracker?: [number, TrackerData][]; // NY: Gemmer trackeren
  [key: string]: unknown; // Fallback for andre nøgler, men typesafe som unknown
}

// Discriminated Union for Type-Safe Messaging
type BackgroundMessage =
  | { type: "DELETE_WORKSPACE_WINDOWS"; payload: { workspaceId: string } }
  | {
      type: "DELETE_AND_CLOSE_WINDOW";
      payload: { workspaceId: string; internalWindowId: string };
    }
  | { type: "TRIGGER_AI_SORT"; payload?: null }
  | { type: "GET_WINDOW_NAME"; payload: { windowId: number } }
  | { type: "GET_LATEST_STATE"; payload?: null }
  | { type: "WATCH_WORKSPACE"; payload?: null }
  | {
      type: "OPEN_WORKSPACE";
      payload: {
        workspaceId: string;
        windows: FirestoreWindowData[];
        name: string;
      };
    }
  | {
      type: "OPEN_SPECIFIC_WINDOW";
      payload: {
        workspaceId: string;
        windowData: FirestoreWindowData;
        name: string;
        index: number;
      };
    }
  | { type: "GET_ACTIVE_MAPPINGS"; payload?: null }
  | { type: "GET_RESTORING_STATUS"; payload?: null }
  | { type: "FORCE_SYNC_ACTIVE_WINDOW"; payload: { windowId: number } }
  | {
      type: "CREATE_NEW_WINDOW_IN_WORKSPACE";
      payload: {
        workspaceId: string;
        name: string;
        initialTab?: TabData & { id?: number; sourceWorkspaceId?: string };
      };
    }
  | {
      type: "CLOSE_PHYSICAL_TABS";
      payload: {
        uids: string[];
        tabIds?: number[];
        internalWindowId?: string;
      };
    }
  | {
      type: "CLAIM_WINDOW";
      payload: {
        windowId: number;
        workspaceId: string;
        internalWindowId: string;
        name: string;
      };
    }
  | {
      type: "MOVE_INCOGNITO_TAB";
      payload: {
        tabId: number;
        targetWorkspaceId: string;
        targetInternalWindowId: string;
      };
    };

// --- STATE ---
let activeRestorations = 0;
let restorationStatus = "";
let lastDashboardTime = 0;

// VIGTIGT: Dette map nulstilles når SW sover. Vi stoler på storage og hydration.
// Key: chromeWindowId (number), Value: WinMapping
let activeWindows = new Map<number, WinMapping>();
const lockedWindowIds = new Set<number>();

// ANTI-SPAM & TRACKING
const openingWorkspaces = new Set<string>();
const recentQueueAdds = new Set<string>();
const currentlyProcessing = new Set<string>();

// TAB TRACKING
// Key: chromeTabId (number), Value: TrackerData
let tabTracker = new Map<number, TrackerData>();

const AI_STORAGE_KEY = "nexus_ai_queue";
const AI_LOCK_KEY = "nexus_ai_lock";
const AI_LAST_CALL_KEY = "nexus_ai_last_call";
const TRACKER_STORAGE_KEY = "nexus_tab_tracker";

const isDash = (url?: string) => url?.includes("dashboard.html");

function broadcast(type: string, payload: unknown = null) {
  chrome.runtime.sendMessage({ type, payload }).catch(() => {
    // Forventet fejl hvis ingen lytter (f.eks. dashboard lukket)
  });
}

function updateRestorationStatus(status: string) {
  restorationStatus = status;
  broadcast("RESTORATION_STATUS_CHANGE", status);
}

// --- PERSISTENCE HELPERS ---

async function saveTrackerToStorage() {
  try {
    const serialized = Array.from(tabTracker.entries());
    await chrome.storage.local.set({ [TRACKER_STORAGE_KEY]: serialized });
  } catch (e) {
    console.warn("Failed to save tab tracker", e);
  }
}

// --- CRITICAL: STATE HYDRATION & CLEANUP ---

// Denne funktion køres ved opstart af Chrome eller Service Worker.
// Den fjerner "Spøgelses-vinduer" og sikrer at tabTracker er up-to-date.
async function validateAndCleanupState() {
  console.log("🧹 Running Startup Cleanup, Hydration & Discovery...");

  // Auth check nødvendigt for database oprydning
  const uid = auth.currentUser?.uid;

  try {
    // 1. Hent gemte mappings OG tab tracker
    const data = (await chrome.storage.local.get([
      "nexus_active_windows",
      TRACKER_STORAGE_KEY,
    ])) as StorageResponse;

    // --- 1.1 HYDRATE TAB TRACKER ---
    if (data[TRACKER_STORAGE_KEY] && Array.isArray(data[TRACKER_STORAGE_KEY])) {
      tabTracker.clear();
      data[TRACKER_STORAGE_KEY].forEach(([tabId, trackerData]) => {
        tabTracker.set(tabId, trackerData);
      });
      console.log(
        `📥 Hydrated Tab Tracker from Storage: ${tabTracker.size} tabs`
      );
    }

    // --- 1.2 HYDRATE WINDOWS ---
    let storedMappings: [number, WinMapping][] = [];
    if (
      data?.nexus_active_windows &&
      Array.isArray(data.nexus_active_windows)
    ) {
      storedMappings = data.nexus_active_windows;
    }

    // --- 1.3 CLEANUP STALE TABS (Slet spøgelses-tabs) ---
    // Vi tjekker om fanerne i trackeren rent faktisk eksisterer i browseren.
    if (tabTracker.size > 0) {
      const allTabs = await chrome.tabs.query({});
      // Opret et map for hurtigt opslag af fysiske tabs: tabId -> url
      const physicalTabsMap = new Map<number, string>();
      allTabs.forEach((t) => {
        if (t.id) physicalTabsMap.set(t.id, t.url || "");
      });

      const deadTabIds: number[] = [];
      let trackerDirty = false;

      for (const [trackedTabId, trackedData] of tabTracker.entries()) {
        // A) Tjek om fanen er død (lukket mens extension sov)
        if (!physicalTabsMap.has(trackedTabId)) {
          console.log(
            `👻 Found Ghost Tab (Closed while sleeping): ID ${trackedTabId}`
          );
          deadTabIds.push(trackedTabId);
        }
        // B) Tjek om URL har ændret sig mens vi sov
        else {
          const actualUrl = physicalTabsMap.get(trackedTabId);
          if (
            actualUrl &&
            actualUrl !== trackedData.url &&
            !isDash(actualUrl)
          ) {
            console.log(
              `🔀 URL mismatch for tab ${trackedTabId}. Updating tracker.`
            );
            tabTracker.set(trackedTabId, { ...trackedData, url: actualUrl });
            trackerDirty = true;
          }
        }
      }

      // Slet døde faner fra Firestore (via vores helper)
      if (deadTabIds.length > 0) {
        await handleClosePhysicalTabs([], deadTabIds);
      } else if (trackerDirty) {
        // Hvis vi kun opdaterede URLs, skal vi huske at gemme trackeren
        await saveTrackerToStorage();
      }
    }

    if (storedMappings.length === 0) {
      activeWindows.clear();
      // Hvis vi ikke har nogen gemte vinduer, men auth findes, så kør en fuld rebuild for en sikkerheds skyld
      if (uid && tabTracker.size === 0) await rebuildTabTracker();
      return;
    }

    // --- 1.4 CLEANUP STALE WINDOWS ---
    // 2. Hent alle FYSISKE vinduer lige nu
    const physicalWindows = await chrome.windows.getAll();
    const physicalIds = new Set(physicalWindows.map((w) => w.id));

    const validMappings: [number, WinMapping][] = [];
    let dirty = false;

    // Opdater activeWindows map
    activeWindows.clear();

    for (const [winId, mapping] of storedMappings) {
      // Hvis vinduet fysisk findes, beholder vi det
      if (physicalIds.has(winId)) {
        validMappings.push([winId, mapping]);
        activeWindows.set(winId, mapping);
      } else {
        // 3. Vinduet er dødt -> Opdater Firestore til isActive = false
        console.log(
          `💀 Cleaning up dead window: ID ${winId} (${mapping.workspaceName})`
        );
        dirty = true;

        if (uid) {
          const docRef = doc(
            db,
            "users",
            uid,
            "workspaces_data",
            mapping.workspaceId,
            "windows",
            mapping.internalWindowId
          );

          try {
            await updateDoc(docRef, { isActive: false });
          } catch (error: unknown) {
            // Type guard for Firestore error code
            const firestoreError = error as { code?: string };
            if (firestoreError.code === "not-found") {
              console.warn(
                `⚠️ Cleanup: Document already deleted for window ${mapping.internalWindowId}. Ignoring.`
              );
            } else {
              console.error("Cleanup Firestore error:", error);
            }
          }
        }
      }
    }

    // 4. Gem oprydning lokalt
    if (dirty) {
      await chrome.storage.local.set({ nexus_active_windows: validMappings });
      // Opdater activeWindows map i hukommelsen
      activeWindows.clear();
      validMappings.forEach(([id, map]) => activeWindows.set(id, map));
    } else {
      // Ingen ændringer, men sørg for hukommelsen er synkroniseret
      activeWindows.clear();
      storedMappings.forEach(([id, map]) => activeWindows.set(id, map));
    }

    // --- 1.5 REBUILD & DISCOVER (Self-Healing) ---
    // Dette sikrer at hvis nye tabs er opstået mens vi sov, bliver de opdaget.
    if (uid) {
      // Først prøver vi at matche fysiske tabs med eksisterende Firestore data (via URL)
      // Dette forhindrer dubletter
      await rebuildTabTracker();

      // Nu scanner vi alle vinduer for at fange faner, der STADIG ikke er tracket (dvs. helt nye)
      console.log("🔍 Scanning for untracked/new tabs...");
      for (const win of physicalWindows) {
        if (!win.id) continue;

        if (activeWindows.has(win.id)) {
          // Dette er et Workspace-vindue -> Force Sync (Opdaterer Firestore med nye tabs)
          await saveToFirestore(win.id, false, true);
        } else {
          // Dette er et Inbox-vindue -> Scan for nye tabs til Inbox
          await registerNewInboxWindow(win.id);
        }
      }
    }
  } catch (err) {
    console.error("🔥 CRITICAL ERROR during cleanup:", err);
  } finally {
    // 6. KICKSTART AI QUEUE: Hvis der ligger opgaver fra et tidligere crash/offline periode
    processAiQueue();
  }
}

// Hydration wrapper til events: Sikrer at vi ikke arbejder med tomt map efter sleep
async function ensureStateHydrated() {
  if (activeWindows.size > 0) return;

  try {
    const data = (await chrome.storage.local.get(
      "nexus_active_windows"
    )) as StorageResponse;
    if (
      data?.nexus_active_windows &&
      Array.isArray(data.nexus_active_windows)
    ) {
      const rawMappings = data.nexus_active_windows;
      activeWindows.clear();
      for (const [winId, mapping] of rawMappings) {
        try {
          await chrome.windows.get(winId);
          activeWindows.set(winId, mapping);
        } catch (e) {
          // BEMÆRK: Vi gør bevidst INTET her (fail silent).
          // Vi lader 'validateAndCleanupState' om at håndtere døde vinduer og Firestore cleanup.
          // Det forhindrer race-conditions og gør UI hurtigere.
        }
      }
    }
    // Sørg også for at trackeren er indlæst hvis den mangler
    if (tabTracker.size === 0) {
      const tData = (await chrome.storage.local.get(
        TRACKER_STORAGE_KEY
      )) as StorageResponse;
      if (
        tData[TRACKER_STORAGE_KEY] &&
        Array.isArray(tData[TRACKER_STORAGE_KEY])
      ) {
        tData[TRACKER_STORAGE_KEY].forEach(([tabId, trackerData]) => {
          tabTracker.set(tabId, trackerData);
        });
      }
    }
  } catch (e) {
    console.error("Hydration failed:", e);
  }
}

// --- BOOTSTRAP ---

// Kør cleanup når Chrome starter
chrome.runtime.onStartup.addListener(() => {
  validateAndCleanupState();
});

// Kør cleanup når extension installeres/opdateres/reloader
chrome.runtime.onInstalled.addListener(() => {
  validateAndCleanupState();
});

auth.onAuthStateChanged((user) => {
  if (user) {
    // Kør også cleanup når bruger logger ind, for at være sikker
    validateAndCleanupState();
  }
});

// --- STORAGE SAVE ---
async function saveActiveWindowsToStorage() {
  const data = Array.from(activeWindows.entries());
  await chrome.storage.local.set({ nexus_active_windows: data });
  // Broadcast så dashboard opdaterer visuelt (via storage listener i dashboard)
}

async function rebuildTabTracker() {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  // Vi rydder IKKE tabTracker her, da vi nu bruger persistence.
  // Vi supplerer kun trackeren med URL-matching, hvis der mangler data.

  try {
    console.log("🔄 Rebuilding Tab Tracker via URL matching (Fallback)...");

    const allWindows = await chrome.windows.getAll();
    const unmappedWindows = allWindows.filter(
      (w) => w.id && !activeWindows.has(w.id) && !lockedWindowIds.has(w.id)
    );

    // 1. Map Inbox Tabs
    const inboxSnap = await getDoc(
      doc(db, "users", uid, "inbox_data", "global")
    );
    if (inboxSnap.exists()) {
      const dbTabs = (inboxSnap.data().tabs || []) as TabData[];
      const availableDbTabs = [...dbTabs];

      for (const w of unmappedWindows) {
        if (!w.id) continue;
        const tabs = await chrome.tabs.query({ windowId: w.id });
        for (const t of tabs) {
          if (t.id && t.url && !isDash(t.url) && !t.url.startsWith("chrome")) {
            // Spring over hvis vi allerede kender denne tabId
            if (tabTracker.has(t.id)) continue;

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

    // 2. Map Workspace Tabs
    for (const [winId, mapping] of activeWindows.entries()) {
      try {
        const winSnap = await getDoc(
          doc(
            db,
            "users",
            uid,
            "workspaces_data",
            mapping.workspaceId,
            "windows",
            mapping.internalWindowId
          )
        );

        if (winSnap.exists()) {
          const dbTabs = (winSnap.data().tabs || []) as TabData[];
          const availableDbTabs = [...dbTabs];

          // Check if window actually exists before query
          try {
            const tabs = await chrome.tabs.query({ windowId: winId });
            for (const t of tabs) {
              if (t.id && t.url && !isDash(t.url)) {
                // Spring over hvis vi allerede kender denne tabId
                if (tabTracker.has(t.id)) continue;

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
          } catch (e) {
            // Window might have closed during rebuild
            console.warn(`Window ${winId} closed during tracker rebuild`);
          }
        }
      } catch (err) {
        console.warn(`Could not read workspace data for window ${winId}`, err);
      }
    }
    // Husk at gemme det vi har fundet (merged)
    await saveTrackerToStorage();
    console.log(
      `✅ Tab Tracker Rebuilt/Merged. Tracking ${tabTracker.size} tabs.`
    );
  } catch (e) {
    console.error("Error rebuilding tab tracker:", e);
  }
}

// --- AI QUEUE SYSTEM ---

async function extractMetadata(tabId: number): Promise<string> {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        try {
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

          return `${title} | ${metaDesc} | ${ogDesc} | ${h1}`
            .replace(/\s+/g, " ")
            .trim();
        } catch (e) {
          return document.title || "";
        }
      },
    });
    // executeScript returns InjectionResult[]
    return result[0]?.result || "";
  } catch (e) {
    return "";
  }
}

async function cleanupQueueItem(uid: string) {
  const freshStorage = (await chrome.storage.local.get(
    AI_STORAGE_KEY
  )) as StorageResponse;
  const freshQueue = Array.isArray(freshStorage[AI_STORAGE_KEY])
    ? freshStorage[AI_STORAGE_KEY]
    : [];
  const updatedQueue = freshQueue.filter((q) => q.uid !== uid);
  await chrome.storage.local.set({
    [AI_STORAGE_KEY]: updatedQueue,
    [AI_LOCK_KEY]: { isProcessing: false, timestamp: Date.now() },
    [AI_LAST_CALL_KEY]: Date.now(),
  });
  currentlyProcessing.delete(uid);
  if (updatedQueue.length > 0) {
    chrome.alarms.create("process_ai_next", { when: Date.now() + 100 });
  }
}

async function processAiQueue() {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  if (activeRestorations > 0) {
    chrome.alarms.create("retry_ai_queue", { when: Date.now() + 5000 });
    return;
  }
  try {
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
    // Safety break: if lock is older than 30s, assume crash and proceed
    if (lock?.isProcessing && now - lock.timestamp < 30000) return;

    if (now - lastCall < 2000) {
      const delay = 2000 - (now - lastCall);
      chrome.alarms.create("process_ai_next", { when: now + delay });
      return;
    }

    const item = queue[0];
    if (currentlyProcessing.has(item.uid)) return;

    currentlyProcessing.add(item.uid);
    await chrome.storage.local.set({
      [AI_LOCK_KEY]: { isProcessing: true, timestamp: now },
    });

    broadcast("AI_STATUS_UPDATE", { uid: item.uid, status: "processing" });

    // Hent vindues-mapping for at se om vi stadig kender vinduet
    await ensureStateHydrated();

    try {
      await chrome.tabs.get(item.tabId);
    } catch (e) {
      // Tab eksisterer ikke længere fysisk
      await cleanupQueueItem(item.uid);
      return;
    }

    let metadata = "";
    try {
      metadata = await extractMetadata(item.tabId);
    } catch (e) {}

    const result = await AiService.analyzeTab(
      item.title,
      item.url,
      metadata,
      item.workspaceName
    );

    if (result) {
      console.log(`✅ AI Categorized: ${result.category} for ${item.title}`);
      const aiData: AiData = {
        status: "completed",
        category: result.category,
        confidence: result.confidence,
        reasoning: result.reasoning,
        lastChecked: Date.now(),
        isLocked: false,
      };

      let handled = false;
      try {
        const tabInfo = await chrome.tabs.get(item.tabId);
        if (tabInfo && activeWindows.has(tabInfo.windowId)) {
          const mapping = activeWindows.get(tabInfo.windowId);
          if (mapping) {
            const winRef = doc(
              db,
              "users",
              uid,
              "workspaces_data",
              mapping.workspaceId,
              "windows",
              mapping.internalWindowId
            );
            // Hent frisk data direkte før opdatering
            const winSnap = await getDoc(winRef);
            if (winSnap.exists()) {
              const tabs = (winSnap.data().tabs || []) as TabData[];
              const idx = tabs.findIndex((t) => t.uid === item.uid);
              if (idx !== -1 && !tabs[idx].aiData?.isLocked) {
                tabs[idx].aiData = aiData;
                await updateDoc(winRef, { tabs });
                handled = true;
              }
            }
          }
        }
      } catch (e) {}

      if (!handled) {
        const inboxRef = doc(db, "users", uid, "inbox_data", "global");
        const inboxSnap = await getDoc(inboxRef);
        if (inboxSnap.exists()) {
          const tabs = (inboxSnap.data().tabs || []) as TabData[];
          const idx = tabs.findIndex((t) => t.uid === item.uid);
          if (idx !== -1 && !tabs[idx].aiData?.isLocked) {
            tabs[idx].aiData = aiData;
            await updateDoc(inboxRef, { tabs });
          }
        }
      }
    }
    await cleanupQueueItem(item.uid);
  } catch (error) {
    console.error("AI Queue Error", error);
    await chrome.storage.local.set({
      [AI_LOCK_KEY]: { isProcessing: false, timestamp: 0 },
    });
    const storage = (await chrome.storage.local.get(
      AI_STORAGE_KEY
    )) as StorageResponse;
    const item = storage[AI_STORAGE_KEY]?.[0];
    if (item) currentlyProcessing.delete(item.uid);
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "process_ai_next" || alarm.name === "retry_ai_queue") {
    processAiQueue();
  }
});

async function addToAiQueue(items: QueueItem[]) {
  try {
    const data = (await chrome.storage.local.get(
      AI_STORAGE_KEY
    )) as StorageResponse;
    let currentQueue: QueueItem[] = Array.isArray(data[AI_STORAGE_KEY])
      ? data[AI_STORAGE_KEY]
      : [];

    const newItems = items.filter((i) => {
      const existingIndex = currentQueue.findIndex((q) => q.uid === i.uid);

      if (existingIndex !== -1) {
        if (currentQueue[existingIndex].url !== i.url) {
          console.log(`🔄 URL changed for ${i.uid}, re-queuing...`);
          currentQueue.splice(existingIndex, 1);
          return true;
        }
        return false;
      }

      const recentlyAdded = recentQueueAdds.has(i.uid + i.url);
      const isProcessing = currentlyProcessing.has(i.uid);

      if (isProcessing) {
        const tracked = [...tabTracker.values()].find((t) => t.uid === i.uid);
        if (tracked && tracked.url !== i.url) return true;
        return false;
      }

      return !recentlyAdded;
    });

    if (
      newItems.length === 0 &&
      currentQueue.length === (data[AI_STORAGE_KEY]?.length || 0)
    )
      return;

    console.log(`📥 Adding ${newItems.length} items to AI Queue (URL Unique)`);
    newItems.forEach((i) => {
      recentQueueAdds.add(i.uid + i.url);
      setTimeout(() => recentQueueAdds.delete(i.uid + i.url), 5000);
    });

    const updatedQueue = [...currentQueue, ...newItems];
    await chrome.storage.local.set({ [AI_STORAGE_KEY]: updatedQueue });

    processAiQueue();
  } catch (e) {
    console.error("Error adding to AI queue:", e);
  }
}

// --- HELPER: getOrAssignUid ---
function getOrAssignUid(tabId: number, url: string): string {
  const tracked = tabTracker.get(tabId);

  if (tracked) {
    if (tracked.url !== url) {
      tabTracker.set(tabId, { uid: tracked.uid, url });
      saveTrackerToStorage(); // GEM ÆNDRING
    }
    return tracked.uid;
  }

  const newUid = crypto.randomUUID();
  tabTracker.set(tabId, { uid: newUid, url });
  saveTrackerToStorage(); // GEM ÆNDRING
  console.log(`🔥 Assigned NEW UID for tab ${tabId}: ${newUid}`);
  return newUid;
}

// --- STANDARD LOGIC ---

async function registerNewInboxWindow(windowId: number) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  if (activeRestorations > 0) return;
  const tabs = await chrome.tabs.query({ windowId });
  const tabsToAdd: TabData[] = [];
  const inboxDocRef = doc(db, "users", uid, "inbox_data", "global");

  // Vi bruger getDoc, men hvis det ikke findes, opretter vi det senere
  const inboxSnap = await getDoc(inboxDocRef);
  let currentTabs = inboxSnap.exists()
    ? (inboxSnap.data().tabs as TabData[]) || []
    : [];

  for (const t of tabs) {
    if (t.id && t.url && !isDash(t.url) && !t.url.startsWith("chrome")) {
      const uid = getOrAssignUid(t.id, t.url);

      if (!currentTabs.some((ct) => ct.uid === uid)) {
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
    // Brug setDoc med merge for at være sikker på at dokumentet findes
    await setDoc(
      inboxDocRef,
      {
        tabs: [...currentTabs, ...tabsToAdd],
        lastUpdate: serverTimestamp(),
      },
      { merge: true }
    );
  }
}

async function saveToFirestore(
  windowId: number,
  isRemoval: boolean = false,
  force: boolean = false
) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  if (!force && (lockedWindowIds.has(windowId) || activeRestorations > 0))
    return;

  try {
    let windowExists = true;
    try {
      await chrome.windows.get(windowId);
    } catch (e) {
      windowExists = false;
    }

    await ensureStateHydrated();

    const mapping = activeWindows.get(windowId);
    if (mapping) {
      if (!windowExists) return; // Don't save if physical window is gone (unless removal logic runs)

      let tabs: chrome.tabs.Tab[] = [];
      tabs = await chrome.tabs.query({ windowId });

      const docRef = doc(
        db,
        "users",
        uid,
        "workspaces_data",
        mapping.workspaceId,
        "windows",
        mapping.internalWindowId
      );

      let existingAiData = new Map<string, AiData>();
      try {
        const snap = await getDoc(docRef);
        // SAFETY CHECK: Hvis dokumentet ikke findes, og vi IKKE sletter, skal vi måske genskabe det?
        if (!snap.exists() && !isRemoval) {
          console.warn(
            `Attempted to save to missing doc: ${mapping.internalWindowId}. Stopping.`
          );
          return;
        }

        if (snap.exists()) {
          (snap.data().tabs || []).forEach((t: TabData) => {
            if (t.aiData) existingAiData.set(t.uid, t.aiData);
          });
        }
      } catch (e) {
        console.error("Error reading doc during save:", e);
        return;
      }

      const validTabs: TabData[] = [];
      const tabsToQueue: QueueItem[] = [];

      for (const t of tabs) {
        if (t.id && t.url && !t.url.startsWith("chrome") && !isDash(t.url)) {
          const uid = getOrAssignUid(t.id, t.url);
          let aiData = existingAiData.get(uid) || { status: "pending" };

          if (
            (aiData.status === "pending" || !aiData.status) &&
            !aiData.isLocked
          ) {
            tabsToQueue.push({
              uid,
              url: t.url,
              title: t.title || "Ny fane",
              tabId: t.id,
              attempts: 0,
              workspaceName: mapping.workspaceName,
            });
          }

          validTabs.push({
            uid: uid,
            title: t.title || "Ny fane",
            url: t.url,
            favIconUrl: t.favIconUrl || "",
            isIncognito: false,
            aiData: aiData,
          });
        }
      }

      if (validTabs.length === 0 && isRemoval) {
        // Safe delete
        try {
          await deleteDoc(docRef);
        } catch (e) {
          /* ignore already deleted */
        }

        activeWindows.delete(windowId);
        await saveActiveWindowsToStorage();
        chrome.windows.remove(windowId).catch(() => {});
        return;
      }

      await setDoc(
        docRef,
        {
          tabs: validTabs,
          lastActive: serverTimestamp(),
          isActive: true,
        },
        { merge: true }
      );
      if (tabsToQueue.length > 0) addToAiQueue(tabsToQueue);
    }
  } catch (e) {
    console.error("Save error:", e);
  }
}

chrome.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  if (
    activeRestorations > 0 ||
    !tab.url ||
    isDash(tab.url) ||
    tab.url.startsWith("chrome") ||
    tab.url.startsWith("edge")
  ) {
    return;
  }

  await ensureStateHydrated();

  const isUrlChange = change.url !== undefined;
  const isStatusComplete = change.status === "complete";
  const isTitleChange = change.title !== undefined;

  if (isUrlChange || isStatusComplete || isTitleChange) {
    const url = tab.url;
    const uidTab = getOrAssignUid(tabId, url);
    const title = tab.title || "Indlæser...";
    const mapping = activeWindows.get(tab.windowId);

    const triggerAi = () => {
      addToAiQueue([
        {
          uid: uidTab,
          url,
          title,
          tabId,
          attempts: 0,
          workspaceName: mapping ? mapping.workspaceName : "Inbox",
        },
      ]);
    };

    if (mapping) {
      const winRef = doc(
        db,
        "users",
        uid,
        "workspaces_data",
        mapping.workspaceId,
        "windows",
        mapping.internalWindowId
      );

      try {
        const snap = await getDoc(winRef);

        if (snap.exists()) {
          let tabs = (snap.data().tabs || []) as TabData[];
          const idx = tabs.findIndex((t) => t.uid === uidTab);

          if (idx !== -1) {
            const oldUrl = tabs[idx].url;
            const hasNoAiData =
              !tabs[idx].aiData || tabs[idx].aiData?.status === "pending";

            if (oldUrl !== url || isStatusComplete || hasNoAiData) {
              tabs[idx].url = url;
              tabs[idx].title = title;
              tabs[idx].favIconUrl =
                tab.favIconUrl || tabs[idx].favIconUrl || "";

              if (oldUrl !== url || hasNoAiData) {
                tabs[idx].aiData = { status: "pending" };
                await updateDoc(winRef, { tabs });
                triggerAi();
              } else {
                await updateDoc(winRef, { tabs });
              }
            }
          } else {
            tabs.push({
              uid: uidTab,
              title,
              url,
              favIconUrl: tab.favIconUrl || "",
              aiData: { status: "pending" },
            });
            await updateDoc(winRef, { tabs });
            triggerAi();
          }
        }
      } catch (e) {
        // Ignore updates to missing docs
      }
    } else {
      // Inbox Logic
      // Hvis vi når herned, og ensureStateHydrated har kørt, er det en "ægte" ukendt fane
      const inboxRef = doc(db, "users", uid, "inbox_data", "global");
      const snap = await getDoc(inboxRef);
      if (snap.exists()) {
        let tabs = (snap.data().tabs || []) as TabData[];
        const idx = tabs.findIndex((t) => t.uid === uidTab);

        if (idx !== -1) {
          if (tabs[idx].url !== url || !tabs[idx].aiData) {
            tabs[idx].url = url;
            tabs[idx].title = title;
            tabs[idx].aiData = { status: "pending" };
            await updateDoc(inboxRef, { tabs });
            triggerAi();
          }
        } else {
          tabs.push({
            uid: uidTab,
            title,
            url,
            favIconUrl: tab.favIconUrl || "",
            isIncognito: tab.incognito,
            aiData: { status: "pending" },
          });
          await updateDoc(inboxRef, {
            tabs,
            lastUpdate: serverTimestamp(),
          });
          triggerAi();
        }
      }
    }
  }
});

chrome.tabs.onRemoved.addListener(async (tabId, info) => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  if (activeRestorations > 0) return;
  await ensureStateHydrated();

  const tracked = tabTracker.get(tabId);
  tabTracker.delete(tabId);
  saveTrackerToStorage(); // GEM ÆNDRING

  if (activeWindows.has(info.windowId)) {
    if (!info.isWindowClosing) saveToFirestore(info.windowId, true);
  } else {
    // Dette er den vigtige del for Inbox.
    // Hvis 'tracked' var undefined pga. reload (før), fejlede dette.
    // Nu er tracked hydreret fra storage.
    if (tracked && !info.isWindowClosing) {
      const inboxRef = doc(db, "users", uid, "inbox_data", "global");
      try {
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
      } catch (e) {
        console.warn("Could not remove tab from inbox (maybe deleted?):", e);
      }
    }
  }
});

chrome.windows.onCreated.addListener(async (win) => {
  broadcast("PHYSICAL_WINDOWS_CHANGED");
  if (activeRestorations > 0) return;

  await ensureStateHydrated();

  if (win.id && !activeWindows.has(win.id)) {
    setTimeout(() => registerNewInboxWindow(win.id!), 1000);
  }
});

chrome.windows.onFocusChanged.addListener(async (winId) => {
  if (winId === chrome.windows.WINDOW_ID_NONE || activeRestorations > 0) return;

  await ensureStateHydrated();

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
  broadcast("PHYSICAL_WINDOWS_CHANGED");
  const uid = auth.currentUser?.uid;

  await ensureStateHydrated();

  const mapping = activeWindows.get(windowId);
  if (mapping && uid) {
    const docRef = doc(
      db,
      "users",
      uid,
      "workspaces_data",
      mapping.workspaceId,
      "windows",
      mapping.internalWindowId
    );
    // Use catch to ignore errors if doc is already gone
    updateDoc(docRef, { isActive: false }).catch(() => {});

    activeWindows.delete(windowId);
    await saveActiveWindowsToStorage();
  }
  lockedWindowIds.delete(windowId);
});

// --- MESSAGING ---

// Using the BackgroundMessage discriminated union to ensure type safety
chrome.runtime.onMessage.addListener(
  (message: BackgroundMessage, _sender, sendResponse) => {
    const uid = auth.currentUser?.uid;

    switch (message.type) {
      case "DELETE_WORKSPACE_WINDOWS": {
        ensureStateHydrated().then(async () => {
          const { workspaceId } = message.payload;
          const windowsToClose: number[] = [];

          for (const [winId, mapping] of activeWindows.entries()) {
            if (mapping.workspaceId === workspaceId) {
              windowsToClose.push(winId);
              activeWindows.delete(winId); // Remove from memory immediately
            }
          }

          if (windowsToClose.length > 0) {
            await saveActiveWindowsToStorage();
            // Close physical windows
            windowsToClose.forEach((wid) =>
              chrome.windows.remove(wid).catch(() => {})
            );
          }
        });
        return false; // No response needed
      }

      case "DELETE_AND_CLOSE_WINDOW": {
        if (!uid) return false;
        ensureStateHydrated().then(async () => {
          const { workspaceId, internalWindowId } = message.payload;
          let physicalId: number | null = null;
          for (const [pId, map] of activeWindows.entries()) {
            if (
              map.workspaceId === workspaceId &&
              map.internalWindowId === internalWindowId
            ) {
              physicalId = pId;
              break;
            }
          }
          const docRef = doc(
            db,
            "users",
            uid,
            "workspaces_data",
            workspaceId,
            "windows",
            internalWindowId
          );
          try {
            await deleteDoc(docRef);
            if (physicalId) {
              activeWindows.delete(physicalId);
              await saveActiveWindowsToStorage();
              await chrome.windows.remove(physicalId).catch(() => {});
            }
            sendResponse({ success: true });
          } catch (e) {
            const error = e as Error;
            console.error("Error deleting window:", error);
            sendResponse({ success: false, error: error.message });
          }
        });
        return true;
      }

      case "TRIGGER_AI_SORT": {
        if (!uid) return false;
        ensureStateHydrated().then(async () => {
          getDoc(doc(db, "users", uid, "inbox_data", "global"))
            .then(async (snap) => {
              if (snap.exists()) {
                const tabs = (snap.data().tabs || []) as TabData[];
                const queueItems: QueueItem[] = [];
                for (const t of tabs) {
                  if (
                    (t.aiData?.status === "pending" || !t.aiData?.status) &&
                    !t.aiData?.isLocked
                  ) {
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
                        workspaceName: "Inbox",
                      });
                    }
                  }
                }
                if (queueItems.length > 0) {
                  addToAiQueue(queueItems);
                  sendResponse({
                    success: true,
                    count: queueItems.length,
                  });
                } else {
                  sendResponse({
                    success: false,
                    reason: "No processable tabs",
                  });
                }
              } else {
                sendResponse({
                  success: false,
                  reason: "Inbox not found",
                });
              }
            })
            .catch((e) =>
              sendResponse({
                success: false,
                error: (e as Error).message,
              })
            );
        });
        return true;
      }

      case "GET_WINDOW_NAME": {
        ensureStateHydrated().then(() => {
          const mapping = activeWindows.get(message.payload.windowId);
          sendResponse({
            name: mapping ? mapping.workspaceName : "Inbox",
          });
        });
        return true;
      }

      case "GET_LATEST_STATE": {
        sendResponse(null);
        return false;
      }

      case "WATCH_WORKSPACE": {
        sendResponse({ success: true });
        return false;
      }

      case "OPEN_WORKSPACE": {
        if (openingWorkspaces.has(message.payload.workspaceId)) {
          sendResponse({ success: true });
          return false;
        }
        openingWorkspaces.add(message.payload.workspaceId);
        ensureStateHydrated().then(() => {
          handleOpenWorkspace(
            message.payload.workspaceId,
            message.payload.windows,
            message.payload.name
          ).finally(() => {
            setTimeout(
              () => openingWorkspaces.delete(message.payload.workspaceId),
              2000
            );
            sendResponse({ success: true });
          });
        });
        return true;
      }

      case "OPEN_SPECIFIC_WINDOW": {
        ensureStateHydrated().then(() => {
          handleOpenSpecificWindow(
            message.payload.workspaceId,
            message.payload.windowData,
            message.payload.name,
            message.payload.index
          ).then(() => sendResponse({ success: true }));
        });
        return true;
      }

      case "GET_ACTIVE_MAPPINGS": {
        ensureStateHydrated().then(() => {
          sendResponse(Array.from(activeWindows.entries()));
        });
        return true;
      }

      case "GET_RESTORING_STATUS": {
        sendResponse(restorationStatus);
        return false;
      }

      case "FORCE_SYNC_ACTIVE_WINDOW": {
        ensureStateHydrated().then(() => {
          handleForceSync(message.payload.windowId).then(() =>
            sendResponse({ success: true })
          );
        });
        return true;
      }

      case "CREATE_NEW_WINDOW_IN_WORKSPACE": {
        ensureStateHydrated().then(() => {
          handleCreateNewWindowInWorkspace(
            message.payload.workspaceId,
            message.payload.name,
            message.payload.initialTab
          ).then(() => sendResponse({ success: true }));
        });
        return true;
      }

      case "CLOSE_PHYSICAL_TABS": {
        const { uids, tabIds } = message.payload;
        ensureStateHydrated().then(() => {
          handleClosePhysicalTabs(uids, tabIds)
            .then(() => {
              sendResponse({ success: true });
            })
            .catch((e) =>
              sendResponse({
                success: false,
                error: (e as Error).message,
              })
            );
        });
        return true;
      }

      case "CLAIM_WINDOW": {
        if (!uid) return false;
        if (activeRestorations === 0) {
          getWorkspaceWindowIndex(
            message.payload.workspaceId,
            message.payload.internalWindowId
          ).then((idx) => {
            activeWindows.set(message.payload.windowId, {
              workspaceId: message.payload.workspaceId,
              internalWindowId: message.payload.internalWindowId,
              workspaceName: message.payload.name,
              index: idx,
            });
            saveActiveWindowsToStorage();
            sendResponse({ success: true });
          });
          return true;
        }
        sendResponse({ success: false });
        return false;
      }
      case "MOVE_INCOGNITO_TAB": {
        // Håndter flytning af incognito tabs hvis nødvendigt
        return true;
      }
      default:
        return false;
    }
  }
);

// --- HELPERS ---

async function handleClosePhysicalTabs(uids: string[], tabIds?: number[]) {
  if (tabIds && tabIds.length > 0) {
    await chrome.tabs.remove(tabIds).catch((e) => console.warn(e));
    tabIds.forEach((tid) => {
      tabTracker.delete(tid);
    });
    saveTrackerToStorage();
    return;
  }

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
    await chrome.tabs.remove(tabsToRemove).catch(() => {});
  }
}

async function handleOpenWorkspace(
  workspaceId: string,
  windowsToOpen: FirestoreWindowData[],
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
  winData: FirestoreWindowData,
  name: string,
  index: number
) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

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
      .map((t) => t.url)
      .filter((u) => u && !isDash(u));
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
        saveTrackerToStorage();
      }
      const mapping = {
        workspaceId,
        internalWindowId: winData.id,
        workspaceName: name,
        index,
      };
      activeWindows.set(winId, mapping);
      await saveActiveWindowsToStorage();
      if (urls.length > 0) {
        await waitForWindowToLoad(winId);
      }
      lockedWindowIds.delete(winId);
      await saveToFirestore(winId, false, true);
    }
  } finally {
    activeRestorations--;
    if (activeRestorations === 0) updateRestorationStatus("");
  }
}

async function removeTabFromFirestoreSource(
  uid: string,
  tabUid: string,
  sourceWorkspaceId?: string
) {
  try {
    if (!sourceWorkspaceId || sourceWorkspaceId === "global") {
      const inboxRef = doc(db, "users", uid, "inbox_data", "global");
      const snap = await getDoc(inboxRef);
      if (snap.exists()) {
        const tabs = (snap.data().tabs || []) as TabData[];
        const filtered = tabs.filter((t) => t.uid !== tabUid);
        if (filtered.length !== tabs.length) {
          await updateDoc(inboxRef, {
            tabs: filtered,
            lastUpdate: serverTimestamp(),
          });
        }
      }
    } else {
      const windowsSnap = await getDocs(
        collection(
          db,
          "users",
          uid,
          "workspaces_data",
          sourceWorkspaceId,
          "windows"
        )
      );
      for (const winDoc of windowsSnap.docs) {
        const tabs = (winDoc.data().tabs || []) as TabData[];
        const filtered = tabs.filter((t) => t.uid !== tabUid);
        if (filtered.length !== tabs.length) {
          await updateDoc(winDoc.ref, { tabs: filtered });
          break; // Vi har fundet og fjernet den
        }
      }
    }
  } catch (e) {
    console.error("Fejl ved fjernelse af tab fra source:", e);
  }
}

async function handleCreateNewWindowInWorkspace(
  workspaceId: string,
  name: string,
  initialTab?: TabData & { id?: number; sourceWorkspaceId?: string }
) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  activeRestorations++;
  updateRestorationStatus("Opretter nyt vindue...");

  const internalId = `win_${Date.now()}`;
  const dashUrl = `dashboard.html?workspaceId=${workspaceId}&windowId=${internalId}&newWindow=true`;

  try {
    // Forbered URLs - Dashboard er altid første fane
    const urls = [dashUrl];
    if (initialTab?.url) urls.push(initialTab.url);

    // 1. Opret det fysiske vindue
    const newWin = await chrome.windows.create({ url: urls });

    if (newWin?.id) {
      const winId = newWin.id;

      // 2. Lås vinduet og registrer mapping øjeblikkeligt (vigtigt for race conditions)
      lockedWindowIds.add(winId);
      activeWindows.set(winId, {
        workspaceId,
        internalWindowId: internalId,
        workspaceName: name,
        index: 99, // Midlertidig
      });

      const tabs = await chrome.tabs.query({ windowId: winId });

      // Pin Dashboard
      if (tabs[0]?.id) await chrome.tabs.update(tabs[0].id, { pinned: true });

      // 3. Håndter den flyttede fane (Atomic Move)
      if (initialTab && tabs[1]?.id) {
        // Map UID til den nye fysiske fane
        tabTracker.set(tabs[1].id, {
          uid: initialTab.uid,
          url: initialTab.url,
        });
        saveTrackerToStorage();

        // Luk den gamle fysiske fane (hvis den er åben i et andet vindue)
        if (initialTab.id) {
          chrome.tabs.remove(initialTab.id).catch(() => {});
          tabTracker.delete(initialTab.id);
          saveTrackerToStorage();
        }

        // Rens Firestore source
        await removeTabFromFirestoreSource(
          uid,
          initialTab.uid,
          initialTab.sourceWorkspaceId
        );
      }

      // 4. Gem endelig tilstand
      const snap = await getDocs(
        collection(db, "users", uid, "workspaces_data", workspaceId, "windows")
      );
      const mapping: WinMapping = {
        workspaceId,
        internalWindowId: internalId,
        workspaceName: name,
        index: snap.size + 1,
      };

      activeWindows.set(winId, mapping);
      await saveActiveWindowsToStorage();

      await setDoc(
        doc(
          db,
          "users",
          uid,
          "workspaces_data",
          workspaceId,
          "windows",
          internalId
        ),
        {
          id: internalId,
          tabs: initialTab ? [initialTab] : [],
          isActive: true,
          lastActive: serverTimestamp(),
        }
      );

      lockedWindowIds.delete(winId);
    }
  } catch (err) {
    console.error("Create window failed:", err);
  } finally {
    activeRestorations--;
    if (activeRestorations === 0) updateRestorationStatus("");
  }
}

async function handleForceSync(windowId: number) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  const mapping = activeWindows.get(windowId);
  if (!mapping) return;
  lockedWindowIds.add(windowId);
  activeRestorations++;
  updateRestorationStatus("Forbereder synkronisering...");
  try {
    const snap = await getDoc(
      doc(
        db,
        "users",
        uid,
        "workspaces_data",
        mapping.workspaceId,
        "windows",
        mapping.internalWindowId
      )
    );
    if (snap.exists()) {
      const data = snap.data();
      const urls = (data.tabs || [])
        .map((t: TabData) => t.url)
        .filter((u: string) => u && !isDash(u));
      const currentTabs = await chrome.tabs.query({ windowId });
      updateRestorationStatus(`Genindlæser ${urls.length} faner...`);
      for (const url of urls) await chrome.tabs.create({ windowId, url });
      updateRestorationStatus("Fjerner gamle faner...");
      for (const tab of currentTabs) {
        if (tab.id && !isDash(tab.url) && !tab.pinned)
          await chrome.tabs.remove(tab.id);
      }
    }
  } finally {
    await waitForWindowToLoad(windowId);
    lockedWindowIds.delete(windowId);
    activeRestorations--;
    saveToFirestore(windowId, false, true);
    if (activeRestorations === 0) updateRestorationStatus("");
  }
}

async function getWorkspaceWindowIndex(
  workspaceId: string,
  internalWindowId: string
): Promise<number> {
  const uid = auth.currentUser?.uid;
  if (!uid) return 1;

  try {
    const q = query(
      collection(db, "users", uid, "workspaces_data", workspaceId, "windows"),
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
