import { TabData } from "../background/main";
import { WorkspaceWindow } from "../dashboard/types";

export const LinkManager = {
  /**
   * Kopierer en liste af tabs til udklipsholderen som ren tekst (URL liste).
   */
  async copyTabsToClipboard(tabs: TabData[]): Promise<number> {
    if (!tabs || tabs.length === 0) return 0;

    const textList = tabs
      .map((t) => t.url)
      .filter((url) => url && !url.includes("dashboard.html")) // Filtrer dashboard urls fra
      .join("\n");

    try {
      await navigator.clipboard.writeText(textList);
      return tabs.length;
    } catch (err) {
      console.error("Failed to copy: ", err);
      return 0;
    }
  },

  /**
   * Kopierer et helt workspace (flere vinduer) til clipboard.
   * Understøtter 'standard' (med ### separator) og 'notebook' (ren liste).
   */
  async copyWindowsToClipboard(
    windows: WorkspaceWindow[],
    format: "standard" | "notebook" = "standard",
  ): Promise<number> {
    if (!windows || windows.length === 0) return 0;

    let totalTabs = 0;
    let finalString = "";

    if (format === "standard") {
      // Standard format med ### separation mellem vinduer
      const windowStrings = windows.map((w) => {
        const validUrls = (w.tabs || [])
          .map((t) => t.url)
          .filter(
            (url) =>
              url &&
              !url.includes("dashboard.html") &&
              !url.startsWith("chrome"),
          );

        totalTabs += validUrls.length;
        return validUrls.join("\n");
      });

      // Filtrer tomme vinduer fra, så vi ikke får unødige "###" i træk
      const nonEmptyWindows = windowStrings.filter(
        (str) => str.trim().length > 0,
      );

      finalString = nonEmptyWindows.join("\n\n###\n\n");
    } else {
      // Notebook format: En flad liste af alle links adskilt af linjeskift
      const urls = windows
        .flatMap((w) => w.tabs || [])
        .filter(
          (t) =>
            t.url &&
            !t.url.startsWith("chrome") &&
            !t.url.includes("dashboard.html"),
        )
        .map((t) => t.url);

      totalTabs = urls.length;
      finalString = urls.join("\n");
    }

    if (totalTabs === 0) return 0;

    try {
      await navigator.clipboard.writeText(finalString);
      return totalTabs;
    } catch (err) {
      console.error("Failed to copy workspace: ", err);
      return 0;
    }
  },

  /**
   * Parser rå tekst for URL'er og genererer NexusTab objekter.
   * Returnerer en liste af objekter klar til Firestore.
   * @param rawText Teksten der skal parses
   * @param uniqueOnly Hvis true, fjernes dubletter. Hvis false (default), tillades dubletter.
   */
  parseAndCreateTabs(rawText: string, uniqueOnly: boolean = false): TabData[] {
    // Regex der fanger http/https URL'er.
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const foundUrls = rawText.match(urlRegex) || [];

    // Håndter dubletter baseret på toggle
    const urlsToProcess = uniqueOnly ? [...new Set(foundUrls)] : foundUrls;

    return urlsToProcess.map((url) => ({
      uid: crypto.randomUUID(), // Kritisk for systemets drag-n-drop
      url: url.trim(),
      title: "Importeret Link", // Placeholder indtil Chrome besøger den
      favIconUrl: "",
      isIncognito: false,
      clearedTracking: null,
      aiData: {
        status: "pending", // VIGTIGT: Dette trigger din AI-kø næste gang vinduet åbnes
        isLocked: false,
        reasoning: "Importeret manuelt",
      },
    }));
  },
};
