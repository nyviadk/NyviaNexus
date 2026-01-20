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
} from "firebase/firestore";
import {
  ArrowRightLeft,
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

  // Remote Fetching Data
  const [remoteSpaces, setRemoteSpaces] = useState<RemoteSpaceSummary[]>([]);
  const [remoteInbox, setRemoteInbox] = useState<TabData[]>([]);
  const [remoteIncognito, setRemoteIncognito] = useState<TabData[]>([]);

  const [fetchStatus, setFetchStatus] = useState<
    "idle" | "loading" | "error_perm" | "error_empty" | "success"
  >("idle");

  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [activeExpandedUid, setActiveExpandedUid] = useState<string | null>(
    null
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
  const contacts = useMemo(() => {
    const map = new Map<
      string,
      {
        uid: string;
        name: string;
        isAllowed: boolean;
        isSaved: boolean;
        viewEnabled: boolean;
      }
    >();

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

      // Vi behøver teknisk set ikke filter her da knappen er disabled ved duplicates,
      // men for sikkerheds skyld:
      const currentFiltered = savedTargets.filter((t) => t.uid !== uidToAdd);

      await setDoc(
        doc(db, "users", auth.currentUser.uid),
        {
          settings: {
            savedTargets: [...currentFiltered, newEntry],
          },
        },
        { merge: true }
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
        { merge: true }
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
        { merge: true }
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
      // 1. Fetch Spaces
      const spacesRef = collection(db, "users", targetUid, "workspaces_data");
      const spacesSnap = await getDocs(spacesRef);

      const spaces = spacesSnap.docs.map((d) => ({
        id: d.id,
        name: d.data().name || "Navnløst Space",
      }));

      // 2. Fetch Inbox & Incognito
      const inboxRef = doc(db, "users", targetUid, "inbox_data", "global");
      const inboxSnap = await getDoc(inboxRef);

      let inboxList: TabData[] = [];
      let incognitoList: TabData[] = [];

      if (inboxSnap.exists()) {
        const allTabs = (inboxSnap.data().tabs || []) as TabData[];
        inboxList = allTabs.filter((t) => !t.isIncognito);
        incognitoList = allTabs.filter((t) => t.isIncognito);
      }

      setRemoteSpaces(spaces);
      setRemoteInbox(inboxList);
      setRemoteIncognito(incognitoList);

      if (
        spaces.length === 0 &&
        inboxList.length === 0 &&
        incognitoList.length === 0
      ) {
        setFetchStatus("error_empty");
      } else {
        setFetchStatus("success");
      }
    } catch (err: any) {
      console.error("Fetch error code:", err.code);
      if (
        err.code === "permission-denied" ||
        (err.message && err.message.includes("permission"))
      ) {
        setFetchStatus("error_perm");
      } else {
        setFetchStatus("error_empty");
      }
    }
  };

  // --- COPY LOGIC ---

  const copyTabsToClipboard = async (tabs: TabData[], idForStatus: string) => {
    if (tabs.length === 0) return;
    setCopyStatus(idForStatus);
    await wait(300);

    const text = tabs.map((t) => t.url).join("\n");
    await navigator.clipboard.writeText(text);

    await wait(1000);
    setCopyStatus(null);
  };

  const copyRemoteSpace = async (spaceId: string) => {
    if (!activeExpandedUid) return;
    setCopyStatus(spaceId);
    await wait(500);

    try {
      const winsRef = collection(
        db,
        "users",
        activeExpandedUid,
        "workspaces_data",
        spaceId,
        "windows"
      );
      const q = query(winsRef, orderBy("createdAt", "asc"));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        alert("Space er tomt.");
        setCopyStatus(null);
        return;
      }

      const windowStrings = snapshot.docs.map((doc) => {
        const data = doc.data();
        const tabs = (data.tabs || []) as TabData[];
        return tabs.map((t) => t.url).join("\n");
      });

      const finalString = windowStrings.join("\n\n###\n\n");
      await navigator.clipboard.writeText(finalString);

      await wait(1500);
      setCopyStatus(null);
    } catch (err) {
      console.error(err);
      setCopyStatus(null);
    }
  };

  // --- ROW CLICK HANDLER ---
  const handleToggleRow = (contact: any) => {
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
    <div className="flex flex-col h-full gap-8 max-w-5xl mx-auto">
      {/* ---------------- TOP: IDENTITY CARD ---------------- */}
      <div className="bg-linear-to-r from-slate-900 via-slate-800 to-slate-900 p-6 rounded-3xl border border-slate-700/50 shadow-2xl relative overflow-hidden shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/2"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
              <Fingerprint size={18} /> Dit Nexus ID
            </h4>
            <p className="text-xs text-slate-400 max-w-md leading-relaxed">
              Dette er din unikke nøgle. Del den med dine andre enheder for at
              oprette forbindelse.
            </p>
          </div>
          <div className="flex w-full md:w-auto gap-2">
            <div className="flex-1 md:flex-none bg-slate-950/50 rounded-xl px-4 py-3 flex items-center gap-3 border border-slate-700/50 min-w-70">
              <Globe size={16} className="text-slate-500" />
              <code className="text-sm text-purple-100 truncate flex-1">
                {auth.currentUser?.uid}
              </code>
            </div>
            <button
              onClick={handleCopyMyUid}
              className={`px-4 rounded-xl transition-all duration-300 cursor-pointer shadow-lg active:scale-95 flex items-center justify-center gap-2 font-bold text-sm ${
                myUidCopied
                  ? "bg-green-500 text-white shadow-green-500/20 w-32"
                  : "bg-purple-600 hover:bg-purple-500 text-white shadow-purple-500/20 w-24"
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
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-2 px-1 mb-4">
          <Users size={16} className="text-purple-400" />
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Dine Forbindelser
          </h4>
          <span className="bg-slate-800 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-700">
            {contacts.length}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2 pb-10">
          {contacts.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-slate-800/50 rounded-3xl gap-4 text-slate-600 bg-slate-900/20">
              <div className="p-4 bg-slate-800/50 rounded-full">
                <Users size={32} className="opacity-50" />
              </div>
              <p className="text-sm font-medium">Ingen forbindelser fundet.</p>
            </div>
          )}

          {contacts.map((contact) => (
            <div key={contact.uid} className="flex flex-col gap-2">
              {/* --- ROW WRAPPER --- */}
              <div className="flex flex-col xl:flex-row gap-3 items-stretch">
                {/* 1. MAIN CARD (INFO & EXPAND) */}
                <div
                  onClick={() => handleToggleRow(contact)}
                  className={`flex-1 flex items-center gap-4 p-3 rounded-2xl border transition-all cursor-pointer group select-none ${
                    activeExpandedUid === contact.uid
                      ? "bg-slate-800 border-purple-500/50 shadow-lg shadow-purple-900/10"
                      : "bg-slate-900/40 border-slate-800 hover:border-slate-600 hover:bg-slate-800/60"
                  }`}
                >
                  <div
                    className={`p-3 rounded-xl transition-colors shrink-0 ${
                      activeExpandedUid === contact.uid
                        ? "bg-purple-500/20 text-purple-400"
                        : "bg-slate-800 text-slate-500 group-hover:text-purple-400 group-hover:bg-slate-700"
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
                        className={`font-bold text-sm truncate transition-colors ${
                          activeExpandedUid === contact.uid
                            ? "text-white"
                            : "text-slate-200 group-hover:text-white"
                        }`}
                      >
                        {contact.name}
                      </h3>
                    </div>
                    <p className="text-[10px]  text-slate-500 truncate mt-0.5 max-w-xs">
                      {contact.uid}
                    </p>
                  </div>
                  <div
                    className={`text-slate-600 transition-transform duration-300 pr-2 ${
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
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all cursor-pointer xl:min-w-40 justify-between group ${
                    contact.isAllowed
                      ? "bg-purple-950/20 border-purple-500/30 text-purple-400 hover:bg-purple-900/30 hover:border-purple-500/50"
                      : "bg-slate-900/40 border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300"
                  }`}
                  title={
                    contact.isAllowed
                      ? "Klik for at stoppe deling"
                      : "Klik for at dele"
                  }
                >
                  <div className="flex items-center gap-2">
                    {contact.isAllowed ? (
                      <Unlock size={16} />
                    ) : (
                      <Lock size={16} />
                    )}
                    <span className="text-xs font-bold uppercase tracking-wide">
                      Deling
                    </span>
                  </div>

                  {/* Toggle Switch Visual */}
                  <div
                    className={`w-8 h-4 rounded-full relative transition-colors ${
                      contact.isAllowed
                        ? "bg-purple-500"
                        : "bg-slate-700 group-hover:bg-slate-600"
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 bottom-0.5 w-3 h-3 bg-white rounded-full transition-all shadow-sm ${
                        contact.isAllowed ? "right-0.5" : "left-0.5"
                      }`}
                    ></div>
                  </div>
                </button>

                {/* 3. DELETE BUTTON */}
                <button
                  onClick={() => handleDeleteContact(contact.uid)}
                  disabled={processingId === contact.uid}
                  className="p-3 bg-slate-900/40 border border-slate-800 rounded-2xl text-slate-600 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-colors cursor-pointer shrink-0 flex items-center justify-center w-13"
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
                <div className="bg-slate-950/50 border border-slate-800/60 rounded-2xl p-4 md:p-6 animate-in slide-in-from-top-2 duration-300 shadow-inner">
                  {/* LOADER */}
                  {fetchStatus === "loading" && (
                    <div className="py-12 flex flex-col gap-3 items-center justify-center">
                      <Loader2
                        className="animate-spin text-purple-500"
                        size={32}
                      />
                      <span className="text-xs font-bold text-purple-400 animate-pulse uppercase tracking-wider">
                        Synkroniserer data...
                      </span>
                    </div>
                  )}

                  {/* ERROR: PERMISSION */}
                  {fetchStatus === "error_perm" && (
                    <div className="py-8 flex flex-col items-center justify-center gap-4 text-red-400">
                      <div className="p-3 bg-red-500/10 rounded-full border border-red-500/20">
                        <ShieldAlert size={32} />
                      </div>
                      <div className="text-center space-y-1">
                        <p className="text-sm font-bold uppercase">
                          Mangler adgang
                        </p>
                        <p className="text-xs text-slate-500 max-w-xs mx-auto">
                          {contact.name} skal aktivere{" "}
                          <strong className="text-slate-400">"Deling"</strong>{" "}
                          på deres enhed.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ERROR: EMPTY */}
                  {fetchStatus === "error_empty" && (
                    <div className="py-8 flex flex-col items-center justify-center gap-3 text-slate-300">
                      <div className="p-3 bg-purple-900/40 rounded-full">
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
                      {remoteSpaces.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 px-1 text-xs font-bold text-slate-400 uppercase tracking-wider">
                            <Layers size={14} /> Spaces ({remoteSpaces.length})
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {remoteSpaces.map((space) => (
                              <div
                                key={space.id}
                                className="flex items-center justify-between p-3 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-600 transition group"
                              >
                                <div className="flex items-center gap-3 overflow-hidden">
                                  <div className="w-2 h-8 rounded-full bg-purple-500/50 shrink-0"></div>
                                  <span className="text-sm font-medium text-slate-300 truncate pr-2">
                                    {space.name}
                                  </span>
                                </div>
                                <button
                                  onClick={() => copyRemoteSpace(space.id)}
                                  className="p-2 text-slate-500 hover:text-white hover:bg-slate-700 rounded-lg transition cursor-pointer"
                                  title="Kopier Space URLs"
                                >
                                  {copyStatus === space.id ? (
                                    <Check
                                      size={16}
                                      className="text-green-500"
                                    />
                                  ) : (
                                    <Copy size={16} />
                                  )}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* 2. INBOX TABS */}
                        {remoteInbox.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between px-1 border-b border-slate-800 pb-2">
                              <div className="flex items-center gap-2 text-xs font-bold text-purple-400 uppercase tracking-wider">
                                <Inbox size={14} /> Inbox ({remoteInbox.length})
                              </div>
                              <button
                                onClick={() =>
                                  copyTabsToClipboard(remoteInbox, "inbox")
                                }
                                className="text-[10px] font-bold bg-purple-500/10 text-purple-400 px-2 py-1 rounded hover:bg-purple-500 hover:text-white transition flex items-center gap-1 cursor-pointer"
                              >
                                {copyStatus === "inbox" ? (
                                  <Check size={12} />
                                ) : (
                                  <Copy size={12} />
                                )}
                                {copyStatus === "inbox" ? "Kopieret" : "Kopier"}
                              </button>
                            </div>
                            <div className="bg-slate-900/50 rounded-xl border border-slate-800/50 p-2 max-h-48 overflow-y-auto custom-scrollbar">
                              {remoteInbox.map((tab, i) => (
                                <div
                                  key={i}
                                  className="flex items-center gap-3 p-2 hover:bg-slate-800 rounded-lg text-xs text-slate-400 truncate group transition-colors"
                                >
                                  <img
                                    src={tab.favIconUrl || ""}
                                    className="w-4 h-4 rounded-sm bg-slate-800 shrink-0"
                                    alt=""
                                  />
                                  <span className="truncate flex-1 group-hover:text-slate-300">
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
                            <div className="flex items-center justify-between px-1 border-b border-slate-800 pb-2">
                              <div className="flex items-center gap-2 text-xs font-bold text-purple-400 uppercase tracking-wider">
                                <VenetianMask size={14} /> Incognito (
                                {remoteIncognito.length})
                              </div>
                              <button
                                onClick={() =>
                                  copyTabsToClipboard(
                                    remoteIncognito,
                                    "incognito"
                                  )
                                }
                                className="text-[10px] font-bold bg-purple-500/10 text-purple-400 px-2 py-1 rounded hover:bg-purple-500 hover:text-white transition flex items-center gap-1 cursor-pointer"
                              >
                                {copyStatus === "incognito" ? (
                                  <Check size={12} />
                                ) : (
                                  <Copy size={12} />
                                )}
                                {copyStatus === "incognito"
                                  ? "Kopieret"
                                  : "Kopier"}
                              </button>
                            </div>
                            <div className="bg-slate-900/50 rounded-xl border border-slate-800/50 p-2 max-h-48 overflow-y-auto custom-scrollbar">
                              {remoteIncognito.map((tab, i) => (
                                <div
                                  key={i}
                                  className="flex items-center gap-3 p-2 hover:bg-slate-800 rounded-lg text-xs text-slate-400 truncate group transition-colors"
                                >
                                  <img
                                    src={tab.favIconUrl || ""}
                                    className="w-4 h-4 rounded-sm bg-slate-800 shrink-0"
                                    alt=""
                                  />
                                  <span className="truncate flex-1 group-hover:text-slate-300">
                                    {tab.title}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex justify-center mt-2 border-t border-slate-800/50 pt-4">
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800">
                          <Share2 size={10} className="text-purple-500" />
                          Live data fra{" "}
                          <span className="text-slate-300 font-bold">
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
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Opret Ny Forbindelse
          </h4>
        </div>

        <div className="bg-slate-900/30 p-4 rounded-3xl border border-slate-800">
          <form
            onSubmit={handleAddContact}
            className="flex flex-col md:flex-row gap-4 items-start md:items-end"
          >
            <div className="flex-1 w-full space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">
                Navn <span className="text-purple-400">*</span>
              </label>
              <input
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                placeholder="F.eks. Arbejds PC"
                className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-3 text-sm outline-none focus:border-purple-500 focus:bg-slate-900 transition-all text-white placeholder:text-slate-600"
                required
              />
            </div>

            <div className="flex-2 w-full space-y-1.5 relative">
              <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">
                User ID (UID) <span className="text-purple-400">*</span>
              </label>
              <input
                value={inputUid}
                onChange={(e) => setInputUid(e.target.value)}
                placeholder="Indsæt ID..."
                className={`w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-3 text-sm outline-none transition-all text-white placeholder:text-slate-600  focus:border-purple-500 focus:bg-slate-900`}
                required
              />
            </div>

            <button
              type="submit"
              disabled={isAdding || !canAddContact}
              className={`w-full md:w-auto px-6 py-3 rounded-xl transition-all duration-200 cursor-pointer shadow-lg font-bold text-sm flex items-center justify-center gap-2 min-w-30 h-11.5 ${
                !canAddContact
                  ? "bg-slate-800 text-slate-600 border border-slate-700 cursor-not-allowed shadow-none"
                  : "bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/30 hover:scale-105"
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
