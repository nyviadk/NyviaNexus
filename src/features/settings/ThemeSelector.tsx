import {
  applyThemeToDOM,
  getSavedTheme,
  ThemeId,
  THEMES,
} from "@/theme-config";
import React, { useEffect, useState } from "react";

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
    <div className="flex flex-col gap-2">
      <p className="px-1 text-[10px] font-bold tracking-widest text-low uppercase">
        Visuel arkitektur
      </p>

      {/* Scrollbar-skjult horisontal container til mange temaer */}
      <div className="no-scrollbar flex w-full items-center gap-1 overflow-x-auto rounded-2xl border border-subtle bg-surface-sunken p-1.5">
        {THEMES.map((theme) => {
          const Icon = theme.icon;
          const isActive = currentTheme === theme.id;

          return (
            <button
              key={theme.id}
              onClick={() => handleThemeChange(theme.id)}
              className={`flex min-w-fit flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 transition-all duration-200 ${
                isActive
                  ? "border-strong bg-surface-elevated text-action shadow-sm ring-1 ring-black/5"
                  : "text-low hover:bg-surface-hover hover:text-medium"
              }`}
            >
              <Icon
                size={16}
                className={isActive ? "text-action" : "text-low"}
              />
              <div className="flex flex-col items-start leading-none">
                <span className="font-bold">{theme.name}</span>
                <span className="text-xs">{theme.label}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
