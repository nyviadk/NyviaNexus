// Denne service håndterer kommunikationen med Cerebras
// Nøglen hentes nu fra chrome.storage.local (User Provided)

const API_URL = "https://api.cerebras.ai/v1/chat/completions";

// Standard kategorier (Bruges som fallback/base)
const SUGGESTED_CATEGORIES = [
  "Arbejde & Produktivitet",
  "Udvikling & Kode",
  "Nyheder & Læsning",
  "Sociale Medier",
  "Shopping & E-handel",
  "Underholdning & Video",
  "Finans & Bank",
  "Rejser & Transport",
  "Værktøjer & Utilities",
];

export interface AiAnalysisResult {
  category: string;
  confidence: number;
  reasoning: string;
}

export const AiService = {
  async getApiKey(): Promise<string | null> {
    const data = (await chrome.storage.local.get("cerebras_api_key")) as {
      cerebras_api_key?: string;
    };
    const key = data.cerebras_api_key || null;
    if (!key) console.warn("🤖 AI Service: Ingen API nøgle fundet i storage!");
    return key;
  },

  async saveApiKey(key: string): Promise<void> {
    console.log("🤖 AI Service: Gemmer ny API nøgle...");
    await chrome.storage.local.set({ cerebras_api_key: key });
  },

  async analyzeTab(
    title: string,
    url: string,
    metadata: string
  ): Promise<AiAnalysisResult | null> {
    console.log(`🤖 AI Service: Analyserer tab: "${title}"`);

    const apiKey = await this.getApiKey();

    if (!apiKey) {
      console.error("🤖 AI Service ABORT: Mangler API nøgle.");
      return null;
    }

    // DEN NYE "INTELLIGENTE" PROMPT MED NETVÆRK FIX
    const systemPrompt = `
Du er en intelligent assistent til browser-organisering.
Din opgave er at tildele den mest præcise kategori til en fane.

LOGIK FOR KATEGORISERING:
1. Tjek først om fanen passer PERFEKT i en af disse generiske kategorier:
${JSON.stringify(SUGGESTED_CATEGORIES)}

2. HVIS fanen er specifik og ikke passer godt i ovenstående, SKAL du opfinde en ny kategori.
   - Kategorien skal være på Dansk.
   - Den skal være kort (1-3 ord).
   - Den skal beskrive indholdets emne.

EKSEMPLER PÅ DIN TANKEGANG:
- "Valdemarsro Opskrifter" -> Passer ikke i "Nyheder". Lav ny: "Mad & Drikke".
- "Sundhed.dk" / "Netdoktor" -> Lav ny: "Sundhed".
- "Speedtest" / "Router Login" -> Lav ny: "Netværk".
- "Boligsiden" -> Passer ikke i "E-handel". Lav ny: "Bolig & Hus".
- "Google Docs" -> Passer ikke i "Værktøjer". Lav ny: "Dokumenter".
- "Københavns Universitet" -> Lav ny: "Uddannelse".

Output Format (JSON Only):
{
  "category": "String (Den kategori du vælger)",
  "confidence": Number (0-100),
  "reasoning": "Kort forklaring på dansk"
}
`;

    const userPrompt = `
Analyser denne fane:
URL: ${url}
Titel: ${title}
Metadata: ${metadata.substring(0, 400)}
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

      // LOG TANKERNE HER
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
        category: "Ukendt",
        confidence: 0,
        reasoning: "Kunne ikke læse AI svar",
      };
    }
  },
};
