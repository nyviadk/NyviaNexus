import React, { useEffect, useState } from "react";
import { Check } from "lucide-react";
import {
  applyThemeToDOM,
  getSavedTheme,
  ThemeId,
  THEMES,
} from "@/theme-config";

export const ThemeSelector: React.FC = () => {
  const [currentTheme, setCurrentTheme] = useState<ThemeId>("architect");

  useEffect(() => {
    getSavedTheme().then(setCurrentTheme);
  }, []);

  const handleThemeChange = (id: ThemeId) => {
    setCurrentTheme(id);
    chrome.storage.local.set({ nexus_theme: id });
    applyThemeToDOM(id);
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {THEMES.map((theme) => {
        const Icon = theme.icon;
        const isActive = currentTheme === theme.id;

        return (
          <button
            key={theme.id}
            onClick={() => handleThemeChange(theme.id)}
            className={`group relative flex cursor-pointer flex-col items-start gap-3 rounded-2xl border p-4 transition-all ${
              isActive
                ? "border-action bg-action/10 shadow-lg shadow-action/5"
                : "border-subtle bg-surface-sunken hover:border-strong"
            }`}
          >
            <div
              className={`rounded-lg p-2 transition-transform group-hover:scale-110 ${
                isActive
                  ? "bg-action text-inverted"
                  : "bg-surface-elevated text-low"
              }`}
            >
              <Icon size={20} />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-high">{theme.name}</p>
              <p className="text-[10px] font-medium tracking-tighter text-low uppercase">
                {theme.label}
              </p>
            </div>
            {isActive && (
              <div className="absolute top-3 right-3 text-action">
                <Check size={16} />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};
