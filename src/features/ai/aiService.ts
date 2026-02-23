import { AiSettings } from "../dashboard/types";

// Denne service håndterer kommunikationen med Cerebras
const API_URL = "https://api.cerebras.ai/v1/chat/completions";

const DEFAULT_SETTINGS: AiSettings = {
  allowDynamic: true,
  useUncategorized: false,
  userCategories: [],
};

export interface AiAnalysisResult {
  category: string;
  confidence: number;
  reasoning: string;
}

// Definition af helbredsstatus for AI servicen
export type AiHealthStatus = "up" | "down" | "unknown";

export const AiService = {
  // Hent API nøgle
  async getApiKey(): Promise<string | null> {
    const data = (await chrome.storage.local.get("cerebras_api_key")) as {
      cerebras_api_key?: string;
    };
    const key = data.cerebras_api_key || null;
    if (!key) console.warn("🤖 AI Service: Ingen API nøgle fundet!");
    return key;
  },

  // Gem API nøgle
  async saveApiKey(key: string): Promise<void> {
    await chrome.storage.local.set({ cerebras_api_key: key });
  },

  // Hent AI Indstillinger og Kategorier
  async getSettings(): Promise<AiSettings> {
    const data = (await chrome.storage.local.get("nexus_ai_settings")) as {
      nexus_ai_settings?: AiSettings;
    };
    return data.nexus_ai_settings || DEFAULT_SETTINGS;
  },

  // Gem Indstillinger
  async saveSettings(settings: AiSettings): Promise<void> {
    await chrome.storage.local.set({ nexus_ai_settings: settings });
  },

  // Helper til at sætte service status
  async setServiceStatus(status: AiHealthStatus): Promise<void> {
    // Vi henter først nuværende status for ikke at spamme storage unødigt
    const current = (await chrome.storage.local.get("nexus_ai_health")) as {
      nexus_ai_health?: AiHealthStatus;
    };

    if (current.nexus_ai_health !== status) {
      console.log(`🤖 AI Service Status ændret: ${status}`);
      await chrome.storage.local.set({ nexus_ai_health: status });
    }
  },

  async analyzeTab(
    title: string,
    url: string,
    metadata: string,
    workspaceContext?: string,
  ): Promise<AiAnalysisResult | null> {
    console.log(
      `🤖 AI Service: Analyserer tab: "${title}" [Context: ${
        workspaceContext || "None"
      }]`,
    );

    const apiKey = await this.getApiKey();
    const settings = await this.getSettings();

    if (!apiKey) {
      console.error("🤖 AI Service ABORT: Mangler API nøgle.");
      return null;
    }

    // Byg prompten baseret på indstillinger
    let systemPrompt = "";
    const userCatNames = settings.userCategories.map((c) => c.name);

    const languageInstruction = `
VIGTIGT VEDRØRENDE SPROG:
Du SKAL skrive på fejlfrit dansk.
`;

    // Scenarie 1: Dynamisk (AI må opfinde, men skal prioritere brugerens liste)
    if (settings.allowDynamic) {
      systemPrompt = `
Du er en intelligent assistent til browser-organisering.
Du er en streng JSON-klassificerings-API. Du taler IKKE. Du udskriver KUN JSON.
Din opgave er at tildele den mest præcise kategori til en fane.

BRUGERENS FORETRUKNE KATEGORIER:
${JSON.stringify(userCatNames)}

INSTRUKSER:
1. Tjek FØRST om fanen passer PERFEKT i en af brugerens kategorier ovenfor. Prioritér dem højt.
2. HVIS fanen er specifik og slet ikke passer i brugerens kategorier, så SKAL du opfinde en ny, passende kategori.
3. Vær præcis. En opskrift er "Mad", ikke "Læsning".
   - Kategorien skal være på Dansk.
   - Den skal være kort (1-3 ord).
   - Den skal beskrive indholdets emne.
4. Du skal ikke modsige dine egne tanker. Hvis du tænker, at en fane ikke passer i de foretrukne kategorier, skal du opfinde din egen.
5. Hvis Fane titlen og metadata ikke tyder på at den hører til i en foretrukken kategori, skal du lave din egen. Du må ikke tvinge den ned i en forkert kategori.
6. Vær klog: Hvis spacenavnet indikerer et professionelt projekt, skal du tolke fanens formål gennem den linse.
7. Tænk dig om. Hvis indholdet ikke er relateret til workspace navnet, så opfind din egen passende kategori.
${languageInstruction}

Output Format (JSON Only):
{ "category": "String", "confidence": Number (0-100), "reasoning": "Kort forklaring på dansk" }
`;
    }
    // Scenarie 2: Strict (AI SKAL vælge fra listen)
    else {
      let allowedList = [...userCatNames];
      if (settings.useUncategorized) {
        allowedList.push("Ukategoriseret");
      }

      // Hvis listen er helt tom, tvinger vi den til dynamisk alligevel for at undgå crash
      if (allowedList.length === 0) {
        allowedList = ["Ukategoriseret"];
      }

      systemPrompt = `
Du er en streng kategoriserings-bot. Du taler KUN JSON.
Du MÅ KUN vælge en kategori fra denne eksakte liste:
${JSON.stringify(allowedList)}

INSTRUKSER:
1. Analyser fanen og vælg den kategori fra listen, der passer bedst.
2. Du må IKKE opfinde nye kategorier. Du SKAL bruge en streng fra listen.
${
  settings.useUncategorized
    ? '3. Hvis intet passer, vælg "Ukategoriseret".'
    : "3. Vælg det tætteste match, selvom det ikke er perfekt."
}
${languageInstruction}

Output Format (JSON Only):
{ "category": "String", "confidence": Number (0-100), "reasoning": "Kort forklaring på dansk" }
`;
    }

    let contextInstruction = "";
    if (workspaceContext && workspaceContext !== "Inbox") {
      contextInstruction = `
VIGTIGT KONTEKST:
Denne fane befinder sig i et workspace navngivet: "${workspaceContext}".
Lad navnet på workspacet guide din kategorisering.
Eks: Hvis workspace hedder "Eksamen", er en nyhedsside måske "Research" snarere end "Nyheder".
Hvis workspace hedder "Gaver", er en produktside "Shopping".
`;
    }

    // Rens metadata for tokens og støj
    const cleanMetadata = metadata
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 600);

    const userPrompt = `
Analyser denne fane:
URL: ${url}
Titel: ${title}
Metadata: ${cleanMetadata}
${contextInstruction}
`;

    try {
      console.time("🤖 AI Latency");
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "llama3.1-8b",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0, // Kritisk for JSON stabilitet
          max_tokens: 200,
          response_format: { type: "json_object" }, // Tvinger JSON output
        }),
      });
      console.timeEnd("🤖 AI Latency");

      if (!response.ok) {
        // Håndter 503 eller andre server fejl
        if (response.status === 503 || response.status >= 500) {
          console.warn(`🤖 AI Service NEDE: ${response.status}`);
          await this.setServiceStatus("down");
        }
        throw new Error(`API Error: ${response.status}`);
      }

      // Hvis vi når hertil, er servicen oppe
      await this.setServiceStatus("up");

      const data = await response.json();
      const rawContent = data.choices[0]?.message?.content || "";

      const parsed = this.parseResponse(rawContent);
      if (parsed) {
        console.log("🧠 AI Tanker:", parsed.reasoning);
        console.log("🏷️ AI Valg:", parsed.category);
      }
      return parsed;
    } catch (e: unknown) {
      console.error("🤖 AI Service Fejl:", e);

      // Tjek for netværksfejl (som fetch failure) der ikke er response.ok
      if (e instanceof Error) {
        if (
          e.message.includes("Failed to fetch") ||
          e.message.includes("503")
        ) {
          await this.setServiceStatus("down");
        }
      }

      return null;
    }
  },

  parseResponse(raw: string): AiAnalysisResult {
    try {
      // Fjern markdown blocks hvis de findes og rens for hyppige AI-glitches
      let cleaned = raw
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      return JSON.parse(cleaned);
    } catch (e) {
      // Robust fallback med regex
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (e2) {
          console.error("🤖 JSON Parse fejl (Regex):", raw);
        }
      }
      return {
        category: "Fejl",
        confidence: 0,
        reasoning: "Kunne ikke læse AI svar",
      };
    }
  },
};
