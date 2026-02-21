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
  const lower = category.toLowerCase();

  if (
    lower.includes("ukategoriseret") ||
    lower === "ukendt" ||
    lower === "fejl"
  ) {
    return "bg-surface-elevated text-low border-subtle hover:text-medium transition-colors";
  }

  // --- STANDARD KATEGORIER (Mappet til semantiske tokens) ---

  // Udvikling / Tech -> Info (Cyan / Lyseblå)
  if (lower.includes("udvikling") || lower.includes("kode"))
    return "bg-info text-inverted border-info/50 shadow-md shadow-info/20";

  // Viden / Info -> Success (Grøn)
  if (lower.includes("nyheder") || lower.includes("læsning"))
    return "bg-success text-inverted border-success/50 shadow-md shadow-success/20";

  // Arbejde -> Action (Primær Blå)
  if (lower.includes("arbejde") || lower.includes("produktivitet"))
    return "bg-action text-inverted border-action/50 shadow-md shadow-action/20";

  // Socialt -> Incognito (Lilla / Pink)
  if (lower.includes("sociale") || lower.includes("medier"))
    return "bg-mode-incognito text-inverted border-mode-incognito/50 shadow-md shadow-mode-incognito/20";

  // Shopping -> Inbox (Orange)
  if (lower.includes("shopping") || lower.includes("handel"))
    return "bg-mode-inbox text-inverted border-mode-inbox/50 shadow-md shadow-mode-inbox/20";

  // Underholdning -> Danger (Rød)
  if (lower.includes("underholdning") || lower.includes("video"))
    return "bg-danger text-inverted border-danger/50 shadow-md shadow-danger/20";

  // Finans -> Warning (Gul / Amber)
  if (lower.includes("finans") || lower.includes("bank"))
    return "bg-warning text-inverted border-warning/50 shadow-md shadow-warning/20";

  // --- DYNAMISKE / SYSTEM KATEGORIER ---

  if (lower.includes("søgning") || lower.includes("search"))
    return "bg-strong text-inverted border-strong shadow-md shadow-strong/20";

  if (lower.includes("netværk") || lower.includes("wifi"))
    return "bg-info text-inverted border-info/50 shadow-md shadow-info/20";

  if (
    lower.includes("sikkerhed") ||
    lower.includes("login") ||
    lower.includes("konto")
  )
    return "bg-danger text-inverted border-danger/50 shadow-md shadow-danger/20";

  if (lower.includes("mail") || lower.includes("kommunikation"))
    return "bg-action text-inverted border-action/50 shadow-md shadow-action/20";

  if (lower.includes("dokument") || lower.includes("skrivning"))
    return "bg-mode-workspace text-inverted border-mode-workspace/50 shadow-md shadow-mode-workspace/20";

  if (
    lower.includes("mad") ||
    lower.includes("opskrifter") ||
    lower.includes("drikke")
  )
    return "bg-success text-inverted border-success/50 shadow-md shadow-success/20";

  if (
    lower.includes("sundhed") ||
    lower.includes("helbred") ||
    lower.includes("sport")
  )
    return "bg-success text-inverted border-success/50 shadow-md shadow-success/20";

  if (
    lower.includes("bolig") ||
    lower.includes("hus") ||
    lower.includes("ejendom")
  )
    return "bg-warning text-inverted border-warning/50 shadow-md shadow-warning/20";

  if (
    lower.includes("offentlig") ||
    lower.includes("stat") ||
    lower.includes("borger")
  )
    return "bg-mode-incognito text-inverted border-mode-incognito/50 shadow-md shadow-mode-incognito/20";

  if (
    lower.includes("database") ||
    lower.includes("backend") ||
    lower.includes("api")
  )
    return "bg-info text-inverted border-info/50 shadow-md shadow-info/20";

  if (
    lower.includes("research") ||
    lower.includes("reference") ||
    lower.includes("viden")
  )
    return "bg-mode-workspace text-inverted border-mode-workspace/50 shadow-md shadow-mode-workspace/20";

  if (lower.includes("design") || lower.includes("ui") || lower.includes("ux"))
    return "bg-mode-incognito text-inverted border-mode-incognito/50 shadow-md shadow-mode-incognito/20";

  // Default / Catch-all Fallback
  return "bg-surface-elevated text-high border-strong shadow-md";
};
