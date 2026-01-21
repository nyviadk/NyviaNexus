import {
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  arrayUnion,
  collection,
  getDocs,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import {
  ClipboardPaste,
  Layers,
  Link as LinkIcon,
  Loader2,
  PlusCircle,
  Save,
  ToggleLeft,
  ToggleRight,
  X,
  Maximize,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { db } from "../lib/firebase";
import { LinkManager } from "../services/linkManager";
import { WinMapping } from "@/background/main";
import { WorkspaceWindow } from "../types";

interface PasteModalProps {
  workspaceId: string;
  windowId?: string | null; // Null = Nyt Vindue (Standard nu)
  windowName?: string;
  activeMappings?: [number, WinMapping][];
  windows?: WorkspaceWindow[]; // Liste af eksisterende vinduer til korrekt nummerering
  onClose: () => void;
}

interface WindowStat {
  index: number;
  count: number;
  // Vi tilføjer en dynamisk titel til stat-objektet
  dynamicTitle: string;
}

export const PasteModal = ({
  workspaceId,
  windowId,
  windowName,
  activeMappings = [],
  windows = [],
  onClose,
}: PasteModalProps) => {
  const [text, setText] = useState("");
  const [uniqueOnly, setUniqueOnly] = useState(false); // Default: Tillad dubletter
  const [isSaving, setIsSaving] = useState(false);
  const [useEmptyWindow, setUseEmptyWindow] = useState(true); // Toggle til at genbruge tomt vindue

  // Stats til preview
  const [previewStats, setPreviewStats] = useState<WindowStat[]>([]);
  const [totalLinks, setTotalLinks] = useState(0);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const mouseDownTarget = useRef<EventTarget | null>(null);

  const isCreatingNew = !windowId;

  // Beregn om der findes et genbrugeligt vindue (Memoized for performance og UI toggle visning)
  // Dette bruges KUN til at vise/skjule knappen og beregne preview titler.
  // Selve save-logikken henter frisk data fra DB.
  const availableReuseIndex = useMemo(() => {
    if (!isCreatingNew) return -1;

    // Vi leder efter det første vindue der er tomt og lukket i den tilsendte liste
    return windows.findIndex((w) => {
      const isEmpty = !w.tabs || w.tabs.length === 0;
      const isPhysicallyOpen = activeMappings.some(
        ([_, mapping]) => mapping.internalWindowId === w.id,
      );
      return isEmpty && !isPhysicallyOpen;
    });
  }, [windows, activeMappings, isCreatingNew]);

  // Tjek om der rent faktisk er dubletter i inputtet pr. sektion
  // Dette bestemmer om "Kun Unikke" knappen skal vises
  const hasDuplicates = useMemo(() => {
    if (!text.trim()) return false;

    const sections = text.split("###");

    // Vi tjekker hver sektion. Hvis bare én sektion har dubletter, viser vi muligheden.
    return sections.some((section) => {
      // Vi parser med uniqueOnly = false for at se rå data
      const tabs = LinkManager.parseAndCreateTabs(section, false);
      const urls = tabs.map((t) => t.url);
      const uniqueUrls = new Set(urls);

      // Hvis længden af arrayet er større end settet, er der dubletter
      return urls.length > uniqueUrls.size;
    });
  }, [text]);

  useEffect(() => {
    if (dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal();
    }
  }, []);

  // Håndter lukning: Kun hvis man KLIKKER på baggrunden (mousedown + mouseup på backdrop)
  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    mouseDownTarget.current = e.target;
  };

  const handleBackdropMouseUp = (e: React.MouseEvent) => {
    if (
      e.target === dialogRef.current &&
      mouseDownTarget.current === dialogRef.current
    ) {
      onClose();
    }
    mouseDownTarget.current = null;
  };

  // Beregn preview stats når tekst eller settings ændres
  useEffect(() => {
    const calculateStats = () => {
      let stats: WindowStat[] = [];
      let total = 0;

      // Bestem om vi faktisk skal bruge det fundne vindue (hvis toggle er aktiv og vindue findes)
      const reusableWindowIndex = useEmptyWindow ? availableReuseIndex : -1;
      const totalExistingWindows = windows.length;

      if (isCreatingNew && text.includes("###")) {
        // Batch mode logik
        const sections = text.split("###");

        let addedWindowsCount = 0; // Tæller hvor mange *nye* vinduer vi har tilføjet i denne batch

        sections.forEach((section, idx) => {
          const links = LinkManager.parseAndCreateTabs(section, uniqueOnly);
          if (links.length > 0) {
            // Beregn navnet
            let displayName = "";

            // Hvis det er første gruppe, og vi har et genbrugeligt vindue
            if (idx === 0 && reusableWindowIndex !== -1) {
              // Vi bruger det eksisterende vindues nummer (1-based index)
              displayName = windowName || `Vindue ${reusableWindowIndex + 1}`;
            } else {
              // Ellers er det et nyt vindue i enden af listen
              // Nummeret er: Antal nuværende + Antal vi allerede har lavet i denne batch + 1
              const visualIndex = totalExistingWindows + addedWindowsCount + 1;
              displayName = windowName
                ? `${windowName} ${idx + 1}`
                : `Vindue ${visualIndex}`;
              addedWindowsCount++;
            }

            stats.push({
              index: idx + 1, // Internt ID til key
              count: links.length,
              dynamicTitle: displayName,
            });
            total += links.length;
          }
        });
      } else {
        // Standard mode (eller enkelt vindue)
        const urls = LinkManager.parseAndCreateTabs(text, uniqueOnly);
        if (urls.length > 0) {
          let displayName = "";
          if (isCreatingNew) {
            if (reusableWindowIndex !== -1) {
              displayName = windowName || `Vindue ${reusableWindowIndex + 1}`;
            } else {
              displayName = windowName || `Vindue ${totalExistingWindows + 1}`;
            }
          } else {
            displayName = windowName || "Eksisterende Vindue";
          }

          stats.push({
            index: 1,
            count: urls.length,
            dynamicTitle: displayName,
          });
          total += urls.length;
        }
      }

      setPreviewStats(stats);
      setTotalLinks(total);
    };

    calculateStats();
  }, [
    text,
    uniqueOnly,
    isCreatingNew,
    useEmptyWindow,
    windows,
    windowName,
    availableReuseIndex,
  ]);

  const handleSave = async () => {
    if (totalLinks === 0) return;

    const auth = getAuth();
    const currentUser = auth.currentUser;

    if (!currentUser) {
      alert("Fejl: Ingen bruger logget ind.");
      return;
    }

    setIsSaving(true);
    const uid = currentUser.uid;

    try {
      // SCENARIE A: Indsæt i eksisterende vindue (Hvis specifikt ID er sendt med)
      if (windowId) {
        const newTabs = LinkManager.parseAndCreateTabs(text, uniqueOnly);

        const windowRef = doc(
          db,
          "users",
          uid,
          "workspaces_data",
          workspaceId,
          "windows",
          windowId,
        );

        await updateDoc(windowRef, {
          tabs: arrayUnion(...newTabs),
        });
      }
      // SCENARIE B: Opret nye vinduer (Batch / Smart Logic)
      else {
        // 1. Find sektioner
        const rawSections = text.split("###");

        // 2. Tjek om vi kan genbruge et tomt vindue (KUN for første sektion)
        let reusedWindowId: string | null = null;

        if (useEmptyWindow) {
          const windowsRef = collection(
            db,
            "users",
            uid,
            "workspaces_data",
            workspaceId,
            "windows",
          );
          const snap = await getDocs(windowsRef);

          if (snap.size === 1) {
            const docSnap = snap.docs[0];
            const data = docSnap.data();
            const wId = docSnap.id;

            // Tjek: Er tabs tomme?
            const isEmpty = !data.tabs || data.tabs.length === 0;
            // Tjek: Er vinduet fysisk åbent?
            // Vi mapper activeMappings for at se om Internal ID'et findes
            const isPhysicallyOpen = activeMappings.some(
              ([_, mapping]) => mapping.internalWindowId === wId,
            );

            if (isEmpty && !isPhysicallyOpen) {
              reusedWindowId = wId;
            }
          } else {
            // Hvis der er flere vinduer i DB, skal vi stadig finde "det tomme" hvis det findes
            // For at matche UI'et præcist, genbruger vi logikken om at finde det første ledige
            const allDocs = snap.docs;
            const target = allDocs.find((d) => {
              const dData = d.data();
              const isEmpty = !dData.tabs || dData.tabs.length === 0;
              const isOpen = activeMappings.some(
                ([_, mapping]) => mapping.internalWindowId === d.id,
              );
              return isEmpty && !isOpen;
            });

            if (target) reusedWindowId = target.id;
          }
        }

        // 3. Eksekver oprettelse / opdatering
        const createPromises = rawSections.map(async (section, index) => {
          const newTabs = LinkManager.parseAndCreateTabs(section, uniqueOnly);

          if (newTabs.length === 0) return;

          if (index === 0 && reusedWindowId) {
            const existingWinRef = doc(
              db,
              "users",
              uid,
              "workspaces_data",
              workspaceId,
              "windows",
              reusedWindowId,
            );

            const baseTitle = windowName || "Importeret Vindue";
            const title = rawSections.length > 1 ? `${baseTitle} 1` : baseTitle;

            await updateDoc(existingWinRef, {
              tabs: newTabs,
              title: title,
              lastActive: serverTimestamp(),
            });
          } else {
            const newWinId = `win_${Date.now()}_${index}`;

            const newWindowRef = doc(
              db,
              "users",
              uid,
              "workspaces_data",
              workspaceId,
              "windows",
              newWinId,
            );

            const baseTitle = windowName || "Importeret Vindue";
            const title =
              rawSections.length > 1 ? `${baseTitle} ${index + 1}` : baseTitle;

            await setDoc(newWindowRef, {
              id: newWinId,
              tabs: newTabs,
              isActive: false,
              lastActive: serverTimestamp(),
              createdAt: serverTimestamp(),
              title: title,
            });
          }
        });

        await Promise.all(createPromises);
      }

      onClose();
    } catch (error) {
      console.error("Fejl ved import af links:", error);
      alert("Der skete en fejl. Tjek konsollen.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      onMouseDown={handleBackdropMouseDown}
      onMouseUp={handleBackdropMouseUp}
      className="open:animate-in open:fade-in open:zoom-in-95 m-auto bg-transparent p-0 backdrop:bg-slate-900/80 backdrop:backdrop-blur-sm"
    >
      <div
        className="flex max-h-[85vh] w-xl flex-col overflow-hidden rounded-2xl border border-slate-600 bg-slate-800 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 bg-slate-900/50 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-600/20 p-2 text-purple-400">
              {isCreatingNew ? (
                previewStats.length > 1 ? (
                  <Layers size={20} />
                ) : (
                  <PlusCircle size={20} />
                )
              ) : (
                <ClipboardPaste size={20} />
              )}
            </div>
            <div>
              <h3 className="font-bold text-slate-200">
                {isCreatingNew
                  ? previewStats.length > 1
                    ? "Batch Import (Flere Vinduer)"
                    : "Importer til Nyt Vindue"
                  : "Importer Links"}
              </h3>
              <p className="text-xs text-slate-500">
                {isCreatingNew ? (
                  "Brug '###' til at opdele i flere vinduer"
                ) : (
                  <>
                    Tilføj til{" "}
                    <span className="text-slate-300">{windowName}</span>
                  </>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer text-slate-500 transition hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              isCreatingNew
                ? "Indsæt links her...\n\n###\n\nIndsæt links til næste vindue her..."
                : "Indsæt liste af links her..."
            }
            className="custom-scrollbar min-h-64 flex-1 resize-none rounded-xl border border-slate-700 bg-slate-900/50 p-4 font-mono text-sm leading-relaxed text-slate-300 outline-none placeholder:text-slate-600 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50"
          />

          {/* Controls Bar */}
          <div className="flex gap-2">
            {/* Toggle Switch: Unique - VISES KUN HVIS DER ER DUBLETTER */}
            {hasDuplicates && (
              <div
                onClick={() => setUniqueOnly(!uniqueOnly)}
                className={`flex flex-1 cursor-pointer items-center justify-between rounded-lg border p-3 transition-all select-none ${
                  uniqueOnly
                    ? "border-blue-500/50 bg-blue-900/20"
                    : "border-slate-700/50 bg-slate-900 hover:border-slate-600"
                }`}
              >
                <div className="flex flex-col">
                  <span
                    className={`text-xs font-bold ${
                      uniqueOnly ? "text-blue-400" : "text-slate-400"
                    }`}
                  >
                    Kun Unikke (Pr. Vindue)
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Dubletter i samme vindue fjernes
                  </span>
                </div>
                <div
                  className={`transition-colors ${
                    uniqueOnly ? "text-blue-400" : "text-slate-600"
                  }`}
                >
                  {uniqueOnly ? (
                    <ToggleRight size={28} />
                  ) : (
                    <ToggleLeft size={28} />
                  )}
                </div>
              </div>
            )}

            {/* Toggle Switch: Smart Empty Window - Vises kun hvis det er muligt */}
            {isCreatingNew && availableReuseIndex !== -1 && (
              <div
                onClick={() => setUseEmptyWindow(!useEmptyWindow)}
                className={`flex flex-1 cursor-pointer items-center justify-between rounded-lg border p-3 transition-all select-none ${
                  useEmptyWindow
                    ? "border-emerald-500/50 bg-emerald-900/20"
                    : "border-slate-700/50 bg-slate-900 hover:border-slate-600"
                }`}
              >
                <div className="flex flex-col">
                  <span
                    className={`text-xs font-bold ${
                      useEmptyWindow ? "text-emerald-400" : "text-slate-400"
                    }`}
                  >
                    Brug Tomt Vindue
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Genbrug lukket/tomt vindue hvis muligt
                  </span>
                </div>
                <div
                  className={`transition-colors ${
                    useEmptyWindow ? "text-emerald-400" : "text-slate-600"
                  }`}
                >
                  {useEmptyWindow ? (
                    <Maximize size={24} />
                  ) : (
                    <div className="h-6 w-6 rounded-full border-2 border-slate-600"></div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between gap-2 border-t border-slate-700 bg-slate-900/50 p-4">
          {/* Stats Display */}
          <div className="custom-scrollbar flex max-h-48 min-h-12.5 flex-1 flex-col overflow-y-auto rounded-lg border border-slate-700/50 bg-slate-900">
            {previewStats.length === 0 ? (
              // EMPTY STATE - Centreret indhold
              <div className="flex h-full items-center justify-center gap-2 p-3 text-slate-500">
                <LinkIcon size={18} />
                <span className="text-sm font-bold">0 links fundet</span>
              </div>
            ) : previewStats.length === 1 && !isCreatingNew ? (
              // SINGLE / LEGACY VIEW - Centreret indhold
              <div className="flex h-full items-center justify-center gap-2 p-3 text-green-400">
                <LinkIcon size={18} />
                <span className="text-sm font-bold">
                  {previewStats[0].count}{" "}
                  {previewStats[0].count === 1 ? "link" : "links"} fundet
                </span>
              </div>
            ) : (
              // LIST VIEW (Aligned Grid) - Normalt flow med padding
              <div className="flex w-full flex-col px-1 py-2">
                {previewStats.map((stat) => (
                  <div
                    key={stat.index}
                    className="flex w-full items-center rounded px-3 py-1 text-sm transition-colors hover:bg-slate-800/50"
                  >
                    {/* Left: Count & Icon (Fixed width for alignment) */}
                    <div className="flex w-24 items-center justify-end gap-2 font-bold text-green-400">
                      <span>{stat.count}</span>
                      <span className="text-xs font-normal tracking-wide text-green-400/80 uppercase">
                        {stat.count === 1 ? "link" : "links"}
                      </span>
                      <LinkIcon size={14} className="ml-1 opacity-70" />
                    </div>

                    {/* Middle: Separator */}
                    <div className="mx-3 text-lg font-light text-slate-600">
                      |
                    </div>

                    {/* Right: Window Name (DYNAMIC) */}
                    <div className="flex flex-1 items-center gap-2 truncate font-medium text-purple-400">
                      <Layers size={14} className="opacity-70" />
                      <span className="truncate">{stat.dynamicTitle}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="cursor-pointer px-4 py-2 text-sm font-medium text-slate-400 transition hover:text-white"
            >
              Annuller
            </button>
            <button
              onClick={handleSave}
              disabled={totalLinks === 0 || isSaving}
              className={`flex h-fit cursor-pointer items-center gap-2 rounded-xl px-6 py-2 text-sm font-bold shadow-lg transition ${
                totalLinks > 0 && !isSaving
                  ? "bg-purple-600 text-white shadow-purple-900/20 hover:bg-purple-500 active:scale-95"
                  : "cursor-not-allowed bg-slate-700 text-slate-500"
              }`}
            >
              {isSaving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : isCreatingNew && previewStats.length > 1 ? (
                <Layers size={16} />
              ) : (
                <Save size={16} />
              )}

              {isCreatingNew
                ? previewStats.length > 1
                  ? "Opret Alle"
                  : "Opret/Indsæt"
                : "Importer"}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
};
