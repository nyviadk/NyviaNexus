const TRACKING_PARAMS: Set<string> = new Set([
  // --- Standard UTM (Google Analytics & generel marketing) ---
  "utm_source", // Kilde (f.eks. google, newsletter, facebook)
  "utm_medium", // Medium (f.eks. cpc, email, social)
  "utm_campaign", // Kampagnenavn (f.eks. summer_sale_2025)
  "utm_term", // Søgeord brugt i betalt søgning
  "utm_content", // Bruges til A/B test og ad-diffentiering
  "utm_id", // Master Campaign ID (ofte brugt i GA4 import)
  "_ga", // <-- Google
  "_gl", // <-- Google
  "_up", // <-- Google consent/update tracker

  // --- Google & YouTube Ads ---
  "gclid", // Google Click ID (Auto-tagging i Google Ads)
  "gbraid", // Google Click ID til iOS (Web-to-App)
  "wbraid", // Google Click ID til iOS (App-to-Web)
  "dclid", // Google Display Network Click ID

  // --- Meta (Facebook & Instagram) ---
  "fbclid", // Facebook Click ID
  "igshid", // Instagram Sharing ID
  "h_ad_id", // Meta Ad ID (ofte brugt i URL-skabeloner)

  // --- Andre Sociale Medier ---
  "ttclid", // TikTok Click ID
  "twclid", // Twitter/X Click ID
  "li_fat_id", // LinkedIn Insights Click ID
  "msclkid", // Microsoft/Bing Click ID

  // --- Email & CRM (Mailchimp, HubSpot, etc.) ---
  "mc_cid", // Mailchimp Campaign ID
  "mc_eid", // Mailchimp Email ID (unik per modtager)
  "_hsenc", // HubSpot Email Tracking
  "_hsmi", // HubSpot Marketing Email ID
  "mkt_tok", // Marketo Tracking Token

  // --- Affiliate & Referral ---
  "cid", // Generisk Campaign/Client ID (brugt af bl.a. TV2)
  "ref", // Generisk Referral parameter
  "ref_src", // Referral kilde
  "ref_url", // Den oprindelige URL før redirect
  "tag", // Amazon Affiliate tag
  "ascsubtag", // Affiliate sub-tag (ofte brugt til sub-ID sporing)
  "linkcode", // Amazon Affiliate link routing

  // --- Amazon Specifik Støj (Tracking & Navigation) ---
  "pd_rd_r", // Product Detail Recommendation routing
  "pd_rd_w", // Product Detail widget tracking
  "pd_rd_wg", // Product Detail widget tracking
  "pd_rd_i", // Product Detail Recommendation Item
  "pf_rd_p", // Product Framework tracking
  "pf_rd_r", // Product Framework routing
  "pf_rd_s", // Product Framework slot
  "pf_rd_t", // Product Framework type
  "pf_rd_i", // Product Framework id
  "pf_rd_m", // Product Framework medium
  "crid", // Search suggestions tracking (Autocomplete)
  "sprefix", // Search prefix tracking
  "qid", // Query ID (timestamp for søgningen)
  "sr", // Search Result index (placering i søgeresultater)
  "dib", // Amazon Data Integrity Blob (stor tracking streng)
  "dib_tag", // Tilhørende tag til dib
  "aref", // Amazon referral tracking
  "sp_csd", // Sponsored product tracking
  "pd_rd_plhdr", // Product detail placeholder tracking
  "content-id", // Dynamic content tracking
  "keywords", // Søgeord sendt med i URL'en
  "rnid", // Refinement ID (filtre på Amazon)
  "node", // Amazon kategori/node ID

  // --- Diverse støj & Tekniske parametre ---
  "ie", // Input encoding (støjer typisk kun: "UTF8")
  "ts_id", // Tidsstempel ID
  "yclid", // Yandex Click ID
  "_branch_match_id", // Branch.io deep linking tracking
  "s_kwcid", // Adobe/Google Search tracking
  "wickedid", // Wicked Reports tracking
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
