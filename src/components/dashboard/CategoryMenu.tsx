import { TabData } from "@/background/main";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { Unlock } from "lucide-react";
import { useEffect, useRef } from "react";
import { CategoryMenuProps } from "../../dashboard/types";
import { auth, db } from "../../lib/firebase";
import { UserCategory } from "../../types";

export const CategoryMenu = ({
  tab,
  workspaceId,
  winId,
  position,
  onClose,
  categories,
}: CategoryMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);

  const isNearBottom = position.y > window.innerHeight - 300;
  const topPos = isNearBottom ? position.y - 280 : position.y;

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
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    const uid = currentUser.uid;

    let updated = false;

    if (!workspaceId) {
      // Inbox update
      const ref = doc(db, "users", uid, "inbox_data", "global");
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const tabs = (snap.data().tabs as TabData[]) || [];
        const idx = tabs.findIndex((t: TabData) => t.uid === tab.uid);
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
    } else {
      // Workspace update
      const ref = doc(
        db,
        "users",
        uid,
        "workspaces_data",
        workspaceId,
        "windows",
        winId || "unknown"
      );
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const tabs = (snap.data().tabs as TabData[]) || [];
        const idx = tabs.findIndex((t: TabData) => t.uid === tab.uid);
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
      style={{ top: topPos, left: position.x }}
      className={`fixed z-100 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-2 w-56 animate-in fade-in zoom-in-95 duration-100 ${
        isNearBottom ? "origin-bottom-left" : "origin-top-left"
      }`}
    >
      <div className="text-[10px] uppercase font-bold text-slate-500 px-2 py-1 mb-1">
        Vælg Kategori
      </div>
      <div className="max-h-64 overflow-y-auto space-y-1 mb-2 custom-scrollbar">
        {categories.map((cat: UserCategory) => (
          <button
            key={cat.id}
            onClick={() => updateCategory(cat.name, true)}
            className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-700 text-slate-200 text-sm group cursor-pointer"
          >
            <div
              className="w-2.5 h-2.5 rounded-full shadow-sm shrink-0"
              style={{ backgroundColor: cat.color }}
            />
            <span className="truncate">{cat.name}</span>
            {cat.id.startsWith("ai-") && (
              <span className="ml-auto text-[9px] text-slate-500 uppercase tracking-tighter opacity-50 group-hover:opacity-100">
                AI
              </span>
            )}
          </button>
        ))}
        {categories.length === 0 && (
          <div className="text-xs text-slate-500 px-2 italic">
            Ingen kategorier fundet
          </div>
        )}
      </div>
      <div className="border-t border-slate-700 pt-1">
        <button
          onClick={() => updateCategory(null, false)}
          className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-blue-400 text-xs font-medium cursor-pointer"
        >
          <Unlock size={14} /> Lås op / Reset AI
        </button>
      </div>
    </div>
  );
};
