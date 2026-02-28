// --- HJÆLPERE TIL SØGNING & HIGHLIGHT ---
export const countMatches = (text: string, query: string) => {
  if (!text || !query) return 0;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let count = 0;
  let index = 0;
  while ((index = lowerText.indexOf(lowerQuery, index)) !== -1) {
    count++;
    index += lowerQuery.length;
  }
  return count;
};

export const generateSnippet = (
  text: string,
  query: string,
  padding = 30,
  maxSnippets = 3,
) => {
  if (!text) return "";
  if (!query) return text.substring(0, 80);

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const queryLength = query.length;

  const matchIndices: number[] = [];
  let startIndex = 0;

  // Find alle forekomster af søgeordet
  while ((startIndex = lowerText.indexOf(lowerQuery, startIndex)) > -1) {
    matchIndices.push(startIndex);
    startIndex += queryLength;
  }

  // Hvis intet matchtes i selve teksten (f.eks. hvis det kun matchede i titlen)
  if (matchIndices.length === 0) {
    return text.substring(0, 80) + (text.length > 80 ? "..." : "");
  }

  // Opret intervaller (start og slut) for hvert match inkl. padding
  const intervals = matchIndices.map((index) => ({
    start: Math.max(0, index - padding),
    end: Math.min(text.length, index + queryLength + padding),
  }));

  // Flet overlappende intervaller, så vi ikke gentager tekst der ligger tæt
  intervals.sort((a, b) => a.start - b.start);
  const mergedIntervals = [];

  if (intervals.length > 0) {
    let current = intervals[0];
    for (let i = 1; i < intervals.length; i++) {
      // Hvis de ligger inden for 15 tegns afstand, så slå dem sammen
      if (intervals[i].start <= current.end + 15) {
        current.end = Math.max(current.end, intervals[i].end);
      } else {
        mergedIntervals.push(current);
        current = intervals[i];
      }
    }
    mergedIntervals.push(current);
  }

  // Begræns antallet af viste udklip, så kortet ikke bliver enormt
  const limitedIntervals = mergedIntervals.slice(0, maxSnippets);

  // Byg den endelige streng med " ... " mellem udklippene
  return limitedIntervals
    .map((interval, idx) => {
      const prefix = interval.start > 0 ? "..." : "";
      const suffix =
        interval.end < text.length && idx === limitedIntervals.length - 1
          ? "..."
          : "";
      return prefix + text.substring(interval.start, interval.end) + suffix;
    })
    .join("  ...  ");
};

export const HighlightMatch = ({
  text,
  query,
}: {
  text: string;
  query: string;
}) => {
  if (!query || !text) return <>{text}</>;

  // Splitter teksten case-insensitive baseret på søgeordet
  const parts = text.split(new RegExp(`(${query})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark
            key={i}
            className="rounded-sm bg-action/30 px-0.5 font-semibold text-high"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
};
