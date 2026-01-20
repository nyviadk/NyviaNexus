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
import { useEffect, useRef, useState } from "react";
import { db } from "../lib/firebase";
import { LinkManager } from "../services/linkManager";
import { WinMapping } from "@/background/main";

interface PasteModalProps {
  workspaceId: string;
  windowId?: string | null; // Null = Nyt Vindue (Standard nu)
  windowName?: string;
  activeMappings?: [number, WinMapping][];
  onClose: () => void;
}

export const PasteModal = ({
  workspaceId,
  windowId,
  windowName,
  activeMappings = [],
  onClose,
}: PasteModalProps) => {
  const [text, setText] = useState("");
  const [uniqueOnly, setUniqueOnly] = useState(false); // Default: Tillad dubletter
  const [isSaving, setIsSaving] = useState(false);
  const [useEmptyWindow, setUseEmptyWindow] = useState(true); // Toggle til at genbruge tomt vindue

  // Stats til preview
  const [totalLinks, setTotalLinks] = useState(0);
  const [windowCount, setWindowCount] = useState(1);

  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal();
    }
  }, []);

  // Vi betragter det som "Nyt Vindue" hvis ID mangler
  const isCreatingNew = !windowId;

  // Beregn preview stats når tekst eller settings ændres
  useEffect(() => {
    if (isCreatingNew && text.includes("###")) {
      // Batch mode logik
      const sections = text.split("###");
      let linkSum = 0;
      let validWindows = 0;

      sections.forEach((section) => {
        const links = LinkManager.parseAndCreateTabs(section, uniqueOnly);
        if (links.length > 0) {
          linkSum += links.length;
          validWindows++;
        }
      });

      setTotalLinks(linkSum);
      setWindowCount(validWindows > 0 ? validWindows : 1);
    } else {
      // Standard mode
      const urls = LinkManager.parseAndCreateTabs(text, uniqueOnly);
      setTotalLinks(urls.length);
      setWindowCount(1);
    }
  }, [text, uniqueOnly, isCreatingNew]);

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
          windowId
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
          // Hent frisk data fra Firestore (SKAL gøres for at undgå race conditions)
          const windowsRef = collection(
            db,
            "users",
            uid,
            "workspaces_data",
            workspaceId,
            "windows"
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
              ([_, mapping]) => mapping.internalWindowId === wId
            );

            if (isEmpty && !isPhysicallyOpen) {
              reusedWindowId = wId;
            }
          }
        }

        // 3. Eksekver oprettelse / opdatering
        const createPromises = rawSections.map(async (section, index) => {
          const newTabs = LinkManager.parseAndCreateTabs(section, uniqueOnly);

          if (newTabs.length === 0) return;

          // HVIS det er første sektion, OG vi har fundet et genbrugeligt vindue -> Opdater det
          if (index === 0 && reusedWindowId) {
            const existingWinRef = doc(
              db,
              "users",
              uid,
              "workspaces_data",
              workspaceId,
              "windows",
              reusedWindowId
            );

            // Vi overskriver titel hvis brugeren har skrevet en (eller batch), ellers beholder vi den gamle
            const baseTitle = windowName || "Importeret Vindue";
            const title = rawSections.length > 1 ? `${baseTitle} 1` : baseTitle;

            await updateDoc(existingWinRef, {
              tabs: newTabs, // Overskriv (den var tom alligevel)
              title: title,
              lastActive: serverTimestamp(),
            });
          } else {
            // Ellers opret nyt vindue
            const newWinId = `win_${Date.now()}_${index}`;

            const newWindowRef = doc(
              db,
              "users",
              uid,
              "workspaces_data",
              workspaceId,
              "windows",
              newWinId
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
      className="bg-transparent p-0 backdrop:bg-slate-900/80 backdrop:backdrop-blur-sm open:animate-in open:fade-in open:zoom-in-95 m-auto"
      onClick={(e) => e.target === dialogRef.current && onClose()}
    >
      <div className="bg-slate-800 border border-slate-600 w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-600/20 rounded-lg text-purple-400">
              {isCreatingNew ? (
                windowCount > 1 ? (
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
                  ? windowCount > 1
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
            className="text-slate-500 hover:text-white transition cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              isCreatingNew
                ? "Indsæt links her...\n\n###\n\nIndsæt links til næste vindue her..."
                : "Indsæt liste af links her..."
            }
            className="flex-1 min-h-64 bg-slate-900/50 border border-slate-700 rounded-xl p-4 text-sm font-mono text-slate-300 outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 resize-none placeholder:text-slate-600 custom-scrollbar leading-relaxed"
          />

          {/* Controls Bar: Unique Toggle & Smart Fill */}
          <div className="flex gap-2">
            {/* Toggle Switch: Unique */}
            <div
              onClick={() => setUniqueOnly(!uniqueOnly)}
              className={`flex-1 flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all select-none ${
                uniqueOnly
                  ? "bg-blue-900/20 border-blue-500/50"
                  : "bg-slate-900 border-slate-700/50 hover:border-slate-600"
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

            {/* Toggle Switch: Smart Empty Window */}
            {isCreatingNew && (
              <div
                onClick={() => setUseEmptyWindow(!useEmptyWindow)}
                className={`flex-1 flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all select-none ${
                  useEmptyWindow
                    ? "bg-emerald-900/20 border-emerald-500/50"
                    : "bg-slate-900 border-slate-700/50 hover:border-slate-600"
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
                    <Maximize size={24} /> // Bruger Maximize som symbol på at "fylde" et vindue
                  ) : (
                    <div className="w-6 h-6 rounded-full border-2 border-slate-600"></div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-900/50 border-t border-slate-700 flex justify-between gap-2 ">
          {/* Stats */}
          <div className="flex-1 flex items-center justify-center gap-3 bg-slate-900 rounded-lg p-3 border border-slate-700/50">
            <div className="flex items-center gap-2">
              <LinkIcon
                size={16}
                className={totalLinks > 0 ? "text-green-400" : "text-slate-500"}
              />
              <span
                className={`text-sm font-bold ${
                  totalLinks > 0 ? "text-green-400" : "text-slate-500"
                }`}
              >
                {totalLinks} links
              </span>
            </div>

            {windowCount > 1 && (
              <>
                <span className="text-slate-700">|</span>
                <div className="flex items-center gap-2">
                  <Layers size={16} className="text-purple-400" />
                  <span className="text-sm font-bold text-purple-400">
                    {windowCount} vinduer
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-white text-sm font-medium transition cursor-pointer"
            >
              Annuller
            </button>
            <button
              onClick={handleSave}
              disabled={totalLinks === 0 || isSaving}
              className={`px-6 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition shadow-lg cursor-pointer ${
                totalLinks > 0 && !isSaving
                  ? "bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/20 active:scale-95"
                  : "bg-slate-700 text-slate-500 cursor-not-allowed"
              }`}
            >
              {isSaving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : isCreatingNew && windowCount > 1 ? (
                <Layers size={16} />
              ) : (
                <Save size={16} />
              )}

              {isCreatingNew
                ? windowCount > 1
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
