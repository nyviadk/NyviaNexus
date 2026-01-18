// Global cache kan eksporteres herfra
export const windowOrderCache = new Map<
  string,
  { signature: string; indices: Record<string, number> }
>();

export const getContrastYIQ = (hexcolor: string) => {
  const hex = hexcolor.replace("#", "");
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#1e293b" : "#ffffff";
};

export const getCategoryStyle = (category: string) => {
  const lower = category.toLowerCase();

  if (
    lower.includes("ukategoriseret") ||
    lower === "ukendt" ||
    lower === "fejl"
  ) {
    return "bg-slate-800 text-slate-500 border-slate-700 hover:text-slate-300 transition-colors";
  }

  // Standard Categories
  if (lower.includes("udvikling") || lower.includes("kode"))
    return "bg-cyan-600 text-white border-cyan-500 shadow-md shadow-cyan-900/50";
  if (lower.includes("nyheder") || lower.includes("læsning"))
    return "bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-900/50";
  if (lower.includes("arbejde") || lower.includes("produktivitet"))
    return "bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-900/50";
  if (lower.includes("sociale") || lower.includes("medier"))
    return "bg-pink-600 text-white border-pink-500 shadow-md shadow-pink-900/50";
  if (lower.includes("shopping") || lower.includes("handel"))
    return "bg-orange-600 text-white border-orange-500 shadow-md shadow-orange-900/50";
  if (lower.includes("underholdning") || lower.includes("video"))
    return "bg-red-600 text-white border-red-500 shadow-md shadow-red-900/50";
  if (lower.includes("finans") || lower.includes("bank"))
    return "bg-yellow-600 text-white border-yellow-500 shadow-md shadow-yellow-900/50";

  // Dynamic / System Categories
  if (lower.includes("søgning") || lower.includes("search"))
    return "bg-slate-500 text-white border-slate-400 shadow-md";
  if (lower.includes("netværk") || lower.includes("wifi"))
    return "bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-900/50";
  if (
    lower.includes("sikkerhed") ||
    lower.includes("login") ||
    lower.includes("konto")
  )
    return "bg-violet-600 text-white border-violet-500 shadow-md shadow-violet-900/50";
  if (lower.includes("mail") || lower.includes("kommunikation"))
    return "bg-sky-600 text-white border-sky-500 shadow-md shadow-sky-900/50";
  if (lower.includes("dokument") || lower.includes("skrivning"))
    return "bg-teal-600 text-white border-teal-500 shadow-md shadow-teal-900/50";

  if (
    lower.includes("mad") ||
    lower.includes("opskrifter") ||
    lower.includes("drikke")
  )
    return "bg-lime-600 text-white border-lime-500 shadow-md shadow-lime-900/50";
  if (
    lower.includes("sundhed") ||
    lower.includes("helbred") ||
    lower.includes("sport")
  )
    return "bg-green-500 text-white border-green-400 shadow-md shadow-green-900/50";
  if (
    lower.includes("bolig") ||
    lower.includes("hus") ||
    lower.includes("ejendom")
  )
    return "bg-amber-700 text-white border-amber-600 shadow-md shadow-amber-900/50";
  if (
    lower.includes("offentlig") ||
    lower.includes("stat") ||
    lower.includes("borger")
  )
    return "bg-fuchsia-700 text-white border-fuchsia-600 shadow-md shadow-fuchsia-900/50";

  if (
    lower.includes("database") ||
    lower.includes("backend") ||
    lower.includes("api")
  )
    return "bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-900/50";

  if (
    lower.includes("research") ||
    lower.includes("reference") ||
    lower.includes("viden")
  )
    return "bg-teal-600 text-white border-teal-500 shadow-md shadow-teal-900/50";

  if (lower.includes("design") || lower.includes("ui") || lower.includes("ux"))
    return "bg-pink-500 text-white border-pink-400 shadow-md shadow-pink-900/50";

  // Default / Catch-all Fallback
  return "bg-slate-600 text-slate-200 border-slate-500 shadow-md";
};
