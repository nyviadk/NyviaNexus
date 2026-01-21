import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import {
  ArrowRightLeft,
  Ban,
  Check,
  ChevronDown,
  Copy,
  Fingerprint,
  FolderOpen,
  Globe,
  Inbox,
  Layers,
  Loader2,
  Lock,
  Monitor,
  Plus,
  ServerCrash,
  Share2,
  ShieldAlert,
  Trash2,
  Unlock,
  Users,
  VenetianMask,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "../../lib/firebase";
import { TabData } from "../../types";

// --- TYPES ---
interface RemoteSpaceSummary {
  id: string;
  name: string;
}

interface SavedTarget {
  uid: string;
  name: string;
  viewEnabled?: boolean;
}

interface UserSettingsData {
  allowedViewers?: string[];
  savedTargets?: (string | SavedTarget)[];
}

interface ContactItem {
  uid: string;
  name: string;
  isAllowed: boolean;
  isSaved: boolean;
  viewEnabled: boolean;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const RemoteAccessSettings = () => {
  // --- STATE ---
  const [allowedViewers, setAllowedViewers] = useState<string[]>([]);
  const [savedTargets, setSavedTargets] = useState<SavedTarget[]>([]);

  // Inputs
  const [inputUid, setInputUid] = useState("");
  const [inputName, setInputName] = useState("");

  // UI States
  const [myUidCopied, setMyUidCopied] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Ny state til at håndtere loading specifikt på kopier-knapper
  const [copyingId, setCopyingId] = useState<string | null>(null);

  // Remote Fetching Data
  const [remoteSpaces, setRemoteSpaces] = useState<RemoteSpaceSummary[]>([]);
  const [remoteInbox, setRemoteInbox] = useState<TabData[]>([]);
  const [remoteIncognito, setRemoteIncognito] = useState<TabData[]>([]);

  const [fetchStatus, setFetchStatus] = useState<
    | "idle"
    | "loading"
    | "error_perm"
    | "error_empty"
    | "success"
    | "partial_error"
  >("idle");

  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [activeExpandedUid, setActiveExpandedUid] = useState<string | null>(
    null,
  );

  // --- DATA SYNC ---
  useEffect(() => {
    if (!auth.currentUser) return;
    const unsub = onSnapshot(doc(db, "users", auth.currentUser.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const settings = data.settings as UserSettingsData | undefined;

        setAllowedViewers(settings?.allowedViewers || []);

        const rawTargets = settings?.savedTargets || [];
        const processedTargets: SavedTarget[] = rawTargets.map((t) => {
          if (typeof t === "string") {
            return { uid: t, name: "Ukendt Enhed", viewEnabled: false };
          }
          return { ...t, viewEnabled: t.viewEnabled ?? false };
        });
        setSavedTargets(processedTargets);
      } else {
        setAllowedViewers([]);
        setSavedTargets([]);
      }
    });
    return () => unsub();
  }, []);

  // --- MERGED CONTACT LIST ---
  const contacts = useMemo<ContactItem[]>(() => {
    const map = new Map<string, ContactItem>();

    savedTargets.forEach((t) => {
      map.set(t.uid, {
        uid: t.uid,
        name: t.name,
        isAllowed: false,
        isSaved: true,
        viewEnabled: t.viewEnabled || false,
      });
    });

    allowedViewers.forEach((uid) => {
      if (map.has(uid)) {
        const existing = map.get(uid)!;
        map.set(uid, { ...existing, isAllowed: true });
      } else {
        map.set(uid, {
          uid,
          name: "Ukendt (Kun ID)",
          isAllowed: true,
          isSaved: false,
          viewEnabled: false,
        });
      }
    });

    return Array.from(map.values());
  }, [savedTargets, allowedViewers]);

  // --- VALIDATION LOGIC ---
  const canAddContact = useMemo(() => {
    if (!auth.currentUser) return false;
    const cleanUid = inputUid.trim();
    const cleanName = inputName.trim();

    if (!cleanUid || !cleanName) return false;
    if (cleanUid === auth.currentUser.uid) return false; // Self

    // Check duplicates
    const exists = savedTargets.some((t) => t.uid === cleanUid);
    if (exists) return false;

    return true;
  }, [inputUid, inputName, savedTargets]);

  // --- ACTIONS ---

  const handleCopyMyUid = async () => {
    if (auth.currentUser) {
      await navigator.clipboard.writeText(auth.currentUser.uid);
      setMyUidCopied(true);
      setTimeout(() => setMyUidCopied(false), 2000);
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAddContact || !auth.currentUser) return;

    setIsAdding(true);
    await wait(600);

    try {
      const uidToAdd = inputUid.trim();
      const newEntry: SavedTarget = {
        uid: uidToAdd,
        name: inputName.trim(),
        viewEnabled: false,
      };

      const currentFiltered = savedTargets.filter((t) => t.uid !== uidToAdd);

      await setDoc(
        doc(db, "users", auth.currentUser.uid),
        {
          settings: {
            savedTargets: [...currentFiltered, newEntry],
          },
        },
        { merge: true },
      );

      setInputUid("");
      setInputName("");
    } catch (err) {
      console.error(err);
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteContact = async (uid: string) => {
    if (
      !auth.currentUser ||
      !confirm("Slet denne kontakt og alle rettigheder?")
    )
      return;

    setProcessingId(uid);
    await wait(800);

    try {
      const userRef = doc(db, "users", auth.currentUser.uid);
      const newSaved = savedTargets.filter((t) => t.uid !== uid);

      await setDoc(
        userRef,
        {
          settings: {
            savedTargets: newSaved,
            allowedViewers: arrayRemove(uid),
          },
        },
        { merge: true },
      );

      if (activeExpandedUid === uid) setActiveExpandedUid(null);
    } catch (err) {
      console.error(err);
    } finally {
      setProcessingId(null);
    }
  };

  const toggleAccess = async (uid: string, currentStatus: boolean) => {
    if (!auth.currentUser) return;
    setProcessingId(uid);
    await wait(600);

    try {
      await setDoc(
        doc(db, "users", auth.currentUser.uid),
        {
          settings: {
            allowedViewers: currentStatus ? arrayRemove(uid) : arrayUnion(uid),
          },
        },
        { merge: true },
      );
    } catch (err) {
      console.error(err);
    } finally {
      setProcessingId(null);
    }
  };

  // --- FETCH LOGIC ---

  const fetchRemoteData = async (targetUid: string) => {
    setActiveExpandedUid(targetUid);
    setFetchStatus("loading");
    setRemoteSpaces([]);
    setRemoteInbox([]);
    setRemoteIncognito([]);

    await wait(800);

    try {
      const itemsQuery = query(
        collection(db, "users", targetUid, "items"),
        where("type", "==", "workspace"),
      );

      const [spacesResult, inboxResult] = await Promise.allSettled([
        getDocs(itemsQuery),
        getDoc(doc(db, "users", targetUid, "inbox_data", "global")),
      ]);

      let hasPermissionError = false;
      let newSpaces: RemoteSpaceSummary[] = [];
      let newInbox: TabData[] = [];
      let newIncognito: TabData[] = [];

      // 1. Handle Spaces Result
      if (spacesResult.status === "fulfilled") {
        newSpaces = spacesResult.value.docs.map((d) => ({
          id: d.id,
          name: d.data().name || "Navnløst Space",
        }));
      } else {
        console.error(
          "Failed to fetch spaces from items:",
          spacesResult.reason,
        );
        const err = spacesResult.reason as any;
        if (err.code === "permission-denied") hasPermissionError = true;
      }

      // 2. Handle Inbox Result
      if (inboxResult.status === "fulfilled") {
        const snap = inboxResult.value;
        if (snap.exists()) {
          const allTabs = (snap.data().tabs || []) as TabData[];
          newInbox = allTabs.filter((t) => !t.isIncognito);
          newIncognito = allTabs.filter((t) => t.isIncognito);
        }
      } else {
        console.error("Failed to fetch inbox:", inboxResult.reason);
        const err = inboxResult.reason as any;
        if (err.code === "permission-denied") hasPermissionError = true;
      }

      setRemoteSpaces(newSpaces);
      setRemoteInbox(newInbox);
      setRemoteIncognito(newIncognito);

      // 3. Determine Final Status
      if (
        hasPermissionError &&
        newSpaces.length === 0 &&
        newInbox.length === 0
      ) {
        setFetchStatus("error_perm");
      } else if (
        newSpaces.length === 0 &&
        newInbox.length === 0 &&
        newIncognito.length === 0
      ) {
        setFetchStatus("error_empty");
      } else {
        setFetchStatus("success");
      }
    } catch (err: unknown) {
      console.error("Critical fetch error:", err);
      setFetchStatus("error_empty");
    }
  };

  // --- COPY LOGIC (FIXED) ---

  const copyTabsToClipboard = async (tabs: TabData[], idForStatus: string) => {
    // 1. Tjek om der faktisk er faner at kopiere
    if (!tabs || tabs.length === 0) {
      setCopyStatus(`${idForStatus}_empty`);
      await wait(1500);
      setCopyStatus(null);
      return;
    }

    // 2. Start Success flow
    setCopyStatus(idForStatus);
    await wait(300);

    const text = tabs.map((t) => t.url).join("\n");
    await navigator.clipboard.writeText(text);

    await wait(1000);
    setCopyStatus(null);
  };

  const copyRemoteSpace = async (spaceId: string) => {
    if (!activeExpandedUid || copyingId) return; // Forhindrer dobbelt-klik

    // 1. Indiker at vi loader (vis spinner)
    setCopyingId(spaceId);

    try {
      const winsRef = collection(
        db,
        "users",
        activeExpandedUid,
        "workspaces_data",
        spaceId,
        "windows",
      );

      const q = query(winsRef, orderBy("createdAt", "asc"));
      const snapshot = await getDocs(q);

      // 2. Ekstraher ALLE faner fra ALLE vinduer
      const allTabs: TabData[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.tabs && Array.isArray(data.tabs)) {
          allTabs.push(...data.tabs);
        }
      });

      // 3. Tjek om der faktisk er faner
      if (allTabs.length === 0) {
        setCopyingId(null); // Stop spinner
        setCopyStatus(`${spaceId}_empty`); // Vis "Tom"
        await wait(1500);
        setCopyStatus(null);
        return;
      }

      // 4. Hvis der er data, formatér og kopier
      const windowStrings = snapshot.docs.map((doc) => {
        const data = doc.data();
        const tabs = (data.tabs || []) as TabData[];
        return tabs.map((t) => t.url).join("\n");
      });

      const finalString = windowStrings.join("\n\n###\n\n");
      await navigator.clipboard.writeText(finalString);

      // 5. Vis Success
      setCopyingId(null);
      setCopyStatus(spaceId);
      await wait(1500);
      setCopyStatus(null);
    } catch (err) {
      console.error("Copy Space Error:", err);
      setCopyingId(null);
      setCopyStatus(null);
      alert(
        "Kunne ikke kopiere space. Mangler muligvis rettigheder eller index.",
      );
    }
  };

  // --- ROW CLICK HANDLER ---
  const handleToggleRow = (contact: ContactItem) => {
    if (processingId === contact.uid) return;

    if (activeExpandedUid === contact.uid) {
      setActiveExpandedUid(null);
      setRemoteSpaces([]);
      setRemoteInbox([]);
      setRemoteIncognito([]);
    } else {
      fetchRemoteData(contact.uid);
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-8">
      {/* ---------------- TOP: IDENTITY CARD ---------------- */}
      <div className="relative shrink-0 overflow-hidden rounded-3xl border border-slate-700/50 bg-linear-to-r from-slate-900 via-slate-800 to-slate-900 p-6 shadow-2xl">
        <div className="pointer-events-none absolute top-0 right-0 h-64 w-64 translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-500/10 blur-3xl"></div>
        <div className="relative z-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="space-y-1">
            <h4 className="flex items-center gap-2 text-sm font-bold tracking-widest text-white uppercase">
              <Fingerprint size={18} /> Dit Nexus ID
            </h4>
            <p className="max-w-md text-xs leading-relaxed text-slate-400">
              Dette er din unikke nøgle. Del den med dine andre enheder for at
              oprette forbindelse.
            </p>
          </div>
          <div className="flex w-full gap-2 md:w-auto">
            <div className="flex min-w-70 flex-1 items-center gap-3 rounded-xl border border-slate-700/50 bg-slate-950/50 px-4 py-3 md:flex-none">
              <Globe size={16} className="text-slate-500" />
              <code className="flex-1 truncate text-sm text-purple-100">
                {auth.currentUser?.uid}
              </code>
            </div>
            <button
              onClick={handleCopyMyUid}
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold shadow-lg transition-all duration-300 active:scale-95 ${
                myUidCopied
                  ? "w-32 bg-green-500 text-white shadow-green-500/20"
                  : "w-24 bg-purple-600 text-white shadow-purple-500/20 hover:bg-purple-500"
              }`}
            >
              {myUidCopied ? (
                <>
                  <Check size={16} /> Kopieret
                </>
              ) : (
                <>
                  <Copy size={16} /> Kopier
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ---------------- MIDDLE: CONTACT LIST ---------------- */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-4 flex items-center gap-2 px-1">
          <Users size={16} className="text-purple-400" />
          <h4 className="text-xs font-bold tracking-wider text-slate-300 uppercase">
            Dine Forbindelser
          </h4>
          <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-500">
            {contacts.length}
          </span>
        </div>

        <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto pr-2 pb-10">
          {contacts.length === 0 && (
            <div className="flex h-48 flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-slate-800/50 bg-slate-900/20 text-slate-600">
              <div className="rounded-full bg-slate-800/50 p-4">
                <Users size={32} className="opacity-50" />
              </div>
              <p className="text-sm font-medium">Ingen forbindelser fundet.</p>
            </div>
          )}

          {contacts.map((contact) => (
            <div key={contact.uid} className="flex flex-col gap-2">
              {/* --- ROW WRAPPER --- */}
              <div className="flex flex-col items-stretch gap-3 xl:flex-row">
                {/* 1. MAIN CARD (INFO & EXPAND) */}
                <div
                  onClick={() => handleToggleRow(contact)}
                  className={`group flex flex-1 cursor-pointer items-center gap-4 rounded-2xl border p-3 transition-all select-none ${
                    activeExpandedUid === contact.uid
                      ? "border-purple-500/50 bg-slate-800 shadow-lg shadow-purple-900/10"
                      : "border-slate-800 bg-slate-900/40 hover:border-slate-600 hover:bg-slate-800/60"
                  }`}
                >
                  <div
                    className={`shrink-0 rounded-xl p-3 transition-colors ${
                      activeExpandedUid === contact.uid
                        ? "bg-purple-500/20 text-purple-400"
                        : "bg-slate-800 text-slate-500 group-hover:bg-slate-700 group-hover:text-purple-400"
                    }`}
                  >
                    {activeExpandedUid === contact.uid ? (
                      <FolderOpen size={20} />
                    ) : (
                      <Monitor size={20} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3
                        className={`truncate text-sm font-bold transition-colors ${
                          activeExpandedUid === contact.uid
                            ? "text-white"
                            : "text-slate-200 group-hover:text-white"
                        }`}
                      >
                        {contact.name}
                      </h3>
                    </div>
                    <p className="mt-0.5 max-w-xs truncate text-[10px] text-slate-500">
                      {contact.uid}
                    </p>
                  </div>
                  <div
                    className={`pr-2 text-slate-600 transition-transform duration-300 ${
                      activeExpandedUid === contact.uid
                        ? "rotate-180 text-purple-400"
                        : "group-hover:translate-y-0.5"
                    }`}
                  >
                    <ChevronDown size={20} />
                  </div>
                </div>

                {/* 2. SHARE BUTTON (TOGGLE) */}
                <button
                  onClick={() =>
                    processingId !== contact.uid &&
                    toggleAccess(contact.uid, contact.isAllowed)
                  }
                  disabled={processingId === contact.uid}
                  className={`group flex cursor-pointer items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-all xl:min-w-44 ${
                    contact.isAllowed
                      ? "border-purple-500/30 bg-purple-950/20 text-purple-400 hover:border-purple-500/50 hover:bg-purple-900/30"
                      : "border-slate-800 bg-slate-900/40 text-slate-500 hover:border-slate-600 hover:text-slate-300"
                  }`}
                  title={
                    contact.isAllowed
                      ? "Klik for at fjerne adgang"
                      : "Klik for at give adgang"
                  }
                >
                  <div className="flex items-center gap-2">
                    {contact.isAllowed ? (
                      <Unlock size={16} />
                    ) : (
                      <Lock size={16} />
                    )}
                    <span className="text-xs font-bold tracking-wide uppercase">
                      {/* Dynamisk tekst baseret på permission state */}
                      {contact.isAllowed ? "Har adgang" : "Ingen adgang"}
                    </span>
                  </div>

                  {/* Toggle Switch Visual */}
                  <div
                    className={`relative h-4 w-8 rounded-full transition-colors ${
                      contact.isAllowed
                        ? "bg-purple-500"
                        : "bg-slate-700 group-hover:bg-slate-600"
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 bottom-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all ${
                        contact.isAllowed ? "right-0.5" : "left-0.5"
                      }`}
                    ></div>
                  </div>
                </button>

                {/* 3. DELETE BUTTON */}
                <button
                  onClick={() => handleDeleteContact(contact.uid)}
                  disabled={processingId === contact.uid}
                  className="flex w-13 shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/40 p-3 text-slate-600 transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
                  title="Slet forbindelse"
                >
                  {processingId === contact.uid ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Trash2 size={18} />
                  )}
                </button>
              </div>

              {/* --- DRAWER (Expanded Content) --- */}
              {activeExpandedUid === contact.uid && (
                <div className="animate-in slide-in-from-top-2 rounded-2xl border border-slate-800/60 bg-slate-950/50 p-4 shadow-inner duration-300 md:p-6">
                  {/* LOADER */}
                  {fetchStatus === "loading" && (
                    <div className="flex flex-col items-center justify-center gap-3 py-12">
                      <Loader2
                        className="animate-spin text-purple-500"
                        size={32}
                      />
                      <span className="animate-pulse text-xs font-bold tracking-wider text-purple-400 uppercase">
                        Synkroniserer data...
                      </span>
                    </div>
                  )}

                  {/* ERROR: PERMISSION */}
                  {fetchStatus === "error_perm" && (
                    <div className="flex flex-col items-center justify-center gap-4 py-8 text-red-400">
                      <div className="rounded-full border border-red-500/20 bg-red-500/10 p-3">
                        <ShieldAlert size={32} />
                      </div>
                      <div className="space-y-1 text-center">
                        <p className="text-sm font-bold uppercase">
                          Mangler adgang
                        </p>
                        <p className="mx-auto max-w-xs text-xs text-slate-500">
                          {contact.name} skal aktivere{" "}
                          <strong className="text-slate-400">"Deling"</strong>{" "}
                          på deres enhed.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ERROR: EMPTY */}
                  {fetchStatus === "error_empty" && (
                    <div className="flex flex-col items-center justify-center gap-3 py-8 text-slate-300">
                      <div className="rounded-full bg-purple-900/40 p-3">
                        <ServerCrash size={24} />
                      </div>
                      <p className="text-sm font-bold">Ingen data fundet</p>
                      <p className="text-xs text-slate-400">
                        Kunne ikke finde aktive spaces eller faner.
                      </p>
                    </div>
                  )}

                  {/* SUCCESS: DATA DISPLAY */}
                  {fetchStatus === "success" && (
                    <div className="flex flex-col gap-6">
                      {/* 1. SPACES */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 px-1 text-xs font-bold tracking-wider text-slate-400 uppercase">
                          <Layers size={14} /> Spaces ({remoteSpaces.length})
                        </div>
                        {remoteSpaces.length > 0 ? (
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {remoteSpaces.map((space) => {
                              const isEmptyState =
                                copyStatus === `${space.id}_empty`;
                              const isCopiedState = copyStatus === space.id;
                              const isLoading = copyingId === space.id;

                              return (
                                <div
                                  key={space.id}
                                  className="group flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 p-3 transition hover:border-slate-600"
                                >
                                  <div className="flex items-center gap-3 overflow-hidden">
                                    <div className="h-8 w-2 shrink-0 rounded-full bg-purple-500/50"></div>
                                    <span className="truncate pr-2 text-sm font-medium text-slate-300">
                                      {space.name}
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => copyRemoteSpace(space.id)}
                                    disabled={isLoading}
                                    className={`cursor-pointer rounded-lg p-2 transition ${
                                      isEmptyState
                                        ? "bg-orange-500/10 text-orange-400 hover:bg-orange-500/20"
                                        : "text-slate-500 hover:bg-slate-700 hover:text-white"
                                    }`}
                                    title={
                                      isEmptyState
                                        ? "Space er tomt"
                                        : "Kopier Space URLs"
                                    }
                                  >
                                    {isLoading ? (
                                      <Loader2
                                        size={16}
                                        className="animate-spin text-purple-400"
                                      />
                                    ) : isCopiedState ? (
                                      <Check
                                        size={16}
                                        className="text-green-500"
                                      />
                                    ) : isEmptyState ? (
                                      <span className="text-[10px] font-bold">
                                        TOM
                                      </span>
                                    ) : (
                                      <Copy size={16} />
                                    )}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-4 text-xs text-slate-500">
                            <Layers size={14} className="opacity-50" />
                            <span>Ingen offentlige spaces fundet.</span>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                        {/* 2. INBOX TABS */}
                        {remoteInbox.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between border-b border-slate-800 px-1 pb-2">
                              <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-purple-400 uppercase">
                                <Inbox size={14} /> Inbox ({remoteInbox.length})
                              </div>
                              <button
                                onClick={() =>
                                  copyTabsToClipboard(remoteInbox, "inbox")
                                }
                                className={`flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-[10px] font-bold transition ${
                                  copyStatus === "inbox_empty"
                                    ? "bg-orange-500/10 text-orange-400 hover:bg-orange-500/20"
                                    : "bg-purple-500/10 text-purple-400 hover:bg-purple-500 hover:text-white"
                                }`}
                              >
                                {copyStatus === "inbox" ? (
                                  <Check size={12} />
                                ) : copyStatus === "inbox_empty" ? (
                                  <Ban size={12} />
                                ) : (
                                  <Copy size={12} />
                                )}
                                {copyStatus === "inbox"
                                  ? "Kopieret"
                                  : copyStatus === "inbox_empty"
                                    ? "Tom"
                                    : "Kopier"}
                              </button>
                            </div>
                            <div className="custom-scrollbar max-h-48 overflow-y-auto rounded-xl border border-slate-800/50 bg-slate-900/50 p-2">
                              {remoteInbox.map((tab, i) => (
                                <div
                                  key={i}
                                  className="group flex items-center gap-3 truncate rounded-lg p-2 text-xs text-slate-400 transition-colors hover:bg-slate-800"
                                >
                                  <img
                                    src={tab.favIconUrl || ""}
                                    className="h-4 w-4 shrink-0 rounded-sm bg-slate-800"
                                    alt=""
                                  />
                                  <span className="flex-1 truncate group-hover:text-slate-300">
                                    {tab.title}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 3. INCOGNITO TABS */}
                        {remoteIncognito.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between border-b border-slate-800 px-1 pb-2">
                              <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-purple-400 uppercase">
                                <VenetianMask size={14} /> Incognito (
                                {remoteIncognito.length})
                              </div>
                              <button
                                onClick={() =>
                                  copyTabsToClipboard(
                                    remoteIncognito,
                                    "incognito",
                                  )
                                }
                                className={`flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-[10px] font-bold transition ${
                                  copyStatus === "incognito_empty"
                                    ? "bg-orange-500/10 text-orange-400 hover:bg-orange-500/20"
                                    : "bg-purple-500/10 text-purple-400 hover:bg-purple-500 hover:text-white"
                                }`}
                              >
                                {copyStatus === "incognito" ? (
                                  <Check size={12} />
                                ) : copyStatus === "incognito_empty" ? (
                                  <Ban size={12} />
                                ) : (
                                  <Copy size={12} />
                                )}
                                {copyStatus === "incognito"
                                  ? "Kopieret"
                                  : copyStatus === "incognito_empty"
                                    ? "Tom"
                                    : "Kopier"}
                              </button>
                            </div>
                            <div className="custom-scrollbar max-h-48 overflow-y-auto rounded-xl border border-slate-800/50 bg-slate-900/50 p-2">
                              {remoteIncognito.map((tab, i) => (
                                <div
                                  key={i}
                                  className="group flex items-center gap-3 truncate rounded-lg p-2 text-xs text-slate-400 transition-colors hover:bg-slate-800"
                                >
                                  <img
                                    src={tab.favIconUrl || ""}
                                    className="h-4 w-4 shrink-0 rounded-sm bg-slate-800"
                                    alt=""
                                  />
                                  <span className="flex-1 truncate group-hover:text-slate-300">
                                    {tab.title}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="mt-2 flex justify-center border-t border-slate-800/50 pt-4">
                        <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-[10px] text-slate-500">
                          <Share2 size={10} className="text-purple-500" />
                          Data-snapshot fra{" "}
                          <span className="font-bold text-slate-300">
                            {contact.name}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ---------------- BOTTOM: ADD CONTACT FORM ---------------- */}
      <div className="shrink-0 space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Plus size={16} className="text-purple-400" />
          <h4 className="text-xs font-bold tracking-wider text-slate-300 uppercase">
            Opret Ny Forbindelse
          </h4>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/30 p-4">
          <form
            onSubmit={handleAddContact}
            className="flex flex-col items-start gap-4 md:flex-row md:items-end"
          >
            <div className="w-full flex-1 space-y-1.5">
              <label className="ml-1 text-[10px] font-bold text-slate-500 uppercase">
                Navn <span className="text-purple-400">*</span>
              </label>
              <input
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                placeholder="F.eks. Arbejds PC"
                className="w-full rounded-xl border border-slate-700/50 bg-slate-950/50 px-4 py-3 text-sm text-white transition-all outline-none placeholder:text-slate-600 focus:border-purple-500 focus:bg-slate-900"
                required
              />
            </div>

            <div className="relative w-full flex-2 space-y-1.5">
              <label className="ml-1 text-[10px] font-bold text-slate-500 uppercase">
                User ID (UID) <span className="text-purple-400">*</span>
              </label>
              <input
                value={inputUid}
                onChange={(e) => setInputUid(e.target.value)}
                placeholder="Indsæt ID..."
                className={`w-full rounded-xl border border-slate-700/50 bg-slate-950/50 px-4 py-3 text-sm text-white transition-all outline-none placeholder:text-slate-600 focus:border-purple-500 focus:bg-slate-900`}
                required
              />
            </div>

            <button
              type="submit"
              disabled={isAdding || !canAddContact}
              className={`flex h-11.5 w-full min-w-30 cursor-pointer items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold shadow-lg transition-all duration-200 md:w-auto ${
                !canAddContact
                  ? "cursor-not-allowed border border-slate-700 bg-slate-800 text-slate-600 shadow-none"
                  : "bg-purple-600 text-white shadow-purple-900/30 hover:scale-105 hover:bg-purple-500"
              }`}
            >
              {isAdding ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  <ArrowRightLeft size={18} /> Opret
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
