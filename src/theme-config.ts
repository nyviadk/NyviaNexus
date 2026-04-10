import { Moon, Sun, Leaf, Wind } from "lucide-react";

export const THEMES = [
  {
    id: "architect",
    name: "Architect",
    label: "Mørk onyx",
    icon: Moon,
  },
  {
    id: "pastel",
    name: "Pastel",
    label: "Lys alabaster",
    icon: Sun,
  },
  {
    id: "serene",
    name: "Serene",
    label: "Varmt sand",
    icon: Leaf,
  },
  {
    id: "zen",
    name: "Zen",
    label: "Lavendel pastel",
    icon: Wind,
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const applyThemeToDOM = (themeId: string) => {
  const root = document.documentElement;
  THEMES.forEach((t) => {
    if (t.id !== "architect") {
      root.classList.remove(`theme-${t.id}`);
    }
  });
  if (themeId !== "architect") {
    root.classList.add(`theme-${themeId}`);
  }
};

export const getSavedTheme = async (): Promise<ThemeId> => {
  const res = await chrome.storage.local.get(["nexus_theme"]);
  return (res.nexus_theme as ThemeId) || "architect";
};

/**
 * Lytter på tema-ændringer fra andre vinduer via chrome.storage.onChanged
 * og anvender det nye tema med det samme — så alle åbne vinduer synkroniserer.
 */
export const listenForThemeChanges = () => {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.nexus_theme?.newValue) {
      applyThemeToDOM(changes.nexus_theme.newValue as string);
    }
  });
};
