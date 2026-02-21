import { Moon, Sun, Leaf } from "lucide-react";

export const THEMES = [
  {
    id: "architect",
    name: "Architect",
    label: "Mørk Onyx",
    icon: Moon,
  },
  {
    id: "pastel",
    name: "Pastel",
    label: "Lys Alabaster",
    icon: Sun,
  },
  {
    id: "serene",
    name: "Serene",
    label: "Varmt Sand",
    icon: Leaf,
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

/**
 * Opdaterer <html> klasserne baseret på det valgte tema.
 * Fjerner alle andre tema-klasser for at undgå konflikter.
 */
export const applyThemeToDOM = (themeId: string) => {
  const root = document.documentElement;

  // Fjern alle tema-klasser (undtagen standard architect som er i :root)
  THEMES.forEach((t) => {
    if (t.id !== "architect") {
      root.classList.remove(`theme-${t.id}`);
    }
  });

  // Tilføj den valgte klasse
  if (themeId !== "architect") {
    root.classList.add(`theme-${themeId}`);
  }
};

/**
 * Hjælper til at hente temaet sikkert fra Chrome Storage
 */
export const getSavedTheme = async (): Promise<ThemeId> => {
  const res = await chrome.storage.local.get(["nexus_theme"]);
  return (res.nexus_theme as ThemeId) || "architect";
};
