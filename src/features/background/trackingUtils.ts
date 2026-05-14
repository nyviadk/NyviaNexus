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

  // --- Google & YouTube Ads (Inkl. ValueTrack) ---
  "gclid", // Google Click ID (Auto-tagging i Google Ads)
  "gbraid", // Google Click ID til iOS (Web-to-App)
  "wbraid", // Google Click ID til iOS (App-to-Web)
  "dclid", // Google Display Network Click ID
  "gad_source", // Google Ads kilde
  "gad_campaignid", // Google Ads kampagne ID
  "campaignid", // Google Ads Campaign ID (ValueTrack)
  "adgroupid", // Google Ads AdGroup ID (ValueTrack)
  "matchtype", // Google Ads Matchtype (ValueTrack)
  "network", // Google Ads Network (ValueTrack)
  "device", // Google Ads Device (ValueTrack)
  "devicemodel", // Google Ads Device Model (ValueTrack)
  "creative", // Google Ads Creative ID
  "keyword", // Google Ads Keyword
  "placement", // Google Ads Placement
  "srsltid", // Google Shopping / Merchant Center auto-tagging
  "newparameter", // Skjult Google Click ID (Tracking evasion)

  // --- Meta (Facebook & Instagram) & Generisk Ad Tracking ---
  "fbclid", // Facebook Click ID
  "igshid", // Instagram Sharing ID
  "h_ad_id", // Meta Ad ID (ofte brugt i URL-skabeloner)
  "campaign_id", // Generisk/Meta/TikTok kampagne ID
  "adset_id", // Generisk/Meta adset ID
  "ad_id", // Generisk/Meta ad ID
  "adid", // Generisk Ad ID

  // --- Andre Sociale Medier ---
  "ttclid", // TikTok Click ID
  "epik", // Pinterest Click ID
  "twclid", // Twitter/X Click ID
  "li_fat_id", // LinkedIn Insights Click ID
  "msclkid", // Microsoft/Bing Click ID

  // --- Email & CRM (Mailchimp, HubSpot, etc.) ---
  "mc_cid", // Mailchimp Campaign ID
  "mc_eid", // Mailchimp Email ID (unik per modtager)
  "_hsenc", // HubSpot Email Tracking
  "_hsmi", // HubSpot Marketing Email ID
  "mkt_tok", // Marketo Tracking Token
  "hnt", // Specifik tracking/referral

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

  // --- Google Ads interne parametre (brugt af Datadog, m.fl.) ---
  "igaag", // Internal Google Ads Ad Group
  "igaat", // Internal Google Ads Ad Type
  "igacm", // Internal Google Ads Campaign
  "igacr", // Internal Google Ads Creative
  "igakw", // Internal Google Ads Keyword
  "igamt", // Internal Google Ads Match Type
  "igant", // Internal Google Ads Network

  // --- (Enterprise & E-handel) ---
  "s_cid", // Adobe Analytics
  "sc_cid", // Adobe Campaign ID
  "cmpid", // Adobe/Oracle regi
  "emid", // Adobe/Oracle regi
  "elqtrackid", // Oracle Eloqua
  "elq", // Oracle Eloqua
  "pk_campaign", // Matomo standard
  "pk_kwd", // Matomo standard
  "mtm_campaign", // Matomo nyere
  "mtm_source", // Matomo nyere
  "piwik_campaign", // Ældre Matomo
  "ranmid", // Rakuten
  "raneaid", // Rakuten
  "ransiteid", // Rakuten
  "irclickid", // Impact
  "sharedid", // Impact
  "awc", // Awin
  "mkevt", // eBay
  "mkcid", // eBay
  "mkrid", // eBay
  "campid", // eBay
  "toolid", // eBay
  "customid", // eBay
  "ga_order", // Etsy
  "ga_search_query", // Etsy
  "ga_search_type", // Etsy
  "_ke", // Shopify/Klaviyo
  "shpxid", // Shopify Internal
  "_kx", // Klaviyo (Ny standard)
  "pi_id", // Salesforce/Pardot
  "picid", // Salesforce/Pardot
  "goal", // Mailchimp
  "vgo_ee", // ActiveCampaign
  "_bta_tid", // Braze
  "_bta_c", // Braze
  "rdt_cid", // Reddit
  "scid", // Snapchat
  "q_id", // Quora
  "ep_click_id", // Pinterest
  "usqp", // Google Shopping/Search
  "ved", // Google Search interne ID
  "ei", // Google Search Engine ID
  "gs_lcp", // Google Search autocomplete
  "sclient", // Google Search autocomplete
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
      const lowerKey = key.toLowerCase();
      // Vi tjekker nu for:
      // 1. Eksakte matches i vores omfattende liste
      // 2. Alle parametre der starter med "utm_" (fanger custom UTMs som utm_adgroup)
      // 3. Alle parametre der starter med "_ga_" (GA4 interne parametre)
      // 4. Alle parametre der starter med "gad_" (Google Ads nye konventioner)
      // 5. Alle parametre der starter med "hsa_" (HubSpot Ads)
      if (
        TRACKING_PARAMS.has(lowerKey) ||
        lowerKey.startsWith("utm_") ||
        lowerKey.startsWith("_ga") || // Fanger både _ga, _ga_ og _gac_
        lowerKey.startsWith("gad_") ||
        lowerKey.startsWith("hsa_") ||
        lowerKey.startsWith("_hs") || // Fanger alle HubSpot-parametre
        lowerKey.startsWith("mtm_") || // Matomo
        lowerKey.startsWith("pk_") || // Matomo/Piwik
        lowerKey.startsWith("rb_") || // Rakuten
        lowerKey.startsWith("ir") || // Impact (fanger irclickid, iradid osv.)
        lowerKey.startsWith("s_kwcid") // Adobe
      ) {
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
