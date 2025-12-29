import { AiSettings } from "../types";

// Denne service håndterer kommunikationen med Cerebras
// Nu med Context Awareness (Workspace Navn)

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

  // Gem Indstillinger (Kaldes fra Dashboard)
  async saveSettings(settings: AiSettings): Promise<void> {
    await chrome.storage.local.set({ nexus_ai_settings: settings });
  },

  async analyzeTab(
    title: string,
    url: string,
    metadata: string,
    workspaceContext?: string // NYT: Context argument
  ): Promise<AiAnalysisResult | null> {
    console.log(
      `🤖 AI Service: Analyserer tab: "${title}" [Context: ${
        workspaceContext || "None"
      }]`
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
3. Vær præcis. En opskrift er "Mad & Drikke", ikke "Læsning".
   - Kategorien skal være på Dansk.
   - Den skal være kort (1-3 ord).
   - Den skal beskrive indholdets emne.
4. Du skal ikke modsige dine egne tanker. Hvis du tænker, at en fane ikke passer i de fortrukne kategorier, skal du ikke vælge en af de fortrukne kategorier. Du skal stole på dine tanker.
5. Hvis Fane titlen og metadata ikke indeholder noget, som tyder på at den har noget at gøre med en fortrukne kategori, skal du lave din egen kategori. Du skal ikke være kreativ for at presse ned i en kategori.
6. Tænk dig om. Hvis Workspacet hedder noget, og indholdet på siden ikke er relateret til workspace navnet, så lad vær med at være kreativ. Du skal igen opfinde din egen passende kategori.

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
Du er en streng kategoriserings-bot.
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

Output Format (JSON Only):
{ "category": "String (Eksakt match fra listen)", "confidence": Number (0-100), "reasoning": "Kort forklaring på dansk" }
`;
    }

    // NYT: Håndtering af Context Logic
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

    const userPrompt = `
Analyser denne fane:
URL: ${url}
Titel: ${title}
Metadata: ${metadata.substring(0, 400)}
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
          model: "llama-3.3-70b",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.1,
          max_tokens: 150,
        }),
      });
      console.timeEnd("🤖 AI Latency");

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `🤖 API Error Details: ${response.status} - ${errorText}`
        );
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      const rawContent = data.choices[0]?.message?.content || "";

      const parsed = this.parseResponse(rawContent);
      if (parsed) {
        console.log("🧠 AI Tanker:", parsed.reasoning);
        console.log("🏷️ AI Valg:", parsed.category);
      }
      return parsed;
    } catch (e) {
      console.error("🤖 AI Service Fejl:", e);
      return null;
    }
  },

  parseResponse(raw: string): AiAnalysisResult {
    try {
      return JSON.parse(raw);
    } catch (e) {
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
