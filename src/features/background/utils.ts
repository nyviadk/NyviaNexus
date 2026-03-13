import { Timestamp } from "firebase/firestore";

export async function extractMetadata(tabId: number): Promise<string> {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        try {
          const title = document.title || "";
          const metaDesc =
            document
              .querySelector('meta[name="description"]')
              ?.getAttribute("content") || "";
          const ogDesc =
            document
              .querySelector('meta[property="og:description"]')
              ?.getAttribute("content") || "";
          const h1 = document.querySelector("h1")?.innerText || "";

          return `${title} | ${metaDesc} | ${ogDesc} | ${h1}`
            .replace(/\s+/g, " ")
            .trim();
        } catch (e) {
          return document.title || "";
        }
      },
    });
    // executeScript returns InjectionResult[]
    return result[0]?.result || "";
  } catch (e) {
    return "";
  }
}

export /**
 * Konverterer sikkert Firestore Timestamp (eller lignende objekter fra cache) til millisekunder.
 */
function getTimestampMillis(
  ts: Timestamp | { seconds: number; nanoseconds: number } | undefined | null,
): number {
  if (!ts) return 0;

  // Hvis det er et ægte Timestamp objekt med toMillis metoden
  if ("toMillis" in ts && typeof ts.toMillis === "function") {
    return ts.toMillis();
  }

  // Hvis det er et fladt objekt (fra storage eller JSON)
  if ("seconds" in ts && typeof ts.seconds === "number") {
    return ts.seconds * 1000;
  }

  return 0;
}
