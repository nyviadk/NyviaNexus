const TRACKING_PARAMS: Set<string> = new Set([
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
  // Amazon specifikke tracking parametre
  "tag", // Amazon Affiliate tag
  "ascsubtag", // Affiliate sub-tag
  "linkcode", // Affiliate link routing
  "pd_rd_r", // Product Detail Recommendation routing
  "pd_rd_w", // Product Detail widget tracking
  "pd_rd_wg", // Product Detail widget tracking
  "pd_rd_i", // Product Detail Recommendation Item (redundant ASIN sporing)
  "pf_rd_p", // Product Framework tracking
  "pf_rd_r", // Product Framework routing
  "pf_rd_s", // Product Framework slot
  "pf_rd_t", // Product Framework type
  "pf_rd_i", // Product Framework id
  "pf_rd_m", // Product Framework medium
  "crid", // Search suggestions tracking (Search autocomplete)
  "sprefix", // Search prefix tracking
  "qid", // Query ID (timestamp/session ID for søgninger)
  "sr", // Search Result index
  "dib", // Gigantisk base64 tracking blob
  "dib_tag", // Tilhørende tag til dib
  "aref", // Amazon referral tracking
  "sp_csd", // Sponsored product tracking
  "ref_", // Alternativ form for referral
  "content-id", // Dynamic content tracking
  "pd_rd_plhdr", // Product detail placeholder tracking
  "ie", // Input encoding (støjer bare i URL'en, "UTF8")
  "ts_id", // Tidsstempel ID for søgninger/anbefalinger
  // Bemærk: "th" og "psc" er bevidst ikke på listen, da de angiver produktvarianter (farve/størrelse).
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

    // Fjerner Amazon's indlejrede path-tracking (f.eks. /dp/ASIN/ref=sr_1_2_sspa)
    if (
      urlObj.hostname.includes("amazon.") &&
      urlObj.pathname.includes("/ref=")
    ) {
      const pathParts = urlObj.pathname.split("/ref=");
      removed.push(`[path_ref]=ref=${pathParts[1]}`);

      urlObj.pathname = pathParts[0];
      hasChanges = true;
    }

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

    // Ryd op hvis search bare er "?" tilbage efter sletning
    const finalUrl = urlObj.toString().replace(/\?$/, "");

    return {
      cleanUrl: finalUrl,
      removedParams: `?${removed.join("&")}`,
    };
  } catch (e) {
    return { cleanUrl: rawUrl, removedParams: "" };
  }
}
