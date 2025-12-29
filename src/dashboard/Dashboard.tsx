import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import {
  Activity,
  ArrowUpCircle,
  Check,
  CheckSquare,
  Edit2,
  Eraser,
  ExternalLink,
  FolderPlus,
  Globe,
  Inbox as InboxIcon,
  LifeBuoy,
  Loader2,
  LogOut,
  Monitor,
  PlusCircle,
  Settings,
  Square,
  Trash2,
  VenetianMask,
  X,
  Wand2,
  Key,
  Save,
  Tag,
  ToggleLeft,
  ToggleRight,
  Plus,
  BrainCircuit,
  Lightbulb,
  Unlock,
  Lock,
} from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CreateItemModal } from "../components/CreateItemModal";
import { LoginForm } from "../components/LoginForm";
import { SidebarItem } from "../components/SidebarItem";
import { auth, db } from "../lib/firebase";
import { NexusService } from "../services/nexusService";
import { AiService } from "../services/aiService";
import {
  NexusItem,
  Profile,
  WorkspaceWindow,
  AiSettings,
  UserCategory,
} from "../types";

// --- HELPER: CONTRAST CHECKER ---
const getContrastYIQ = (hexcolor: string) => {
  const hex = hexcolor.replace("#", "");
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#1e293b" : "#ffffff";
};

// --- CATEGORY MENU ---
const CategoryMenu = ({
  tab,
  workspaceId,
  winId,
  position,
  onClose,
  categories,
}: any) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const updateCategory = async (
    newCategory: string | null,
    locked: boolean
  ) => {
    onClose();
    let updated = false;

    if (!workspaceId) {
      // Inbox
      const ref = doc(db, "inbox_data", "global");
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const tabs = snap.data().tabs || [];
        const idx = tabs.findIndex((t: any) => t.uid === tab.uid);
        if (idx !== -1) {
          if (newCategory) {
            tabs[idx].aiData = {
              ...tabs[idx].aiData,
              category: newCategory,
              status: "completed",
              isLocked: locked,
              reasoning: "Manuelt valgt",
            };
          } else {
            // Reset / Unlock
            tabs[idx].aiData = { status: "pending", isLocked: false };
          }
          await updateDoc(ref, { tabs });
          updated = true;
        }
      }
    } else {
      // Space
      const ref = doc(
        db,
        "workspaces_data",
        workspaceId,
        "windows",
        winId || "unknown"
      );
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const tabs = snap.data().tabs || [];
        const idx = tabs.findIndex((t: any) => t.uid === tab.uid);
        if (idx !== -1) {
          if (newCategory) {
            tabs[idx].aiData = {
              ...tabs[idx].aiData,
              category: newCategory,
              status: "completed",
              isLocked: locked,
              reasoning: "Manuelt valgt",
            };
          } else {
            tabs[idx].aiData = { status: "pending", isLocked: false };
          }
          await updateDoc(ref, { tabs });
          updated = true;
        }
      }
    }

    if (updated && !newCategory && !locked) {
      chrome.runtime.sendMessage({ type: "TRIGGER_AI_SORT" });
    }
  };

  return (
    <div
      ref={menuRef}
      style={{ top: position.y, left: position.x }}
      className="fixed z-100 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-2 w-48 animate-in fade-in zoom-in-95 duration-100"
    >
      <div className="text-[10px] uppercase font-bold text-slate-500 px-2 py-1 mb-1">
        Vælg Kategori
      </div>
      <div className="max-h-48 overflow-y-auto space-y-1 mb-2 custom-scrollbar">
        {categories.map((cat: UserCategory) => (
          <button
            key={cat.id}
            onClick={() => updateCategory(cat.name, true)}
            className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-700 text-slate-200 text-sm"
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: cat.color }}
            />
            {cat.name}
          </button>
        ))}
        {categories.length === 0 && (
          <div className="text-xs text-slate-500 px-2 italic">
            Ingen gemte kategorier
          </div>
        )}
      </div>
      <div className="border-t border-slate-700 pt-1">
        <button
          onClick={() => updateCategory(null, false)}
          className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-blue-400 text-xs font-medium"
        >
          <Unlock size={14} /> Lås op / Reset AI
        </button>
      </div>
    </div>
  );
};

// --- REASONING MODAL ---
const ReasoningModal = ({
  data,
  onClose,
}: {
  data: any;
  onClose: () => void;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal();
    }
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      onClick={(e) => e.target === dialogRef.current && onClose()}
      className="bg-transparent p-0 backdrop:bg-slate-900/80 backdrop:backdrop-blur-sm open:animate-in open:fade-in open:zoom-in-95 m-auto"
    >
      <div className="bg-slate-800 border border-slate-600 w-full max-w-md rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
          <BrainCircuit size={120} className="text-blue-500" />
        </div>

        <div className="flex justify-between items-start mb-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600/20 rounded-xl text-blue-400">
              <Lightbulb size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white leading-tight">
                AI Tankegang
              </h3>
              <p className="text-xs text-slate-400">
                Hvorfor blev denne kategori valgt?
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white outline-none"
          >
            <X size={24} />
          </button>
        </div>

        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700 relative z-10">
          <div className="text-sm text-slate-300 italic leading-relaxed">
            "{data.reasoning}"
          </div>
        </div>

        <div className="mt-4 flex justify-between items-center relative z-10">
          <div className="text-xs text-slate-500">
            Sikkerhed:{" "}
            <span
              className={
                data.confidence > 80 ? "text-green-400" : "text-yellow-400"
              }
            >
              {data.confidence}%
            </span>
          </div>
          <div className="px-3 py-1 rounded-full bg-slate-700 text-xs font-bold text-white border border-slate-600 flex items-center gap-2">
            {data.category}
            {data.isLocked && <Lock size={10} className="text-slate-400" />}
          </div>
        </div>
      </div>
    </dialog>
  );
};

