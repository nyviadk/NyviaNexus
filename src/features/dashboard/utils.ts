import { NexusItem } from "./types";

// Global cache kan eksporteres herfra
export const windowOrderCache = new Map<
  string,
  { signature: string; indices: Record<string, number> }
>();

export const getContrastYIQ = (hexcolor: string) => {
  const hex = hexcolor.replace("#", "");
  // Bruger substring i stedet for substr for moderne JS standarder
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 2), 16);
  const b = parseInt(hex.substring(4, 2), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;

  // Returnerer Mørk Slate (slate-950) hvis baggrunden er lys, ellers Hvid.
  return yiq >= 128 ? "#0f172a" : "#ffffff";
};

export const getCategoryStyle = (category: string) => {
  const lower = category?.toLowerCase() || "";

  // Dæmpet stil til fejl/ukendte
  if (
    lower.includes("ukategoriseret") ||
    lower === "ukendt" ||
    lower === "fejl" ||
    !category
  ) {
    return "bg-surface text-low border-subtle opacity-70 transition-colors";
  }

  // --- MINIMALISTISK STANDARD MED DYBDE ---
  // Giver tagget mere karakter og dybde som default.
  // Bruger border-strong og text-high for at markere, at det er et solidt badge,
  // og løfter det med shadow-md og en lille baggrundsændring ved hover.
  return "bg-surface-elevated text-high border-strong shadow-sm hover:shadow-md hover:bg-surface-hover transition-all";
};

// --- BREADCRUMB HELPER TIL FULD STI ---
export const getParentPath = (
  parentId: string,
  allItems: NexusItem[],
): string[] => {
  if (parentId === "root") return ["Rod"];

  const path: string[] = [];
  let currentId = parentId;

  // Vi sætter en sikring (depth) ind for at undgå uendelige loops,
  // hvis der mod forventning skulle være en cirkulær reference i Firestore dataen.
  let depth = 0;
  while (currentId !== "root" && depth < 20) {
    const item = allItems.find((i) => i.id === currentId);
    if (item) {
      path.unshift(item.name); // Sæt navnet forrest i arrayet
      currentId = item.parentId || "root";
    } else {
      break; // Hvis vi ikke kan finde parent, stopper vi
    }
    depth++;
  }

  // Tilføj "Rod" helt forrest uanset hvad
  path.unshift("Rod");
  return path;
};
