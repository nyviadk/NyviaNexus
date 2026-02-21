import { Check, Moon, Sun } from "lucide-react"; // Palette fjernet herfra
import React, { useEffect, useState } from "react";

/**
 * Nexus - ThemeSelector
 * Håndterer skift mellem visuelle arkitekturer.
 */

type Theme = "architect" | "pastel";

export const ThemeSelector: React.FC = () => {
  const [currentTheme, setCurrentTheme] = useState<Theme>("architect");

  useEffect(() => {
    // Vi definerer eksplicit hvad vi forventer fra storage for at tilfredsstille TS
    chrome.storage.local.get(["nexus_theme"], (res) => {
      const savedTheme = res.nexus_theme as Theme;
      if (savedTheme) {
        setCurrentTheme(savedTheme);
      }
    });
  }, []);

  const applyTheme = (theme: Theme) => {
    setCurrentTheme(theme);
    chrome.storage.local.set({ nexus_theme: theme });

    // Fjern alle mulige tema-klasser
    document.documentElement.classList.remove("theme-pastel");

    // Tilføj den valgte (architect er standard/:root)
    if (theme !== "architect") {
      document.documentElement.classList.add(`theme-${theme}`);
    }
  };

  const themes = [
    {
      id: "architect",
      name: "Architect",
      label: "Mørk Onyx",
      icon: <Moon size={20} />,
    },
    {
      id: "pastel",
      name: "Pastel",
      label: "Lys Alabaster",
      icon: <Sun size={20} />,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {themes.map((t) => (
        <button
          key={t.id}
          onClick={() => applyTheme(t.id as Theme)}
          className={`group relative flex cursor-pointer flex-col items-start gap-3 rounded-2xl border p-4 transition-all ${
            currentTheme === t.id
              ? "border-action bg-action/10 shadow-lg shadow-action/5"
              : "border-subtle bg-surface-sunken hover:border-strong"
          }`}
        >
          <div
            className={`rounded-lg p-2 transition-transform group-hover:scale-110 ${
              currentTheme === t.id
                ? "bg-action text-inverted"
                : "bg-surface-elevated text-low"
            }`}
          >
            {t.icon}
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-high">{t.name}</p>
            <p className="text-[10px] font-medium tracking-tighter text-low uppercase">
              {t.label}
            </p>
          </div>
          {currentTheme === t.id && (
            <div className="absolute top-3 right-3 text-action">
              <Check size={16} />
            </div>
          )}
        </button>
      ))}
    </div>
  );
};