// --- SETTINGS MODAL ---
const SettingsModal = ({
  profiles,
  onClose,
  activeProfile,
  setActiveProfile,
}: any) => {
  const [newProfileName, setNewProfileName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [aiSettings, setAiSettings] = useState<AiSettings>({
    allowDynamic: true,
    useUncategorized: false,
    userCategories: [],
  });

  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("#3b82f6");

  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal();
    }
    AiService.getApiKey().then((key) => {
      if (key) setApiKey(key);
    });
    AiService.getSettings().then((settings) => {
      setAiSettings(settings);
    });
  }, []);

  const handleSaveApiKey = async () => {
    setIsSavingKey(true);
    await AiService.saveApiKey(apiKey.trim());
    setTimeout(() => setIsSavingKey(false), 500);
  };

  const saveAiSettings = async (newSettings: AiSettings) => {
    setAiSettings(newSettings);
    await AiService.saveSettings(newSettings);
  };

  const addCategory = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newCatName.trim()) return;

    const newCat: UserCategory = {
      id: crypto.randomUUID(),
      name: newCatName.trim(),
      color: newCatColor,
    };

    const newSettings = {
      ...aiSettings,
      userCategories: [...aiSettings.userCategories, newCat],
    };

    await saveAiSettings(newSettings);
    setNewCatName("");
  };

  const removeCategory = async (id: string) => {
    const newSettings = {
      ...aiSettings,
      userCategories: aiSettings.userCategories.filter((c) => c.id !== id),
    };
    await saveAiSettings(newSettings);
  };

  const toggleDynamic = async () => {
    await saveAiSettings({
      ...aiSettings,
      allowDynamic: !aiSettings.allowDynamic,
    });
  };

  const toggleUncategorized = async () => {
    await saveAiSettings({
      ...aiSettings,
      useUncategorized: !aiSettings.useUncategorized,
    });
  };

  const addProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newProfileName.trim()) return;
    await addDoc(collection(db, "profiles"), { name: newProfileName });
    setNewProfileName("");
  };

  const saveEdit = async (id: string) => {
    if (!id) return;
    await updateDoc(doc(db, "profiles", id), { name: editName });
    setEditingId(null);
  };

  const removeProfile = async (id: string) => {
    if (!id) return;
    if (profiles.length <= 1) return alert("Mindst én profil påkrævet.");
    if (confirm("Slet profil?")) {
      await deleteDoc(doc(db, "profiles", id));
      if (activeProfile === id)
        setActiveProfile(profiles.find((p: Profile) => p.id !== id)?.id || "");
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      onClick={(e) => e.target === dialogRef.current && onClose()}
      className="bg-transparent p-0 backdrop:bg-slate-900/80 backdrop:backdrop-blur-sm open:animate-in open:fade-in open:zoom-in-95 m-auto"
    >
      <div className="bg-slate-800 border border-slate-600 w-full max-w-2xl rounded-3xl p-8 shadow-2xl space-y-8 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center sticky top-0 bg-slate-800 z-10 pb-4 border-b border-slate-700">
          <h3 className="text-2xl font-bold text-white uppercase tracking-tight flex items-center gap-2">
            <Settings className="text-slate-400" /> Indstillinger
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white outline-none focus:ring-2 ring-blue-500 rounded"
          >
            <X size={24} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-8">
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Key size={16} /> API Adgang
              </h4>
              <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700 space-y-3">
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Cerebras API Key..."
                    className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 ring-blue-500/50 text-white placeholder:text-slate-600"
                  />
                  <button
                    onClick={handleSaveApiKey}
                    className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-xl transition outline-none focus:ring-2 ring-blue-400 flex items-center justify-center min-w-11"
                  >
                    {isSavingKey ? <Check size={20} /> : <Save size={20} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Wand2 size={16} /> AI Logik
              </h4>
              <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-200 font-medium">
                    Dynamisk Kategorisering
                  </span>
                  <button
                    onClick={toggleDynamic}
                    className="text-blue-400 hover:text-blue-300"
                  >
                    {aiSettings.allowDynamic ? (
                      <ToggleRight size={32} />
                    ) : (
                      <ToggleLeft size={32} className="text-slate-600" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Hvis slået til: AI må opfinde nye kategorier, der passer bedre
                  end din liste.
                  <br />
                  Hvis slået fra: AI vælger <strong>kun</strong> fra din liste.
                </p>

                {!aiSettings.allowDynamic && (
                  <div className="pt-2 border-t border-slate-700/50 mt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-200 font-medium">
                        Tilføj "Ukategoriseret"
                      </span>
                      <button
                        onClick={toggleUncategorized}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        {aiSettings.useUncategorized ? (
                          <ToggleRight size={32} />
                        ) : (
                          <ToggleLeft size={32} className="text-slate-600" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Bruges som fallback hvis ingen af dine kategorier passer.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Tag size={16} /> Dine Kategorier
              </h4>

              <form onSubmit={addCategory} className="flex gap-2">
                <input
                  type="color"
                  value={newCatColor}
                  onChange={(e) => setNewCatColor(e.target.value)}
                  className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border-0 p-0"
                />
                <input
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Ny kategori..."
                  className="flex-1 bg-slate-700 border border-slate-600 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 ring-blue-500/50 text-white"
                />
                <button
                  type="submit"
                  className="bg-slate-600 hover:bg-slate-500 text-white px-3 rounded-xl"
                >
                  <Plus size={20} />
                </button>
              </form>

              <div className="bg-slate-900/50 rounded-2xl border border-slate-700 max-h-64 overflow-y-auto p-2 space-y-1">
                {aiSettings.userCategories.length === 0 && (
                  <div className="text-center text-xs text-slate-500 py-4 italic">
                    Ingen bruger-kategorier. AI kører på frihjul.
                  </div>
                )}
                {aiSettings.userCategories.map((cat) => (
                  <div
                    key={cat.id}
                    className="flex items-center gap-3 p-2 bg-slate-800/50 rounded-lg group hover:bg-slate-800 transition"
                  >
                    <div
                      className="w-3 h-3 rounded-full shadow-sm"
                      style={{ backgroundColor: cat.color }}
                    ></div>
                    <span className="flex-1 text-sm text-slate-200 font-medium">
                      {cat.name}
                    </span>
                    <button
                      onClick={() => removeCategory(cat.id)}
                      className="text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Monitor size={16} /> Profiler
              </h4>
              <form onSubmit={addProfile} className="flex gap-2">
                <input
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  placeholder="Ny profil..."
                  className="flex-1 bg-slate-700 border border-slate-600 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 ring-blue-500/50 text-white"
                />
                <button
                  type="submit"
                  className="bg-slate-600 hover:bg-slate-500 text-white px-3 rounded-xl"
                >
                  <Plus size={20} />
                </button>
              </form>
              <div className="space-y-2 max-h-32 overflow-y-auto pr-2">
                {profiles.map((p: Profile) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 p-2 bg-slate-700/30 rounded-xl border border-slate-600/50 group"
                  >
                    {editingId === p.id ? (
                      <>
                        <input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveEdit(p.id)}
                          className="flex-1 bg-slate-600 border-none rounded px-2 py-1 text-sm outline-none text-white"
                        />
                        <button
                          onClick={() => saveEdit(p.id)}
                          className="text-green-500"
                        >
                          <Check size={18} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm text-slate-300">
                          {p.name}
                        </span>
                        <button
                          onClick={() => {
                            setEditingId(p.id);
                            setEditName(p.name);
                          }}
                          className="text-slate-400 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => removeProfile(p.id)}
                          className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
};

// --- HELPER: CATEGORY STYLES ---
const getCategoryStyle = (category: string) => {
  const lower = category.toLowerCase();

  if (
    lower.includes("ukategoriseret") ||
    lower === "ukendt" ||
    lower === "fejl"
  ) {
    return "bg-slate-800 text-slate-500 border-slate-700 hover:text-slate-300 transition-colors";
  }

  // Standard Categories
  if (lower.includes("udvikling") || lower.includes("kode"))
    return "bg-cyan-600 text-white border-cyan-500 shadow-md shadow-cyan-900/50";
  if (lower.includes("nyheder") || lower.includes("læsning"))
    return "bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-900/50";
  if (lower.includes("arbejde") || lower.includes("produktivitet"))
    return "bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-900/50";
  if (lower.includes("sociale") || lower.includes("medier"))
    return "bg-pink-600 text-white border-pink-500 shadow-md shadow-pink-900/50";
  if (lower.includes("shopping") || lower.includes("handel"))
    return "bg-orange-600 text-white border-orange-500 shadow-md shadow-orange-900/50";
  if (lower.includes("underholdning") || lower.includes("video"))
    return "bg-red-600 text-white border-red-500 shadow-md shadow-red-900/50";
  if (lower.includes("finans") || lower.includes("bank"))
    return "bg-yellow-600 text-white border-yellow-500 shadow-md shadow-yellow-900/50";

  // Dynamic / System Categories
  if (lower.includes("søgning") || lower.includes("search"))
    return "bg-slate-500 text-white border-slate-400 shadow-md";
  if (lower.includes("netværk") || lower.includes("wifi"))
    return "bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-900/50";
  if (
    lower.includes("sikkerhed") ||
    lower.includes("login") ||
    lower.includes("konto")
  )
    return "bg-violet-600 text-white border-violet-500 shadow-md shadow-violet-900/50";
  if (lower.includes("mail") || lower.includes("kommunikation"))
    return "bg-sky-600 text-white border-sky-500 shadow-md shadow-sky-900/50";
  if (lower.includes("dokument") || lower.includes("skrivning"))
    return "bg-teal-600 text-white border-teal-500 shadow-md shadow-teal-900/50";

  if (
    lower.includes("mad") ||
    lower.includes("opskrifter") ||
    lower.includes("drikke")
  )
    return "bg-lime-600 text-white border-lime-500 shadow-md shadow-lime-900/50";
  if (
    lower.includes("sundhed") ||
    lower.includes("helbred") ||
    lower.includes("sport")
  )
    return "bg-green-500 text-white border-green-400 shadow-md shadow-green-900/50";
  if (
    lower.includes("bolig") ||
    lower.includes("hus") ||
    lower.includes("ejendom")
  )
    return "bg-amber-700 text-white border-amber-600 shadow-md shadow-amber-900/50";
  if (
    lower.includes("offentlig") ||
    lower.includes("stat") ||
    lower.includes("borger")
  )
    return "bg-fuchsia-700 text-white border-fuchsia-600 shadow-md shadow-fuchsia-900/50";

  if (
    lower.includes("database") ||
    lower.includes("backend") ||
    lower.includes("api")
  )
    return "bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-900/50";

  if (
    lower.includes("research") ||
    lower.includes("reference") ||
    lower.includes("viden")
  )
    return "bg-teal-600 text-white border-teal-500 shadow-md shadow-teal-900/50";

  if (lower.includes("design") || lower.includes("ui") || lower.includes("ux"))
    return "bg-pink-500 text-white border-pink-400 shadow-md shadow-pink-900/50";

  // Default / Catch-all Fallback
  return "bg-slate-600 text-slate-200 border-slate-500 shadow-md";
};

// --- TAB ITEM COMPONENT ---
const TabItem = React.memo(
  ({
    tab,
    isSelected,
    onSelect,
    onDelete,
    sourceWorkspaceId,
    onDragStart,
    userCategories = [],
    onShowReasoning,
    onOpenMenu, // NYT PROP
  }: any) => {
    const aiData = tab.aiData || {};
    const isProcessing = aiData.status === "processing";
    const categoryName = aiData.status === "completed" ? aiData.category : null;
    const isLocked = aiData.isLocked;

    // --- Dynamic Style Generator ---
    const getBadgeStyle = () => {
      if (!categoryName) return {};

      const userCat = userCategories.find(
        (c: UserCategory) => c.name.toLowerCase() === categoryName.toLowerCase()
      );

      if (userCat) {
        return {
          backgroundColor: userCat.color,
          color: getContrastYIQ(userCat.color),
          borderColor: userCat.color,
          boxShadow: `0 2px 4px ${userCat.color}40`,
        };
      }
      return {};
    };

    const inlineStyle = getBadgeStyle();
    const classNameStyle =
      Object.keys(inlineStyle).length > 0
        ? ""
        : getCategoryStyle(categoryName || "");

    return (
      <div className="group relative w-full h-full">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(tab);
          }}
          className="absolute -top-2 -right-2 z-30 bg-slate-700 border border-slate-600 text-slate-300 hover:text-red-400 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition shadow-xl cursor-pointer"
        >
          <X size={14} />
        </button>
        <div
          className="absolute top-2 left-2 cursor-pointer z-20 text-slate-500 hover:text-blue-400"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(tab);
          }}
        >
          {isSelected ? (
            <CheckSquare
              size={20}
              className="text-blue-500 bg-slate-900 rounded cursor-pointer"
            />
          ) : (
            <Square
              size={20}
              className="opacity-0 group-hover:opacity-100 bg-slate-900/50 rounded cursor-pointer"
            />
          )}
        </div>

        <div
          draggable={true}
          onDragStart={(e) => {
            e.dataTransfer.setData("nexus/tab", "true");

            // --- CRITICAL FIX: Sørg for at UID og ID er med! ---
            const tabData = {
              ...tab,
              id: tab.id, // Fysisk Chrome ID
              uid: tab.uid || crypto.randomUUID(), // Sikr at UID findes
              sourceWorkspaceId: sourceWorkspaceId,
            };

            console.log("🔥 Drag Start Data:", tabData);

            window.sessionStorage.setItem(
              "draggedTab",
              JSON.stringify(tabData)
            );
            if (onDragStart) onDragStart();
          }}
          className={`bg-slate-800 p-4 rounded-2xl border cursor-default active:cursor-grabbing transform-gpu ${
            isSelected
              ? "border-blue-500 bg-slate-750 shadow-blue-900/20"
              : "border-slate-700 hover:border-slate-500"
          } flex flex-col h-full hover:bg-slate-800 transition group shadow-md pl-8 overflow-hidden`}
        >
          <div className="flex flex-col gap-2 min-w-0">
            <div
              className="flex flex-col gap-1 cursor-pointer group/link p-2 -ml-2 rounded-lg hover:bg-slate-700/50 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                chrome.tabs.create({ url: tab.url, active: true });
              }}
            >
              <div className="flex items-center gap-3">
                <Globe
                  size={18}
                  className={`${
                    tab.isIncognito ? "text-purple-400" : "text-slate-500"
                  } group-hover/link:text-blue-400 shrink-0 transition-colors`}
                />
                <div className="truncate text-sm font-semibold text-slate-200 pointer-events-none w-full group-hover/link:text-blue-200 transition-colors">
                  {tab.title}
                </div>
                <ExternalLink
                  size={16}
                  className="text-blue-400 opacity-0 group-hover/link:opacity-100 transition-opacity shrink-0"
                />
              </div>

              <div className="truncate text-[10px] text-slate-500 italic font-mono pointer-events-none w-full pl-8 group-hover/link:text-blue-300/70">
                {tab.url}
              </div>
            </div>

            <div className="pl-8 flex flex-wrap gap-2 mt-1 min-h-6">
              {isProcessing && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-700/50 border border-slate-600/50 text-[10px] font-medium text-slate-400 animate-pulse w-fit cursor-wait">
                  <Loader2 size={10} className="animate-spin" />
                  AI sorterer...
                </div>
              )}

              {categoryName && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (aiData.reasoning) {
                      onShowReasoning(aiData);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenMenu(e, tab);
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide w-fit shadow-sm backdrop-blur-sm transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer ${classNameStyle}`}
                  style={inlineStyle}
                  title="Venstreklik: Info | Højreklik: Skift kategori"
                >
                  <Tag size={10} />
                  {categoryName}
                  {isLocked && <Lock size={8} className="ml-0.5 opacity-80" />}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.isSelected === next.isSelected &&
      prev.tab.url === next.tab.url &&
      prev.tab.title === next.tab.title &&
      prev.tab.uid === next.tab.uid &&
      JSON.stringify(prev.tab.aiData) === JSON.stringify(next.tab.aiData) &&
      JSON.stringify(prev.userCategories) ===
        JSON.stringify(next.userCategories)
    );
  }
);

// --- MAIN DASHBOARD ---
export const Dashboard = () => {
  const [user, setUser] = useState<any>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<string>("");
  const [items, setItems] = useState<NexusItem[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<NexusItem | null>(
    null
  );

  const [viewMode, setViewMode] = useState<"workspace" | "inbox" | "incognito">(
    "workspace"
  );

  const [modalType, setModalType] = useState<
    "folder" | "workspace" | "settings" | null
  >(null);
  const [modalParentId, setModalParentId] = useState<string>("root");
  const [inboxData, setInboxData] = useState<any>(null);
  const [windows, setWindows] = useState<WorkspaceWindow[]>([]);
  const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null);
  const [activeMappings, setActiveMappings] = useState<any[]>([]);
  const [currentWindowId, setCurrentWindowId] = useState<number | null>(null);
  const [restorationStatus, setRestorationStatus] = useState<string | null>(
    null
  );
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [dropTargetWinId, setDropTargetWinId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [isDragOverRoot, setIsDragOverRoot] = useState(false);
  const [isSyncingRoot, setIsSyncingRoot] = useState(false);
  const [isProcessingMove, setIsProcessingMove] = useState(false);
  const [isInboxDragOver, setIsInboxDragOver] = useState(false);
  const [inboxDropStatus, setInboxDropStatus] = useState<
    "valid" | "invalid" | null
  >(null);
  const [isInboxSyncing, setIsInboxSyncing] = useState(false);
  const [isTriggeringAi, setIsTriggeringAi] = useState(false);

  const [aiSettings, setAiSettings] = useState<AiSettings>({
    allowDynamic: true,
    useUncategorized: false,
    userCategories: [],
  });

  const [reasoningData, setReasoningData] = useState<any>(null);

  // NYT: MENU STATE
  const [menuData, setMenuData] = useState<{
    tab: any;
    position: { x: number; y: number };
  } | null>(null);

  const hasLoadedUrlParams = useRef(false);
  const rootDragCounter = useRef(0);
  const inboxDragCounter = useRef(0);

  const filteredRootItems = useMemo(
    () =>
      items.filter(
        (i) => i.profileId === activeProfile && i.parentId === "root"
      ),
    [items, activeProfile]
  );

  const getFilteredInboxTabs = useCallback(
    (incognitoMode: boolean) => {
      if (!inboxData?.tabs) return [];
      return inboxData.tabs.filter((t: any) =>
        incognitoMode ? t.isIncognito : !t.isIncognito
      );
    },
    [inboxData]
  );

  const sortedWindows = useMemo(
    () =>
      [...windows].sort((a: any, b: any) => (a.index || 0) - (b.index || 0)),
    [windows]
  );

  useEffect(() => {
    const lastProfile = localStorage.getItem("lastActiveProfileId");
    if (lastProfile) setActiveProfile(lastProfile);

    AiService.getSettings().then(setAiSettings);
  }, []);

  useEffect(() => {
    if (!modalType) {
      AiService.getSettings().then(setAiSettings);
    }
  }, [modalType]);

  useEffect(() => {
    if (activeProfile)
      localStorage.setItem("lastActiveProfileId", activeProfile);
  }, [activeProfile]);

  const applyState = useCallback((state: any) => {
    if (state.profiles) setProfiles(state.profiles);
    if (state.items) setItems(state.items);
    if (state.inbox) setInboxData(state.inbox);
  }, []);

  useEffect(() => {
    if (items.length > 0 && !hasLoadedUrlParams.current) {
      const params = new URLSearchParams(window.location.search);
      const wsId = params.get("workspaceId");
      const winId = params.get("windowId");

      if (wsId) {
        const targetWs = items.find((i) => i.id === wsId);
        if (targetWs && selectedWorkspace?.id !== targetWs.id) {
          handleWorkspaceClick(targetWs);
          if (winId) {
            setSelectedWindowId(winId);
          }
        }
      }
      hasLoadedUrlParams.current = true;
    }
  }, [items]);

  useEffect(() => {
    onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        chrome.windows.getCurrent(
          (win) => win.id && setCurrentWindowId(win.id)
        );
        chrome.runtime.sendMessage(
          { type: "GET_LATEST_STATE" },
          (state) => state && applyState(state)
        );
      }
    });

    const messageListener = (msg: any) => {
      if (msg.type === "STATE_UPDATED") applyState(msg.payload);
      if (msg.type === "WORKSPACE_WINDOWS_UPDATED") {
        if (
          selectedWorkspace &&
          msg.payload.workspaceId === selectedWorkspace.id
        ) {
          setWindows(msg.payload.windows);
        }
      }
      if (msg.type === "RESTORATION_STATUS_CHANGE") {
        setRestorationStatus(msg.payload || null);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    const int = setInterval(() => {
      chrome.runtime.sendMessage(
        { type: "GET_ACTIVE_MAPPINGS" },
        (m) => m && setActiveMappings(m)
      );
      chrome.runtime.sendMessage({ type: "GET_RESTORING_STATUS" }, (res) =>
        setRestorationStatus(res || null)
      );
    }, 1000);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
      clearInterval(int);
    };
  }, [applyState, selectedWorkspace]);

  useEffect(() => {
    if (selectedWorkspace) {
      chrome.runtime.sendMessage({
        type: "WATCH_WORKSPACE",
        payload: selectedWorkspace.id,
      });
    }
  }, [selectedWorkspace]);

  useEffect(() => {
    if (
      selectedWorkspace &&
      viewMode === "workspace" &&
      sortedWindows.length > 0 &&
      !selectedWindowId
    ) {
      if (!hasLoadedUrlParams.current) return;
      const params = new URLSearchParams(window.location.search);
      const preselect = params.get("windowId");

      if (preselect && sortedWindows.some((w) => w.id === preselect)) {
        setSelectedWindowId(preselect);
      } else {
        if (sortedWindows[0]?.id) setSelectedWindowId(sortedWindows[0].id);
      }
    }
  }, [sortedWindows, selectedWorkspace, viewMode, selectedWindowId]);

  const handleWorkspaceClick = useCallback((item: NexusItem) => {
    setViewMode("workspace");
    setSelectedWindowId(null);
    setWindows([]);
    setSelectedWorkspace(item);
  }, []);

  const handleSidebarTabDrop = useCallback(
    async (targetItem: NexusItem | "global") => {
      const tabJson = window.sessionStorage.getItem("draggedTab");
      if (!tabJson) return;
      const tab = JSON.parse(tabJson);

      const strictSourceId =
        viewMode === "inbox" || viewMode === "incognito"
          ? "global"
          : selectedWindowId || "global";

      const targetWorkspaceId =
        targetItem === "global" ? "global" : targetItem.id;

      if (strictSourceId === "global" && targetWorkspaceId === "global") {
        if (!tab.isIncognito) return;
      }

      setIsProcessingMove(true);
      if (targetItem === "global") setIsInboxSyncing(true);

      try {
        const cleanTab = {
          uid: crypto.randomUUID(),
          title: tab.title,
          url: tab.url,
          favIconUrl: tab.favIconUrl,
          isIncognito: false,
        };

        let targetPhysicalWindowId = null;

        if (targetWorkspaceId === "global") {
          const snap = await getDoc(doc(db, "inbox_data", "global"));
          const currentTabs = snap.exists() ? snap.data().tabs || [] : [];
          await setDoc(
            doc(db, "inbox_data", "global"),
            {
              tabs: [...currentTabs, cleanTab],
              lastUpdate: serverTimestamp(),
            },
            { merge: true }
          );
        } else {
          const snap = await getDocs(
            collection(db, "workspaces_data", targetWorkspaceId, "windows")
          );
          let targetInternalId = "";

          if (!snap.empty) {
            const firstWin = snap.docs[0];
            targetInternalId = firstWin.id;
            await updateDoc(firstWin.ref, {
              tabs: [...(firstWin.data().tabs || []), cleanTab],
            });
          } else {
            const newRef = doc(
              collection(db, "workspaces_data", targetWorkspaceId, "windows")
            );
            targetInternalId = newRef.id;
            await setDoc(newRef, {
              id: newRef.id,
              tabs: [cleanTab],
              isActive: false,
              lastActive: serverTimestamp(),
            });
          }

          const mapping = activeMappings.find(
            ([_id, mapData]: any) =>
              mapData.workspaceId === targetWorkspaceId &&
              mapData.internalWindowId === targetInternalId
          );

          if (mapping) {
            targetPhysicalWindowId = mapping[0];
            await chrome.tabs.create({
              windowId: targetPhysicalWindowId,
              url: cleanTab.url,
              active: false,
            });
          }
        }

        await NexusService.moveTabBetweenWindows(
          tab,
          selectedWorkspace?.id || "global",
          strictSourceId,
          targetWorkspaceId,
          targetWorkspaceId === "global" ? "global" : "unknown"
        );

        // VIGTIG RETTELSE: SIKR AT DATA SENDES KORREKT TIL BACKGROUND
        const uidsToSend = tab.uid ? [tab.uid] : [];
        const idsToSend = tab.id ? [tab.id] : [];

        console.log("🔥 Sending CLOSE_PHYSICAL_TABS:", {
          uids: uidsToSend,
          ids: idsToSend,
        });

        chrome.runtime.sendMessage({
          type: "CLOSE_PHYSICAL_TABS",
          payload: {
            uids: uidsToSend,
            internalWindowId: strictSourceId,
            tabIds: idsToSend,
          },
        });
      } finally {
        setIsProcessingMove(false);
        setIsInboxSyncing(false);
        window.sessionStorage.removeItem("draggedTab");
      }
    },
    [activeMappings, viewMode, selectedWindowId, selectedWorkspace]
  );

  const handleTabDrop = useCallback(
    async (targetWinId: string) => {
      setDropTargetWinId(null);
      const tabJson = window.sessionStorage.getItem("draggedTab");
      if (!tabJson) return;
      const tab = JSON.parse(tabJson);

      const strictSourceId =
        viewMode === "inbox" || viewMode === "incognito"
          ? "global"
          : selectedWindowId;

      if (!strictSourceId || strictSourceId === targetWinId) return;

      setIsProcessingMove(true);
      try {
        const sourceMapping = activeMappings.find(
          ([_, m]) => m.internalWindowId === strictSourceId
        );
        const targetMapping = activeMappings.find(
          ([_, m]) => m.internalWindowId === targetWinId
        );

        const cleanTab = {
          ...tab,
          isIncognito: false,
          uid: tab.uid || crypto.randomUUID(),
        };

        if (sourceMapping && targetMapping) {
          const tabs = await chrome.tabs.query({ windowId: sourceMapping[0] });
          const targetTab = tabs.find((t) => t.url === tab.url);
          if (targetTab?.id) {
            await chrome.tabs.move(targetTab.id, {
              windowId: targetMapping[0],
              index: -1,
            });
          }
        } else {
          // VIGTIG RETTELSE: SIKR AT DATA SENDES KORREKT TIL BACKGROUND
          const uidsToSend = tab.uid ? [tab.uid] : [];
          const idsToSend = tab.id ? [tab.id] : [];

          console.log("🔥 Sending CLOSE_PHYSICAL_TABS (TabDrop):", {
            uids: uidsToSend,
            ids: idsToSend,
          });

          chrome.runtime.sendMessage({
            type: "CLOSE_PHYSICAL_TABS",
            payload: {
              uids: uidsToSend,
              internalWindowId: strictSourceId,
              tabIds: idsToSend,
            },
          });
        }

        await NexusService.moveTabBetweenWindows(
          cleanTab,
          selectedWorkspace?.id || "global",
          strictSourceId,
          selectedWorkspace?.id || "global",
          targetWinId
        );
      } finally {
        window.sessionStorage.removeItem("draggedTab");
        setIsProcessingMove(false);
      }
    },
    [activeMappings, viewMode, selectedWindowId, selectedWorkspace]
  );

  const handleTabDelete = useCallback(
    async (tab: any) => {
      if (confirm("Slet tab?")) {
        const sId =
          viewMode === "inbox" || viewMode === "incognito"
            ? "global"
            : selectedWindowId!;

        const uidsToSend = tab.uid ? [tab.uid] : [];
        const idsToSend = tab.id ? [tab.id] : [];

        chrome.runtime.sendMessage({
          type: "CLOSE_PHYSICAL_TABS",
          payload: {
            uids: uidsToSend,
            internalWindowId: sId,
            tabIds: idsToSend, // Sikrer fysisk sletning
          },
        });

        await NexusService.deleteTab(
          tab,
          selectedWorkspace?.id || "global",
          sId
        );
      }
    },
    [viewMode, selectedWindowId, selectedWorkspace]
  );

  const handleTabSelect = useCallback((tab: any) => {
    const idToSelect = tab.uid;
    setSelectedUrls((prev) =>
      prev.includes(idToSelect)
        ? prev.filter((u) => u !== idToSelect)
        : [...prev, idToSelect]
    );
  }, []);

  const isViewingCurrent = activeMappings.some(
    ([id, m]: any) =>
      id === currentWindowId && m.internalWindowId === selectedWindowId
  );

  const renderedTabs = useMemo(() => {
    let list: any[] = [];

    if (viewMode === "incognito") list = getFilteredInboxTabs(true);
    else if (viewMode === "inbox") list = getFilteredInboxTabs(false);
    else list = windows.find((w) => w.id === selectedWindowId)?.tabs || [];

    const sourceWSId =
      viewMode === "inbox" || viewMode === "incognito"
        ? "global"
        : selectedWorkspace?.id;

    return list.map((tab: any, i: number) => {
      const isSelected = selectedUrls.includes(tab.uid);
      return (
        <TabItem
          key={tab.uid || i}
          tab={tab}
          isSelected={isSelected}
          onSelect={handleTabSelect}
          onDelete={handleTabDelete}
          sourceWorkspaceId={sourceWSId}
          userCategories={aiSettings.userCategories}
          onShowReasoning={setReasoningData}
          onOpenMenu={(e: MouseEvent, t: any) => {
            setMenuData({
              tab: t,
              position: { x: e.clientX, y: e.clientY },
            });
          }}
        />
      );
    });
  }, [
    viewMode,
    windows,
    selectedWindowId,
    getFilteredInboxTabs,
    selectedWorkspace,
    selectedUrls,
    handleTabSelect,
    handleTabDelete,
    aiSettings.userCategories,
  ]);

  if (!user)
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900">
        <LoginForm />
      </div>
    );

  return (
    <div className="flex h-screen bg-slate-900 text-slate-200 overflow-hidden font-sans relative">
      {restorationStatus && (
        <div className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center flex-col gap-4">
          <Loader2 size={64} className="text-blue-500 animate-spin" />
          <div className="text-2xl font-bold text-white animate-pulse">
            {restorationStatus}
          </div>
        </div>
      )}

      <aside className="w-96 border-r border-slate-700 bg-slate-800 flex flex-col shrink-0 shadow-2xl z-20">
        <div className="p-6 border-b border-slate-700 font-black text-white text-xl uppercase tracking-tighter flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
            N
          </div>{" "}
          NyviaNexus
        </div>

        <div className="p-4 flex-1 overflow-y-auto space-y-6">
          <div className="flex items-center gap-2">
            <select
              value={activeProfile}
              onChange={(e) => {
                setActiveProfile(e.target.value);
                setSelectedWorkspace(null);
                setViewMode("workspace");
              }}
              className="flex-1 bg-slate-700 p-2 rounded-xl border border-slate-600 text-sm outline-none text-white cursor-pointer"
            >
              {profiles.map((p: Profile) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => setModalType("settings")}
              className="p-2 text-slate-400 hover:text-blue-400 bg-slate-700 rounded-xl border border-slate-600 cursor-pointer"
            >
              <Settings size={22} />
            </button>
          </div>

          <nav className="space-y-4">
            {activeDragId && (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={() => {
                  rootDragCounter.current++;
                  setIsDragOverRoot(true);
                }}
                onDragLeave={() => {
                  rootDragCounter.current--;
                  if (rootDragCounter.current === 0) setIsDragOverRoot(false);
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  setIsDragOverRoot(false);
                  rootDragCounter.current = 0;
                  const dId = e.dataTransfer.getData("itemId");
                  if (dId) {
                    setIsSyncingRoot(true);
                    await NexusService.moveItem(dId, "root");
                    setIsSyncingRoot(false);
                    setActiveDragId(null);
                  }
                }}
                className={`p-4 border-2 border-dashed rounded-2xl flex items-center justify-center gap-3 transition-all ${
                  isDragOverRoot
                    ? "bg-blue-600/20 border-blue-400 scale-[1.02] text-blue-400"
                    : "bg-slate-700/40 border-slate-600 text-slate-500"
                }`}
              >
                {isSyncingRoot ? (
                  <Loader2 size={24} className="animate-spin text-blue-400" />
                ) : (
                  <ArrowUpCircle
                    size={24}
                    className={isDragOverRoot ? "animate-bounce" : ""}
                  />
                )}
                <span className="text-xs font-bold uppercase tracking-widest">
                  {isSyncingRoot ? "Flytter..." : "Flyt til rod"}
                </span>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex justify-between items-center px-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Spaces
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (confirm("Nulstil hierarki?")) {
                        const b = writeBatch(db);
                        items
                          .filter(
                            (i) =>
                              i.profileId === activeProfile &&
                              i.parentId !== "root"
                          )
                          .forEach((it) =>
                            b.update(doc(db, "items", it.id), {
                              parentId: "root",
                            })
                          );
                        await b.commit();
                      }
                    }}
                    className="cursor-pointer"
                  >
                    <LifeBuoy size={18} className="hover:text-red-400" />
                  </button>
                  <button
                    onClick={() => {
                      setModalParentId("root");
                      setModalType("folder");
                    }}
                    className="cursor-pointer"
                  >
                    <FolderPlus size={18} className="hover:text-white" />
                  </button>
                  <button
                    onClick={() => {
                      setModalParentId("root");
                      setModalType("workspace");
                    }}
                    className="cursor-pointer"
                  >
                    <PlusCircle size={18} className="hover:text-white" />
                  </button>
                </div>
              </div>
              <div className="space-y-0.5">
                {filteredRootItems.map((item) => (
                  <SidebarItem
                    key={item.id}
                    item={item}
                    allItems={items}
                    onRefresh={() => {}}
                    onSelect={handleWorkspaceClick}
                    onAddChild={(pid, type) => {
                      setModalParentId(pid);
                      setModalType(type);
                    }}
                    onDragStateChange={setActiveDragId}
                    onDragEndCleanup={() => {
                      setActiveDragId(null);
                      setIsDragOverRoot(false);
                      rootDragCounter.current = 0;
                    }}
                    activeDragId={activeDragId}
                    onTabDrop={handleSidebarTabDrop}
                  />
                ))}
              </div>
            </div>
          </nav>

          <nav
            onDragOver={(e) => {
              e.preventDefault();
              const tJ = window.sessionStorage.getItem("draggedTab");
              if (tJ) {
                const tab = JSON.parse(tJ);
                const isValid =
                  tab.sourceWorkspaceId !== "global" || tab.isIncognito;
                setInboxDropStatus(isValid ? "valid" : "invalid");
              } else setDropTargetWinId("global");
            }}
            onDragEnter={() => {
              inboxDragCounter.current++;
              setIsInboxDragOver(true);
            }}
            onDragLeave={() => {
              inboxDragCounter.current--;
              if (inboxDragCounter.current === 0) {
                setIsInboxDragOver(false);
                setInboxDropStatus(null);
                setDropTargetWinId(null);
              }
            }}
            onDrop={(e) => {
              const tJ = window.sessionStorage.getItem("draggedTab");
              if (tJ) {
                e.preventDefault();
                setIsInboxDragOver(false);
                setInboxDropStatus(null);
                inboxDragCounter.current = 0;

                const tab = JSON.parse(tJ);
                if (tab.sourceWorkspaceId !== "global" || tab.isIncognito)
                  handleSidebarTabDrop("global");
              } else handleTabDrop("global");
            }}
          >
            <label className="text-[10px] font-bold text-slate-400 uppercase px-2 mb-2 block tracking-widest">
              Opsamling
            </label>

            <div
              onClick={() => {
                setSelectedWorkspace(null);
                setViewMode("inbox");
              }}
              className={`flex items-center gap-2 p-2 rounded-xl cursor-pointer text-sm transition-all border mb-2 ${
                viewMode === "inbox"
                  ? "bg-orange-600/20 text-orange-400 border-orange-500/50 shadow-lg"
                  : inboxDropStatus === "valid"
                  ? "bg-blue-600/20 border-blue-400 text-blue-400 scale-[1.02]"
                  : isInboxDragOver
                  ? "bg-slate-700 border-slate-500 text-slate-200"
                  : "hover:bg-slate-700 text-slate-400 border-transparent"
              }`}
            >
              {isInboxSyncing ? (
                <Loader2 size={20} className="animate-spin text-blue-400" />
              ) : (
                <InboxIcon size={20} />
              )}
              <span>Inbox ({getFilteredInboxTabs(false).length})</span>
            </div>

            <div
              onClick={() => {
                setSelectedWorkspace(null);
                setViewMode("incognito");
              }}
              className={`flex items-center gap-2 p-2 rounded-xl cursor-pointer text-sm transition-all border ${
                viewMode === "incognito"
                  ? "bg-purple-900/40 text-purple-400 border-purple-500/50 shadow-lg"
                  : "hover:bg-slate-700 text-slate-400 border-transparent"
              }`}
            >
              <VenetianMask size={20} />
              <span>Incognito ({getFilteredInboxTabs(true).length})</span>
            </div>
          </nav>
        </div>

        <div className="p-4 border-t border-slate-700 bg-slate-800/50 flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-2 text-[10px] font-bold text-green-500 uppercase">
            <Activity size={14} className="animate-pulse" /> Live Sync
          </div>
          <button
            onClick={() => auth.signOut()}
            className="flex items-center gap-2 text-slate-500 hover:text-red-500 cursor-pointer"
          >
            <LogOut size={20} /> Log ud
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col bg-slate-900 relative">
        {isProcessingMove && (
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-500" size={48} />
          </div>
        )}

        {selectedWorkspace ||
        viewMode === "inbox" ||
        viewMode === "incognito" ? (
          <>
            <header className="p-8 pb-4 flex justify-between items-end border-b border-slate-800 bg-slate-800/30">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-4xl font-bold text-white tracking-tight flex items-center gap-3">
                    {viewMode === "incognito" ? (
                      <>
                        <VenetianMask size={36} className="text-purple-500" />
                        <span>Incognito</span>
                      </>
                    ) : viewMode === "inbox" ? (
                      "Inbox"
                    ) : (
                      selectedWorkspace?.name
                    )}
                  </h2>
                  {isViewingCurrent && viewMode === "workspace" && (
                    <span className="text-[10px] bg-blue-600/20 text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/20 font-bold uppercase tracking-widest">
                      <Monitor size={12} className="inline mr-1" /> Dette Vindue
                    </span>
                  )}
                </div>

                {viewMode === "workspace" && (
                  <div className="flex gap-4 items-center flex-wrap">
                    {sortedWindows.map((win, idx) => (
                      <div
                        key={win.id}
                        className="flex flex-col gap-1 items-center"
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDropTargetWinId(win.id);
                        }}
                        onDrop={() => handleTabDrop(win.id)}
                        onDragLeave={() => setDropTargetWinId(null)}
                      >
                        <div
                          onClick={() =>
                            setSelectedWindowId(
                              selectedWindowId === win.id ? null : win.id
                            )
                          }
                          className={`relative group px-4 py-3 rounded-xl border transition-all flex items-center gap-3 cursor-pointer ${
                            selectedWindowId === win.id ||
                            dropTargetWinId === win.id
                              ? "bg-blue-600/10 border-blue-500/50 shadow-lg"
                              : "bg-slate-800 border-slate-700 hover:border-slate-500"
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-300">
                              Vindue {idx + 1}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {win.tabs?.length || 0} tabs
                            </span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              chrome.runtime.sendMessage({
                                type: "OPEN_SPECIFIC_WINDOW",
                                payload: {
                                  workspaceId: selectedWorkspace?.id,
                                  windowData: win,
                                  name: selectedWorkspace?.name,
                                  index: idx + 1,
                                },
                              });
                            }}
                            className="p-1.5 hover:bg-blue-500/20 rounded-lg text-slate-400 hover:text-blue-400 cursor-pointer"
                          >
                            <ExternalLink size={20} />
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (confirm("Slet vindue?"))
                                chrome.runtime.sendMessage({
                                  type: "DELETE_AND_CLOSE_WINDOW",
                                  payload: {
                                    workspaceId: selectedWorkspace?.id,
                                    internalWindowId: win.id,
                                  },
                                });
                            }}
                            className="absolute -top-2 -right-2 p-1.5 bg-slate-800 border border-slate-600 rounded-full text-slate-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition shadow-sm z-10 cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() =>
                        chrome.runtime.sendMessage({
                          type: "CREATE_NEW_WINDOW_IN_WORKSPACE",
                          payload: {
                            workspaceId: selectedWorkspace?.id,
                            name: selectedWorkspace?.name,
                          },
                        })
                      }
                      className="h-14 w-14 flex items-center justify-center rounded-xl border border-dashed border-slate-700 hover:border-blue-500 text-slate-500 transition cursor-pointer"
                    >
                      <PlusCircle size={28} />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex gap-3 mb-1">
                {viewMode === "inbox" && (
                  <button
                    onClick={() => {
                      setIsTriggeringAi(true);
                      chrome.runtime.sendMessage(
                        { type: "TRIGGER_AI_SORT" },
                        () => setIsTriggeringAi(false)
                      );
                    }}
                    className="flex items-center gap-2 bg-linear-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg transition cursor-pointer disabled:opacity-50"
                    disabled={isTriggeringAi}
                  >
                    {isTriggeringAi ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <Wand2 size={20} />
                    )}
                    AI Sortering
                  </button>
                )}

                <button
                  onClick={() => {
                    let list = [];
                    if (viewMode === "incognito")
                      list = getFilteredInboxTabs(true);
                    else if (viewMode === "inbox")
                      list = getFilteredInboxTabs(false);
                    else
                      list =
                        windows.find((w) => w.id === selectedWindowId)?.tabs ||
                        [];

                    const allU = list.map((t: any) => t.uid);
                    setSelectedUrls(
                      selectedUrls.length === allU.length ? [] : allU
                    );
                  }}
                  className={`p-2.5 bg-slate-800 border rounded-xl transition cursor-pointer ${
                    selectedUrls.length > 0
                      ? "border-blue-500 text-blue-400"
                      : "border-slate-700 hover:text-blue-400"
                  }`}
                >
                  <CheckSquare size={24} />
                </button>
                {selectedUrls.length > 0 && (
                  <button
                    onClick={async () => {
                      if (confirm(`Slet ${selectedUrls.length} tabs?`)) {
                        const sId =
                          viewMode === "inbox" || viewMode === "incognito"
                            ? "global"
                            : selectedWindowId;

                        const uidsToSend = selectedUrls;

                        chrome.runtime.sendMessage({
                          type: "CLOSE_PHYSICAL_TABS",
                          payload: {
                            uids: uidsToSend,
                            internalWindowId: sId,
                            tabIds: [], // Tom array, da vi sletter via UID
                          },
                        });

                        if (viewMode === "inbox" || viewMode === "incognito") {
                          const f = inboxData.tabs.filter(
                            (t: any) => !selectedUrls.includes(t.uid)
                          );
                          await updateDoc(doc(db, "inbox_data", "global"), {
                            tabs: f,
                          });
                        } else if (selectedWorkspace && selectedWindowId) {
                          const w = windows.find(
                            (win) => win.id === selectedWindowId
                          );
                          if (w) {
                            const f = w.tabs.filter(
                              (t: any) => !selectedUrls.includes(t.uid)
                            );
                            await updateDoc(
                              doc(
                                db,
                                "workspaces_data",
                                selectedWorkspace.id,
                                "windows",
                                selectedWindowId
                              ),
                              { tabs: f }
                            );
                          }
                        }

                        setSelectedUrls([]);
                      }
                    }}
                    className="flex items-center gap-2 bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white px-4 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer"
                  >
                    <Trash2 size={20} /> Slet ({selectedUrls.length})
                  </button>
                )}

                {viewMode === "inbox" &&
                  getFilteredInboxTabs(false).length > 0 && (
                    <button
                      onClick={async () => {
                        if (confirm("Ryd Inbox?")) {
                          const normalTabs = getFilteredInboxTabs(false);
                          const incognitoTabs = getFilteredInboxTabs(true);

                          chrome.runtime.sendMessage({
                            type: "CLOSE_PHYSICAL_TABS",
                            payload: {
                              uids: normalTabs.map((t: any) => t.uid),
                              internalWindowId: "global",
                            },
                          });

                          await updateDoc(doc(db, "inbox_data", "global"), {
                            tabs: incognitoTabs,
                          });
                        }
                      }}
                      className="flex items-center gap-2 bg-orange-600/20 text-orange-400 hover:bg-orange-600 hover:text-white px-4 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer"
                    >
                      <Eraser size={20} /> Ryd Inbox
                    </button>
                  )}

                {viewMode === "incognito" &&
                  getFilteredInboxTabs(true).length > 0 && (
                    <button
                      onClick={async () => {
                        if (confirm("Ryd Incognito liste?")) {
                          const normalTabs = getFilteredInboxTabs(false);
                          const incognitoTabs = getFilteredInboxTabs(true);

                          chrome.runtime.sendMessage({
                            type: "CLOSE_PHYSICAL_TABS",
                            payload: {
                              uids: incognitoTabs.map((t: any) => t.uid),
                              internalWindowId: "global",
                            },
                          });

                          await updateDoc(doc(db, "inbox_data", "global"), {
                            tabs: normalTabs,
                          });
                        }
                      }}
                      className="flex items-center gap-2 bg-purple-600/20 text-purple-400 hover:bg-purple-600 hover:text-white px-4 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer"
                    >
                      <Eraser size={20} /> Ryd Incognito
                    </button>
                  )}

                {viewMode === "workspace" && (
                  <button
                    onClick={() =>
                      chrome.runtime.sendMessage({
                        type: "OPEN_WORKSPACE",
                        payload: {
                          workspaceId: selectedWorkspace?.id,
                          windows: sortedWindows,
                          name: selectedWorkspace?.name,
                        },
                      })
                    }
                    className="bg-blue-600 hover:bg-blue-500 px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-blue-600/20 text-white active:scale-95 transition cursor-pointer"
                  >
                    Åbn Space
                  </button>
                )}
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {renderedTabs}
              </div>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-4">
            <Monitor size={64} className="opacity-20" />
            <p className="text-xl font-medium">Vælg et space</p>
          </div>
        )}
      </main>

      {/* MODALS */}
      {(modalType === "folder" || modalType === "workspace") && (
        <CreateItemModal
          type={modalType}
          activeProfile={activeProfile}
          parentId={modalParentId}
          onClose={() => {
            setModalType(null);
            setModalParentId("root");
          }}
          onSuccess={() => {
            setModalType(null);
            setModalParentId("root");
          }}
        />
      )}
      {modalType === "settings" && (
        <SettingsModal
          profiles={profiles}
          onClose={() => setModalType(null)}
          activeProfile={activeProfile}
          setActiveProfile={setActiveProfile}
        />
      )}

      {reasoningData && (
        <ReasoningModal
          data={reasoningData}
          onClose={() => setReasoningData(null)}
        />
      )}

      {menuData && (
        <CategoryMenu
          tab={menuData.tab}
          workspaceId={selectedWorkspace?.id || null}
          winId={selectedWindowId}
          position={menuData.position}
          categories={aiSettings.userCategories}
          onClose={() => setMenuData(null)}
        />
      )}
    </div>
  );
};
