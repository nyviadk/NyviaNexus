export const LinkManager = {
  /**
   * Kopierer en liste af tabs til udklipsholderen som ren tekst (URL liste).
   */
  async copyTabsToClipboard(tabs: any[]): Promise<number> {
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
   * Parser rå tekst for URL'er og genererer NexusTab objekter.
   * Returnerer en liste af objekter klar til Firestore.
   */
  parseAndCreateTabs(rawText: string): any[] {
    // Regex der fanger http/https URL'er.
    // Den er bred for at fange det meste, men kræver protokol for ikke at fange alm. tekst.
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const foundUrls = rawText.match(urlRegex) || [];

    // Fjern dubletter fra inputtet
    const uniqueUrls = [...new Set(foundUrls)];

    return uniqueUrls.map((url) => ({
      uid: crypto.randomUUID(), // Kritisk for systemets drag-n-drop
      url: url.trim(),
      title: "Importeret Link", // Placeholder indtil Chrome besøger den
      favIconUrl: "",
      isIncognito: false,
      aiData: {
        status: "pending", // VIGTIGT: Dette trigger din AI-kø næste gang vinduet åbnes
        isLocked: false,
        reasoning: "Importeret manuelt",
      },
    }));
  },
};
