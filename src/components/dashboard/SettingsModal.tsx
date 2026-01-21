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
      className="open:animate-in open:fade-in open:zoom-in-95 m-auto bg-transparent p-0 backdrop:bg-slate-900/80 backdrop:backdrop-blur-sm"
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-600 bg-slate-800 shadow-2xl">
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800/80 p-6 pb-2">
          <div className="flex items-center gap-6">
            <h3 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white uppercase">
              <Settings className="text-slate-400" /> Indstillinger
            </h3>

            {/* TABS NAVIGATION */}
            <div className="flex rounded-xl border border-slate-700/50 bg-slate-900/50 p-1">
              <button
                onClick={() => setActiveTab("general")}
                className={`cursor-pointer rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                  activeTab === "general"
                    ? "bg-slate-700 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Generelt
              </button>
              <button
                onClick={() => setActiveTab("sharing")}
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition ${
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
            className="cursor-pointer rounded text-slate-400 ring-blue-500 outline-none hover:text-white focus:ring-2"
          >
            <X size={24} />
          </button>
        </div>

        {/* CONTENT AREA */}
        <div className="overflow-y-auto p-8">
          {/* TAB 1: GENERAL (Den gamle visning) */}
          {activeTab === "general" && (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              <div className="space-y-8">
                <div className="space-y-4">
                  <h4 className="flex items-center gap-2 text-sm font-bold tracking-widest text-slate-400 uppercase">
                    <Key size={16} /> API Adgang
                  </h4>
                  <div className="space-y-3 rounded-2xl border border-slate-700 bg-slate-900/50 p-4">
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Cerebras API Key..."
                        className="flex-1 rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-white ring-blue-500/50 outline-none placeholder:text-slate-600 focus:ring-2"
                      />
                      <button
                        onClick={handleSaveApiKey}
                        className="flex min-w-11 cursor-pointer items-center justify-center rounded-xl bg-blue-600 p-2 text-white ring-blue-400 transition outline-none hover:bg-blue-500 focus:ring-2"
                      >
                        {isSavingKey ? <Check size={20} /> : <Save size={20} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="flex items-center gap-2 text-sm font-bold tracking-widest text-slate-400 uppercase">
                    <Wand2 size={16} /> AI Logik
                  </h4>
                  <div className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900/50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-200">
                        Dynamisk Kategorisering
                      </span>
                      <button
                        onClick={toggleDynamic}
                        className="cursor-pointer text-blue-400 hover:text-blue-300"
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
                      <div className="mt-2 border-t border-slate-700/50 pt-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-200">
                            Tilføj "Ukategoriseret"
                          </span>
                          <button
                            onClick={toggleUncategorized}
                            className="cursor-pointer text-blue-400 hover:text-blue-300"
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
                        <p className="mt-1 text-xs text-slate-500">
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
                  <h4 className="flex items-center gap-2 text-sm font-bold tracking-widest text-slate-400 uppercase">
                    <Tag size={16} /> Dine Kategorier
                  </h4>

                  <form onSubmit={addCategory} className="flex gap-2">
                    <input
                      type="color"
                      value={newCatColor}
                      onChange={(e) => setNewCatColor(e.target.value)}
                      className="h-10 w-10 cursor-pointer rounded-xl border-0 bg-transparent p-0"
                    />
                    <input
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      placeholder="Ny kategori..."
                      className="flex-1 rounded-xl border border-slate-600 bg-slate-700 px-4 py-2 text-sm text-white ring-blue-500/50 outline-none focus:ring-2"
                    />
                    <button
                      type="submit"
                      className="cursor-pointer rounded-xl bg-slate-600 px-3 text-white hover:bg-slate-500"
                    >
                      <Plus size={20} />
                    </button>
                  </form>

                  <div className="max-h-64 space-y-1 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900/50 p-2">
                    {aiSettings.userCategories.length === 0 && (
                      <div className="py-4 text-center text-xs text-slate-500 italic">
                        Ingen bruger-kategorier. AI kører på frihjul.
                      </div>
                    )}
                    {aiSettings.userCategories.map((cat) => (
                      <div
                        key={cat.id}
                        className="group flex items-center gap-3 rounded-lg bg-slate-800/50 p-2 transition hover:bg-slate-800"
                      >
                        <div
                          className="h-3 w-3 rounded-full shadow-sm"
                          style={{ backgroundColor: cat.color }}
                        ></div>
                        <span className="flex-1 text-sm font-medium text-slate-200">
                          {cat.name}
                        </span>
                        <button
                          onClick={() => removeCategory(cat.id)}
                          className="cursor-pointer text-slate-500 opacity-0 transition group-hover:opacity-100 hover:text-red-400"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="flex items-center gap-2 text-sm font-bold tracking-widest text-slate-400 uppercase">
                    <Monitor size={16} /> Profiler
                  </h4>
                  <form onSubmit={addProfile} className="flex gap-2">
                    <input
                      value={newProfileName}
                      onChange={(e) => setNewProfileName(e.target.value)}
                      placeholder="Ny profil..."
                      className="flex-1 rounded-xl border border-slate-600 bg-slate-700 px-4 py-2 text-sm text-white ring-blue-500/50 outline-none focus:ring-2"
                    />
                    <button
                      type="submit"
                      className="cursor-pointer rounded-xl bg-slate-600 px-3 text-white hover:bg-slate-500"
                    >
                      <Plus size={20} />
                    </button>
                  </form>
                  <div className="max-h-32 space-y-2 overflow-y-auto pr-2">
                    {profiles.map((p: Profile) => (
                      <div
                        key={p.id}
                        className="group flex items-center gap-2 rounded-xl border border-slate-600/50 bg-slate-700/30 p-2"
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
                              className="flex-1 rounded border-none bg-slate-600 px-2 py-1 text-sm text-white outline-none"
                            />
                            <button
                              onClick={() => saveEdit(p.id)}
                              className="cursor-pointer text-green-500"
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
                              className="cursor-pointer text-slate-400 opacity-0 transition group-hover:opacity-100 hover:text-blue-400"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => removeProfile(p.id)}
                              className="cursor-pointer text-slate-400 opacity-0 transition group-hover:opacity-100 hover:text-red-500"
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
