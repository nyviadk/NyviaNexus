import { getAuth } from "firebase/auth";
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { ArchiveItem, Note } from "../types";
// RETTET IMPORT STI:
import { WinMapping } from "./main";

// Konstanter for formatering
const BOX_BORDER = "------------------------------"; // 30 stk
const BOX_DIVIDER = "-----"; // 5 stk (Ændret fra 10)

const workspaceNameCache: Record<string, string> = {};

// --- INITIALIZATION ---
export const initializeContextMenus = () => {
  chrome.runtime.onInstalled.addListener(setupMenus);
  chrome.runtime.onStartup.addListener(setupMenus);

  chrome.contextMenus.onClicked.addListener(handleMenuClick);
  setupContextMenuUpdaters();
};

const setupMenus = () => {
  chrome.contextMenus.removeAll(() => {
    // 1. Send to Notes: KUN ved selection
    chrome.contextMenus.create({
      id: "nexus-send-to-notes",
      title: "Send to Notes",
      contexts: ["selection"],
    });

    // 2. Read It Later: KUN Page og Link
    chrome.contextMenus.create({
      id: "nexus-read-later",
      title: "Read It Later",
      contexts: ["page", "link"],
    });
  });
};

const setupContextMenuUpdaters = () => {
  chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) return;
    updateMenuTitles(windowId);
  });

  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.windowId) updateMenuTitles(tab.windowId);
  });
};

// --- HELPERS ---

const getWorkspaceName = async (
  uid: string,
  workspaceId: string,
): Promise<string> => {
  if (workspaceId === "global") return "Inbox";
  if (workspaceId === "incognito") return "Incognito";
  if (workspaceNameCache[workspaceId]) return workspaceNameCache[workspaceId];

  try {
    const docRef = doc(db, "users", uid, "items", workspaceId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const name = snap.data().name || "Workspace";
      workspaceNameCache[workspaceId] = name;
      return name;
    }
  } catch (e) {
    console.warn("Kunne ikke hente workspace navn:", e);
  }
  return "Workspace";
};

const updateMenuTitles = async (windowId: number) => {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return;

  const workspaceId = await resolveWorkspaceId(windowId);
  const name = await getWorkspaceName(user.uid, workspaceId);

  try {
    chrome.contextMenus.update("nexus-send-to-notes", {
      title: `Send to Notes (${name})`,
    });
    chrome.contextMenus.update("nexus-read-later", {
      title: `Read It Later (${name})`,
    });
  } catch (e) {
    // Ignorer
  }
};

const handleMenuClick = async (
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab,
) => {
  if (!tab || !tab.id || !tab.windowId) return;

  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) {
    console.warn("Nexus: Ingen bruger logget ind.");
    return;
  }

  const workspaceId = await resolveWorkspaceId(tab.windowId);

  try {
    if (info.menuItemId === "nexus-send-to-notes") {
      await handleSendToNotes(user.uid, workspaceId, info, tab);
    } else if (info.menuItemId === "nexus-read-later") {
      await handleReadItLater(user.uid, workspaceId, info, tab);
    }
  } catch (err) {
    console.error("Nexus Context Menu Error:", err);
  }
};

const resolveWorkspaceId = async (windowId: number): Promise<string> => {
  return new Promise((resolve) => {
    chrome.storage.local.get("nexus_active_windows", (data) => {
      const mappings = (data.nexus_active_windows || []) as [
        number,
        WinMapping,
      ][];
      const match = mappings.find(([physId]) => physId === windowId);
      resolve(match ? match[1].workspaceId : "global");
    });
  });
};

// --- FEATURE 1: SEND TO NOTES (SMART MERGE FORMAT) ---
const handleSendToNotes = async (
  uid: string,
  workspaceId: string,
  info: chrome.contextMenus.OnClickData,
  tab: chrome.tabs.Tab,
) => {
  const selection = info.selectionText;
  if (!selection) return;

  const noteTitle = tab.title || "Uden titel";
  const sourceUrl = tab.url || "";
  const timestamp = Date.now();
  const quote = `"${selection}"`;

  const collectionRef =
    workspaceId === "global"
      ? collection(db, "users", uid, "inbox_data", "global", "notes")
      : collection(db, "users", uid, "workspaces_data", workspaceId, "notes");

  try {
    const q = query(collectionRef, where("title", "==", noteTitle), limit(1));
    const snap = await getDocs(q);

    if (!snap.empty) {
      // --- EKSISTERENDE NOTE (Tjek for merge) ---
      const noteDoc = snap.docs[0];
      const currentContent = noteDoc.data().content || "";

      // Vi leder efter footeren. Formatet er: Kilde:\nURL\nBOX_BORDER
      // Vi bruger trim() for at undgå problemer med whitespace
      const expectedFooter = `Kilde:\n${sourceUrl}\n${BOX_BORDER}`;

      let updatedContent = "";

      if (currentContent.trim().endsWith(expectedFooter)) {
        // MATCH: Vi fjerner footeren, indsætter divider + nyt citat + footer igen
        const body = currentContent
          .slice(0, currentContent.lastIndexOf(expectedFooter))
          .trimEnd();

        // 5 streger divider
        updatedContent = `${body}\n\n${BOX_DIVIDER}\n\n${quote}\n\n${expectedFooter}`;

        console.log(`Nexus: Merged content into existing block.`);
      } else {
        // NO MATCH: Ny boks tilføjes
        const newBlock = `${BOX_BORDER}\n${quote}\n\nKilde:\n${sourceUrl}\n${BOX_BORDER}`;
        updatedContent = `${currentContent}\n\n\n${newBlock}`;

        console.log(`Nexus: Appended new block to note.`);
      }

      await updateDoc(noteDoc.ref, {
        content: updatedContent,
        updatedAt: timestamp,
      });
    } else {
      // --- NY NOTE ---
      const newNoteId = crypto.randomUUID();

      const content = `${BOX_BORDER}\n${quote}\n\nKilde:\n${sourceUrl}\n${BOX_BORDER}`;

      const newNote: Note = {
        id: newNoteId,
        title: noteTitle,
        content: content,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      const newDocRef =
        workspaceId === "global"
          ? doc(db, "users", uid, "inbox_data", "global", "notes", newNoteId)
          : doc(
              db,
              "users",
              uid,
              "workspaces_data",
              workspaceId,
              "notes",
              newNoteId,
            );

      await setDoc(newDocRef, newNote);
      console.log(`Nexus: Oprettede ny note "${noteTitle}"`);
    }
  } catch (e) {
    console.error("Fejl ved Send To Notes:", e);
  }
};

// --- FEATURE 2: READ IT LATER ---
const handleReadItLater = async (
  uid: string,
  workspaceId: string,
  info: chrome.contextMenus.OnClickData,
  tab: chrome.tabs.Tab,
) => {
  const targetUrl = info.linkUrl || tab.url;
  const targetTitle = info.linkUrl ? targetUrl : tab.title;

  if (!targetUrl) return;

  const newItem: ArchiveItem = {
    id: crypto.randomUUID(),
    url: targetUrl,
    title: targetTitle || targetUrl,
    createdAt: Date.now(),
    readLater: true,
  };

  const listRef =
    workspaceId === "global"
      ? doc(db, "users", uid, "inbox_data", "global", "archive_data", "list")
      : doc(
          db,
          "users",
          uid,
          "workspaces_data",
          workspaceId,
          "archive_data",
          "list",
        );

  await setDoc(listRef, { items: arrayUnion(newItem) }, { merge: true });
  console.log(`Nexus: Tilføjet til Læseliste`);
};
