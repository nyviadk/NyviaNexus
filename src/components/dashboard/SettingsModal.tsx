import React, { useEffect, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import {
  Check,
  Edit2,
  Key,
  Monitor,
  Plus,
  Save,
  Settings,
  Tag,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Wand2,
  X,
  Share2,
} from "lucide-react";
import { auth, db } from "../../lib/firebase";
import { AiService } from "../../services/aiService";
import { AiSettings, Profile, UserCategory } from "../../types";
import { SettingsModalProps } from "../../dashboard/types";
import { RemoteAccessSettings } from "./RemoteAccessSettings";

export const SettingsModal = ({
  profiles,
  onClose,
  activeProfile,
  setActiveProfile,
}: SettingsModalProps) => {
  // Tabs State
  const [activeTab, setActiveTab] = useState<"general" | "sharing">("general");

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
    if (!auth.currentUser) return;
    if (!newProfileName.trim()) return;

    await addDoc(collection(db, "users", auth.currentUser.uid, "profiles"), {
      name: newProfileName,
    });
    setNewProfileName("");
  };

  const saveEdit = async (id: string) => {
    if (!id || !auth.currentUser) return;
    await updateDoc(doc(db, "users", auth.currentUser.uid, "profiles", id), {
      name: editName,
    });
    setEditingId(null);
  };

  const removeProfile = async (id: string) => {
    if (!id || !auth.currentUser) return;
    if (profiles.length <= 1) return alert("Mindst én profil påkrævet.");
    if (confirm("Slet profil?")) {
      await deleteDoc(doc(db, "users", auth.currentUser.uid, "profiles", id));
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
      <div className="bg-slate-800 border border-slate-600 w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* HEADER */}
        <div className="flex justify-between items-center bg-slate-800/80 p-6 pb-2 border-b border-slate-700">
          <div className="flex items-center gap-6">
            <h3 className="text-2xl font-bold text-white uppercase tracking-tight flex items-center gap-2">
              <Settings className="text-slate-400" /> Indstillinger
            </h3>

            {/* TABS NAVIGATION */}
            <div className="flex bg-slate-900/50 p-1 rounded-xl border border-slate-700/50 ">
              <button
                onClick={() => setActiveTab("general")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer ${
                  activeTab === "general"
                    ? "bg-slate-700 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Generelt
              </button>
              <button
                onClick={() => setActiveTab("sharing")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-2 cursor-pointer ${
                  activeTab === "sharing"
                    ? "bg-purple-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Share2 size={14} />
                Deling & Sync
              </button>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white outline-none focus:ring-2 ring-blue-500 rounded cursor-pointer"
          >
            <X size={24} />
          </button>
        </div>

        {/* CONTENT AREA */}
        <div className="p-8 overflow-y-auto">
          {/* TAB 1: GENERAL (Den gamle visning) */}
          {activeTab === "general" && (
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
                        className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-xl transition outline-none focus:ring-2 ring-blue-400 flex items-center justify-center min-w-11 cursor-pointer"
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
                        className="text-blue-400 hover:text-blue-300 cursor-pointer"
                      >
                        {aiSettings.allowDynamic ? (
                          <ToggleRight size={32} />
                        ) : (
                          <ToggleLeft size={32} className="text-slate-600" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500">
                      Hvis slået til: AI må opfinde nye kategorier, der passer
                      bedre end din liste.
                      <br />
                      Hvis slået fra: AI vælger <strong>kun</strong> fra din
                      liste.
                    </p>
                    {!aiSettings.allowDynamic && (
                      <div className="pt-2 border-t border-slate-700/50 mt-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-200 font-medium">
                            Tilføj "Ukategoriseret"
                          </span>
                          <button
                            onClick={toggleUncategorized}
                            className="text-blue-400 hover:text-blue-300 cursor-pointer"
                          >
                            {aiSettings.useUncategorized ? (
                              <ToggleRight size={32} />
                            ) : (
                              <ToggleLeft
                                size={32}
                                className="text-slate-600"
                              />
                            )}
                          </button>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Bruges som fallback hvis ingen af dine kategorier
                          passer.
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
                      className="bg-slate-600 hover:bg-slate-500 text-white px-3 rounded-xl cursor-pointer"
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
                          className="text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition cursor-pointer"
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
                      className="bg-slate-600 hover:bg-slate-500 text-white px-3 rounded-xl cursor-pointer"
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
                              onKeyDown={(e) =>
                                e.key === "Enter" && saveEdit(p.id)
                              }
                              className="flex-1 bg-slate-600 border-none rounded px-2 py-1 text-sm outline-none text-white"
                            />
                            <button
                              onClick={() => saveEdit(p.id)}
                              className="text-green-500 cursor-pointer"
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
                              className="text-slate-400 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition cursor-pointer"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => removeProfile(p.id)}
                              className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition cursor-pointer"
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
          )}

          {/* TAB 2: SHARING & SYNC (Ny komponent) */}
          {activeTab === "sharing" && <RemoteAccessSettings />}
        </div>
      </div>
    </dialog>
  );
};
