import {
  arrayUnion,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import {
  ClipboardPaste,
  Link as LinkIcon,
  Loader2,
  PlusCircle,
  Save,
  ToggleLeft,
  ToggleRight,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { db } from "../lib/firebase";
import { LinkManager } from "../services/linkManager";

interface PasteModalProps {
  workspaceId: string;
  windowId?: string | null; // Nu valgfri. Hvis null = Nyt Vindue
  windowName?: string;
  onClose: () => void;
}

export const PasteModal = ({
  workspaceId,
  windowId,
  windowName,
  onClose,
}: PasteModalProps) => {
  const [text, setText] = useState("");
  const [uniqueOnly, setUniqueOnly] = useState(false); // Default: Tillad dubletter
  const [isSaving, setIsSaving] = useState(false);
  const [previewCount, setPreviewCount] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal();
    }
  }, []);

  // Opdater preview når tekst ELLER toggle ændres
  useEffect(() => {
    const urls = LinkManager.parseAndCreateTabs(text, uniqueOnly);
    setPreviewCount(urls.length);
  }, [text, uniqueOnly]);

  const handleSave = async () => {
    if (previewCount === 0) return;

    const auth = getAuth();
    const currentUser = auth.currentUser;

    if (!currentUser) {
      alert("Fejl: Ingen bruger logget ind.");
      return;
    }

    setIsSaving(true);
    const uid = currentUser.uid;

    try {
      // VIGTIGT: Send uniqueOnly flaget med her
      const newTabs = LinkManager.parseAndCreateTabs(text, uniqueOnly);

      if (windowId) {
        // SCENARIE A: Indsæt i eksisterende vindue
        // Path: users/{uid}/workspaces_data/{workspaceId}/windows/{windowId}
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
      } else {
        // SCENARIE B: Opret nyt vindue i spacet (Empty space logic)
        // Path: users/{uid}/workspaces_data/{workspaceId}/windows/{newWinId}
        const newWinId = `win_${Date.now()}`;
        const newWindowRef = doc(
          db,
          "users",
          uid,
          "workspaces_data",
          workspaceId,
          "windows",
          newWinId
        );

        await setDoc(newWindowRef, {
          id: newWinId,
          tabs: newTabs,
          isActive: false,
          lastActive: serverTimestamp(), // Sorteres øverst/nederst afhængig af sortering
          title: windowName || "Importeret Vindue", // Fallback titel hvis windowName mangler
        });
      }

      onClose();
    } catch (error) {
      console.error("Fejl ved import af links:", error);
      alert("Der skete en fejl. Tjek konsollen.");
    } finally {
      setIsSaving(false);
    }
  };

  const isCreatingNew = !windowId;

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
                <PlusCircle size={20} />
              ) : (
                <ClipboardPaste size={20} />
              )}
            </div>
            <div>
              <h3 className="font-bold text-slate-200">
                {isCreatingNew ? "Importer til Nyt Vindue" : "Importer Links"}
              </h3>
              <p className="text-xs text-slate-500">
                {isCreatingNew ? (
                  "Opretter et nyt vindue med disse links"
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
            placeholder="Indsæt liste af links her..."
            className="flex-1 min-h-50 bg-slate-900/50 border border-slate-700 rounded-xl p-4 text-sm font-mono text-slate-300 outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 resize-none placeholder:text-slate-600 custom-scrollbar"
          />

          {/* Controls Bar: Unique Toggle & Stats */}
          <div className="flex items-center gap-2">
            {/* Toggle Switch */}
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
                  Kun Unikke Links
                </span>
                <span className="text-[10px] text-slate-500">
                  Fjern dubletter automatisk
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
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-900/50 border-t border-slate-700 flex justify-between gap-2 ">
          {/* Stats */}
          <div className="flex-1 flex items-center justify-center gap-2 bg-slate-900 rounded-lg p-3 border border-slate-700/50">
            <LinkIcon
              size={16}
              className={previewCount > 0 ? "text-green-400" : "text-slate-500"}
            />
            <span
              className={`text-sm font-bold ${
                previewCount > 0 ? "text-green-400" : "text-slate-500"
              }`}
            >
              {previewCount} links fundet
            </span>
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
              disabled={previewCount === 0 || isSaving}
              className={`px-6 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition shadow-lg cursor-pointer ${
                previewCount > 0 && !isSaving
                  ? "bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/20 active:scale-95"
                  : "bg-slate-700 text-slate-500 cursor-not-allowed"
              }`}
            >
              {isSaving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              {isCreatingNew ? "Opret Vindue" : "Importer"}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
};
