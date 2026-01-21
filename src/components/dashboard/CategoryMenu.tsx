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
    locked: boolean,
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
        winId || "unknown",
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
      className={`animate-in fade-in zoom-in-95 fixed z-100 w-56 rounded-xl border border-slate-600 bg-slate-800 p-2 shadow-2xl duration-100 ${
        isNearBottom ? "origin-bottom-left" : "origin-top-left"
      }`}
    >
      <div className="mb-1 px-2 py-1 text-[10px] font-bold text-slate-500 uppercase">
        Vælg Kategori
      </div>
      <div className="custom-scrollbar mb-2 max-h-64 space-y-1 overflow-y-auto">
        {categories.map((cat: UserCategory) => (
          <button
            key={cat.id}
            onClick={() => updateCategory(cat.name, true)}
            className="group flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-700"
          >
            <div
              className="h-2.5 w-2.5 shrink-0 rounded-full shadow-sm"
              style={{ backgroundColor: cat.color }}
            />
            <span className="truncate">{cat.name}</span>
            {cat.id.startsWith("ai-") && (
              <span className="ml-auto text-[9px] tracking-tighter text-slate-500 uppercase opacity-50 group-hover:opacity-100">
                AI
              </span>
            )}
          </button>
        ))}
        {categories.length === 0 && (
          <div className="px-2 text-xs text-slate-500 italic">
            Ingen kategorier fundet
          </div>
        )}
      </div>
      <div className="border-t border-slate-700 pt-1">
        <button
          onClick={() => updateCategory(null, false)}
          className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-slate-400 hover:bg-slate-700 hover:text-blue-400"
        >
          <Unlock size={14} /> Lås op / Reset AI
        </button>
      </div>
    </div>
  );
};
