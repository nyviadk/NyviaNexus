import { Profile } from "@/types";
import { Check, ChevronDown, ChevronUp, User } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";

export interface CustomProfileSelectorProps {
  profiles: Profile[];
  activeProfile: string;
  onSelect: (profileId: string) => void;
}

export const CustomProfileSelector = memo(
  ({ profiles, activeProfile, onSelect }: CustomProfileSelectorProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Click outside listener
    useEffect(() => {
      function handleClickOutside(event: MouseEvent) {
        if (
          dropdownRef.current &&
          !dropdownRef.current.contains(event.target as Node)
        ) {
          setIsOpen(false);
        }
      }
      if (isOpen) {
        document.addEventListener("mousedown", handleClickOutside);
      }
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }, [isOpen]);

    const currentProfileName = useMemo(() => {
      return (
        profiles.find((p) => p.id === activeProfile)?.name || "Vælg Profil"
      );
    }, [profiles, activeProfile]);

    return (
      <div className="relative flex-1" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex w-full cursor-pointer items-center justify-between rounded-xl border p-2 text-sm text-white transition-all outline-none ${
            isOpen
              ? "border-blue-500/50 bg-slate-800 ring-2 ring-blue-500/20"
              : "border-slate-600 bg-slate-800/50 hover:border-slate-500 hover:bg-slate-800"
          }`}
        >
          <span className="flex items-center gap-2 truncate font-medium">
            <User size={16} className="text-slate-400" />
            {currentProfileName}
          </span>
          {isOpen ? (
            <ChevronUp size={16} className="text-slate-400" />
          ) : (
            <ChevronDown size={16} className="text-slate-400" />
          )}
        </button>

        {isOpen && (
          <div className="animate-in fade-in zoom-in-95 absolute top-full left-0 z-50 mt-2 w-full min-w-50 origin-top-left rounded-xl border border-slate-700 bg-slate-800 p-1 shadow-2xl ring-1 ring-black/50 duration-100">
            <div className="mb-1 px-2 py-1 text-[10px] font-bold tracking-widest text-slate-500 uppercase">
              Vælg profil
            </div>
            {profiles.map((p) => {
              const isActive = p.id === activeProfile;
              return (
                <div
                  key={p.id}
                  onClick={() => {
                    onSelect(p.id);
                    setIsOpen(false);
                  }}
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "text-slate-300 hover:bg-slate-700 hover:text-white"
                  }`}
                >
                  <span className="truncate">{p.name}</span>
                  {isActive && <Check size={14} />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  },
);
