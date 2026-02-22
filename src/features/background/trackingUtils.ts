// --- URL CLEANER LOGIC ---

export const TRACKING_PARAMS: Set<string> = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "gbraid",
  "wbraid",
  "_ga",
  "_gl",
  "fbclid",
  "igshid",
  "twclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "_hsenc",
  "_hsmi",
  "ref",
  "ref_src",
  "ref_url",
]);

export function cleanUrlAndGetTracking(rawUrl: string): {
  cleanUrl: string;
  removedParams: string;
} {
  try {
    const urlObj = new URL(rawUrl);
    const params = new URLSearchParams(urlObj.search);
    let hasChanges = false;
    const removed: string[] = [];
    const keysToDelete: string[] = [];

    params.forEach((value, key) => {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        keysToDelete.push(key);
        removed.push(`${key}=${value}`);
      }
    });

    for (const key of keysToDelete) {
      params.delete(key);
      hasChanges = true;
    }

    if (!hasChanges) {
      return { cleanUrl: rawUrl, removedParams: "" };
    }

    urlObj.search = params.toString();
    return {
      cleanUrl: urlObj.toString(),
      removedParams: `?${removed.join("&")}`,
    };
  } catch (e) {
    return { cleanUrl: rawUrl, removedParams: "" };
  }
}
