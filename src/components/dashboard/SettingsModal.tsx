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
  Palette,
} from "lucide-react";
import { auth, db } from "../../lib/firebase";
import { AiService } from "../../services/aiService";
import { AiSettings, Profile, UserCategory } from "../../types";
import { SettingsModalProps } from "../../dashboard/types";
import { ThemeSelector } from "./ThemeSelector";

export const SettingsModal = ({
  profiles,
  onClose,
  activeProfile,
  setActiveProfile,
}: SettingsModalProps) => {
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
    let isMounted = true;

    AiService.getApiKey().then((key) => {
      if (key && isMounted) setApiKey(key);
    });
    AiService.getSettings().then((settings) => {
      if (isMounted) setAiSettings(settings);
    });

    return () => {
      isMounted = false;
    };
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
    if (!auth.currentUser || !newProfileName.trim()) return;

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

    // Check om det er den sidste profil
    if (profiles.length <= 1) {
      alert("Mindst én profil påkrævet.");
      return;
    }

    // Find profilen for at få navnet
    const profileToDelete = profiles.find((p) => p.id === id);
    if (!profileToDelete) return;

    // Bed brugeren skrive navnet for at bekræfte
    const userInput = window.prompt(
      `SIKKERHEDSTJEK: Dette sletter profilen og alle tilhørende data permanent.\n\nSkriv "${profileToDelete.name}" for at bekræfte sletning.`,
    );

    if (userInput === profileToDelete.name) {
      try {
        await deleteDoc(doc(db, "users", auth.currentUser.uid, "profiles", id));

        // Hvis vi slettede den aktive profil, skift til en anden
        if (activeProfile === id) {
          const nextProfile = profiles.find((p: Profile) => p.id !== id);
          if (nextProfile) {
            setActiveProfile(nextProfile.id);
          }
        }
      } catch (error) {
        console.error("Error deleting profile:", error);
        alert("Der opstod en fejl under sletning af profilen.");
      }
    } else if (userInput !== null) {
      // Brugeren trykkede ikke Annuller, men skrev forkert
      alert("Navnet stemte ikke overens. Profilen blev IKKE slettet.");
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      onClick={(e) => e.target === dialogRef.current && onClose()}
      className="open:animate-in open:fade-in open:zoom-in-95 m-auto bg-transparent p-0 backdrop:bg-background/80 backdrop:backdrop-blur-sm"
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-strong bg-surface-elevated shadow-2xl">
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-subtle bg-surface-elevated/80 p-6 pb-4">
          <h3 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-high uppercase">
            <Settings className="text-medium" /> Indstillinger
          </h3>
          <button
            onClick={onClose}
            className="cursor-pointer rounded text-low ring-action outline-none hover:text-high focus:ring-2"
          >
            <X size={24} />
          </button>
        </div>

        {/* CONTENT AREA */}
        <div className="custom-scrollbar overflow-y-auto p-8">
          <div className="flex flex-col gap-10">
            {/* 1. VISUEL ARKITEKTUR (TEMAER) */}
            <section className="space-y-4">
              <h4 className="flex items-center gap-2 text-xs font-bold tracking-widest text-medium uppercase">
                <Palette size={16} className="text-action" /> Tema
              </h4>
              <ThemeSelector />
            </section>

            <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
              {/* KOLONNE 1: AI & LOGIK */}
              <div className="space-y-8">
                {/* API KEY */}
                <div className="space-y-4">
                  <h4 className="flex items-center gap-2 text-xs font-bold tracking-widest text-medium uppercase">
                    <Key size={16} /> AI adgang (Cerabras, llama3.1-8b)
                  </h4>
                  <div className="space-y-3 rounded-2xl border border-subtle bg-surface-sunken/50 p-4">
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Cerebras API Key..."
                        className="flex-1 rounded-xl border border-strong bg-surface px-4 py-2 text-sm text-high ring-action/50 outline-none placeholder:text-low focus:ring-2"
                      />
                      <button
                        onClick={handleSaveApiKey}
                        className="flex min-w-11 cursor-pointer items-center justify-center rounded-xl bg-action p-2 text-inverted ring-action-hover transition hover:bg-action-hover focus:ring-2"
                      >
                        {isSavingKey ? <Check size={20} /> : <Save size={20} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* AI LOGIC */}
                <div className="space-y-4">
                  <h4 className="flex items-center gap-2 text-xs font-bold tracking-widest text-medium uppercase">
                    <Wand2 size={16} /> AI Logik
                  </h4>
                  <div className="space-y-4 rounded-2xl border border-subtle bg-surface-sunken/50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-high">
                        Dynamisk kategorisering
                      </span>
                      <button
                        onClick={toggleDynamic}
                        className="cursor-pointer text-action hover:text-action-hover"
                      >
                        {aiSettings.allowDynamic ? (
                          <ToggleRight size={32} />
                        ) : (
                          <ToggleLeft size={32} className="text-strong" />
                        )}
                      </button>
                    </div>
                    <p className="text-[11px] leading-relaxed text-low italic">
                      Hvis slået til: AI må opfinde nye kategorier, der passer
                      bedre end din liste.
                      <br />
                      Hvis slået fra: AI vælger <strong>kun</strong> fra din
                      liste.
                    </p>

                    {!aiSettings.allowDynamic && (
                      <div className="mt-2 border-t border-subtle/30 pt-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-high">
                            Tilføj "Ukategoriseret"
                          </span>
                          <button
                            onClick={toggleUncategorized}
                            className="cursor-pointer text-action hover:text-action-hover"
                          >
                            {aiSettings.useUncategorized ? (
                              <ToggleRight size={32} />
                            ) : (
                              <ToggleLeft size={32} className="text-strong" />
                            )}
                          </button>
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-low italic">
                          Bruges som fallback hvis ingen af dine kategorier
                          passer.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* KOLONNE 2: KATEGORIER & PROFILER */}
              <div className="space-y-8">
                {/* KATEGORIER */}
                <div className="space-y-4">
                  <h4 className="flex items-center gap-2 text-xs font-bold tracking-widest text-medium uppercase">
                    <Tag size={16} /> Dine kategorier
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
                      className="flex-1 rounded-xl border border-strong bg-surface px-4 py-2 text-sm text-high ring-action/50 outline-none focus:ring-2"
                    />
                    <button
                      type="submit"
                      className="cursor-pointer rounded-xl bg-strong px-3 text-inverted hover:bg-subtle"
                    >
                      <Plus size={20} />
                    </button>
                  </form>
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-2xl border border-subtle bg-surface-sunken/30 p-2">
                    {aiSettings.userCategories.length === 0 && (
                      <div className="py-4 text-center text-xs text-low italic">
                        Ingen bruger-kategorier. AI kører på frihjul.
                      </div>
                    )}
                    {aiSettings.userCategories.map((cat) => (
                      <div
                        key={cat.id}
                        className="group flex items-center gap-3 rounded-lg bg-surface/50 p-2 transition hover:bg-surface"
                      >
                        <div
                          className="h-3 w-3 rounded-full shadow-sm"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="flex-1 text-sm font-medium text-high">
                          {cat.name}
                        </span>
                        <button
                          onClick={() => removeCategory(cat.id)}
                          className="cursor-pointer text-low opacity-0 group-hover:opacity-100 hover:text-danger"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* PROFILER */}
                <div className="space-y-4">
                  <h4 className="flex items-center gap-2 text-xs font-bold tracking-widest text-medium uppercase">
                    <Monitor size={16} /> Profiler
                  </h4>
                  <form onSubmit={addProfile} className="flex gap-2">
                    <input
                      value={newProfileName}
                      onChange={(e) => setNewProfileName(e.target.value)}
                      placeholder="Ny profil..."
                      className="flex-1 rounded-xl border border-strong bg-surface px-4 py-2 text-sm text-high ring-action/50 outline-none focus:ring-2"
                    />
                    <button
                      type="submit"
                      className="cursor-pointer rounded-xl bg-strong px-3 text-inverted hover:bg-subtle"
                    >
                      <Plus size={20} />
                    </button>
                  </form>
                  <div className="max-h-32 space-y-2 overflow-y-auto pr-2">
                    {profiles.map((p: Profile) => {
                      return (
                        <div
                          key={p.id}
                          onClick={() => !editingId && setActiveProfile(p.id)}
                          className="group flex cursor-pointer items-center gap-2 rounded-xl border border-strong/50 bg-surface/30 p-2 transition-all hover:border-strong hover:bg-surface/50"
                        >
                          {editingId === p.id ? (
                            <>
                              <input
                                autoFocus
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) =>
                                  e.key === "Enter" && saveEdit(p.id)
                                }
                                className="flex-1 rounded border-none bg-surface-elevated px-2 py-1 text-sm text-high outline-none"
                              />
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  saveEdit(p.id);
                                }}
                                className="cursor-pointer text-success"
                              >
                                <Check size={18} />
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="flex-1 text-sm text-medium">
                                {p.name}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingId(p.id);
                                  setEditName(p.name);
                                }}
                                className="cursor-pointer text-low opacity-0 transition group-hover:opacity-100 hover:text-action"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeProfile(p.id);
                                }}
                                className="cursor-pointer text-low opacity-0 transition group-hover:opacity-100 hover:text-danger"
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
};
