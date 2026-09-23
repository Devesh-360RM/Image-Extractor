// src/lib/extractorEngine.js
import * as cheerio from "cheerio";
var PRIVATE_IP_PATTERNS = [
  /^127\./,
  // Loopback 127.0.0.0/8
  /^10\./,
  // Private 10.0.0.0/8
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  // Private 172.16.0.0/12
  /^192\.168\./,
  // Private 192.168.0.0/16
  /^169\.254\./,
  // Link-local / Cloud Metadata 169.254.0.0/16
  /^0\./,
  // Current network 0.0.0.0/8
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./,
  // Carrier-grade NAT 100.64.0.0/10
  /^::1$/,
  // IPv6 loopback
  /^fc00:/i,
  // IPv6 unique local
  /^fe80:/i
  // IPv6 link-local
];
var DISALLOWED_HOSTNAMES = /* @__PURE__ */ new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
  "instance-data",
  "169.254.169.254"
]);
function validatePublicUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { isValid: false, error: "URL must be a non-empty string." };
  }
  const trimmed = rawUrl.trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { isValid: false, error: "Invalid URL format." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { isValid: false, error: "Only public HTTP and HTTPS protocols are allowed." };
  }
  const hostname = parsed.hostname.toLowerCase();
  if (DISALLOWED_HOSTNAMES.has(hostname) || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    return { isValid: false, error: "Access to private, localhost, or internal hostnames is prohibited." };
  }
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return { isValid: false, error: "Access to private or link-local IP addresses is prohibited." };
    }
  }
  return {
    isValid: true,
    normalizedUrl: parsed.toString()
  };
}
var SECURE_FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  Pragma: "no-cache"
};
function detectPlatform(urlStr, html, $) {
  const reasons = [];
  let urlObj = null;
  try {
    urlObj = new URL(urlStr);
  } catch {
  }
  const hostname = (urlObj?.hostname || "").toLowerCase();
  const lowerHtml = html.toLowerCase();
  const generator = ($('meta[name="generator"]').attr("content") || "").toLowerCase();
  const scriptSources = [];
  $("script[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (src) scriptSources.push(src.toLowerCase());
  });
  const allScripts = scriptSources.join(" ");
  if (hostname.includes("myshopify.com") || lowerHtml.includes("window.shopify") || lowerHtml.includes("cdn.shopify.com") || allScripts.includes("cdn.shopify.com") || $('link[href*="cdn.shopify.com"]').length > 0) {
    reasons.push("Shopify CDN and JS objects detected");
    return { platform: "Shopify", confidence: 0.98, reasons };
  }
  const isWoo = lowerHtml.includes("woocommerce") || $(".woocommerce, .woocommerce-page, .woocommerce-product-gallery, .product_type_simple").length > 0 || $("form.variations_form[data-product_variations]").length > 0 || $('link[rel*="woocommerce"], script[src*="woocommerce"]').length > 0;
  const isWp = generator.includes("wordpress") || lowerHtml.includes("/wp-content/") || lowerHtml.includes("/wp-includes/") || $('link[rel="https://api.w.org/"]').length > 0;
  if (isWoo) {
    reasons.push("WooCommerce gallery, variation attributes, or plugins detected");
    return { platform: "WooCommerce", confidence: 0.95, reasons };
  }
  if (isWp) {
    reasons.push("WordPress theme assets or wp-content detected");
    return { platform: "WordPress", confidence: 0.9, reasons };
  }
  if (hostname.includes("square.site") || hostname.includes("squareup.com") || lowerHtml.includes("window.__bootstrap_state__") || lowerHtml.includes("cdn2.editmysite.com") || lowerHtml.includes("square-online")) {
    reasons.push("Square Online / Weebly bootstrap state detected");
    return { platform: "Square Online", confidence: 0.95, reasons };
  }
  if (hostname.includes("mybigcommerce.com") || lowerHtml.includes("cdn11.bigcommerce.com") || lowerHtml.includes("window.bcstorefront") || $('meta[name="platform"][content*="bigcommerce"]').length > 0 || allScripts.includes("bigcommerce")) {
    reasons.push("BigCommerce CDN and storefront scripts detected");
    return { platform: "BigCommerce", confidence: 0.95, reasons };
  }
  if (lowerHtml.includes("powered by lightspeed") || lowerHtml.includes("shoplightspeed.com") || lowerHtml.includes("lightspeed") || lowerHtml.includes("cdn.webshopapp.com") || lowerHtml.includes("seoshop") || hostname.includes("shoplightspeed.com") || hostname.includes("webshopapp.com") || allScripts.includes("webshopapp.com") || lowerHtml.includes("ec-lightspeed-branding") || $('meta[name="generator"][content*="lightspeed"]').length > 0) {
    reasons.push("Lightspeed eCom / POS branding detected");
    return { platform: "Lightspeed eCom", confidence: 0.98, reasons };
  }
  if (hostname.includes("company.site") || hostname.includes("ecwid.com") || lowerHtml.includes("app.ecwid.com") || lowerHtml.includes("ecwid-product") || allScripts.includes("ecwid.com/script.js")) {
    reasons.push("Ecwid widget or company.site domain detected");
    return { platform: "Ecwid", confidence: 0.95, reasons };
  }
  if (generator.includes("wix") || lowerHtml.includes("wix-warmup-data") || lowerHtml.includes("static.parastorage.com") || lowerHtml.includes("wixstores") || allScripts.includes("parastorage.com")) {
    reasons.push("Wix Stores platform and parastorage CDN detected");
    return { platform: "Wix Stores", confidence: 0.95, reasons };
  }
  if (generator.includes("squarespace") || lowerHtml.includes("static1.squarespace.com") || lowerHtml.includes("squarespace-commerce") || $('meta[name="squarespace-commerce"]').length > 0) {
    reasons.push("Squarespace Commerce engine detected");
    return { platform: "Squarespace Commerce", confidence: 0.95, reasons };
  }
  if (lowerHtml.includes("mage/") || lowerHtml.includes("magento") || lowerHtml.includes("requirejs-config.js") && lowerHtml.includes("pub/static") || $('script[type="text/x-magento-init"]').length > 0 || $("body.catalog-product-view").length > 0) {
    reasons.push("Magento x-magento-init and catalog view classes detected");
    return { platform: "Magento / Adobe Commerce", confidence: 0.93, reasons };
  }
  if (generator.includes("prestashop") || lowerHtml.includes("prestashop") || lowerHtml.includes("var prestashop =") || $("#product-details").length > 0 && lowerHtml.includes("js/theme.js")) {
    reasons.push("PrestaShop global state and meta tags detected");
    return { platform: "PrestaShop", confidence: 0.92, reasons };
  }
  if (generator.includes("shopware") || lowerHtml.includes("shopware") || lowerHtml.includes("bundles/storefront/")) {
    reasons.push("Shopware storefront bundles detected");
    return { platform: "Shopware", confidence: 0.9, reasons };
  }
  if (generator.includes("webflow") || lowerHtml.includes("data-wf-page") || $(".w-commerce-commerceaddtocartform").length > 0) {
    reasons.push("Webflow Ecommerce cart component detected");
    return { platform: "Webflow Ecommerce", confidence: 0.92, reasons };
  }
  if (lowerHtml.includes("3dcart") || lowerHtml.includes("shift4shop") || lowerHtml.includes("assets/templates/common")) {
    reasons.push("Shift4Shop / 3dcart templates detected");
    return { platform: "Shift4Shop", confidence: 0.9, reasons };
  }
  if (hostname.includes("clover.com") || lowerHtml.includes("clover-commerce") || lowerHtml.includes("api.clover.com")) {
    reasons.push("Clover storefront or API integration detected");
    return { platform: "Clover", confidence: 0.9, reasons };
  }
  if (lowerHtml.includes("godaddy") || lowerHtml.includes("onlinestore.godaddy.com") || lowerHtml.includes("secureserver.net")) {
    reasons.push("GoDaddy Online Store platform detected");
    return { platform: "GoDaddy Online Store", confidence: 0.88, reasons };
  }
  if (lowerHtml.includes("volusion") || lowerHtml.includes("a/v/vspfiles/")) {
    reasons.push("Volusion vspfiles asset paths detected");
    return { platform: "Volusion", confidence: 0.88, reasons };
  }
  if (lowerHtml.includes("demandware.store") || lowerHtml.includes("demandware.static") || lowerHtml.includes("dw.js")) {
    reasons.push("Salesforce Commerce Cloud (Demandware) static asset domain detected");
    return { platform: "Salesforce Commerce Cloud", confidence: 0.92, reasons };
  }
  reasons.push("Generic HTML structure with Product Schema / standard gallery");
  return {
    platform: "Custom E-Commerce",
    confidence: 0.75,
    reasons
  };
}
function normalizeProtocol(url) {
  if (!url) return "";
  const trimmed = url.trim();
  if (trimmed.startsWith("//")) {
    return "https:" + trimmed;
  }
  return trimmed;
}
function getShopifyHighResImageUrl(url) {
  const normalized = normalizeProtocol(url);
  try {
    const parsed = new URL(normalized);
    if (parsed.hostname.includes("cdn.shopify.com") || parsed.hostname.includes("myshopify.com")) {
      const cleanPath = parsed.pathname.replace(
        /_(small|medium|large|compact|grande|1024x1024|2048x2048|\d+x\d*|master)(_crop_(?:center|top|bottom|left|right))?(\.[a-zA-Z0-9]+)$/i,
        "$3"
      );
      parsed.pathname = cleanPath;
      parsed.searchParams.delete("width");
      parsed.searchParams.delete("height");
      parsed.searchParams.delete("crop");
      parsed.searchParams.delete("max_width");
      parsed.searchParams.delete("max_height");
      return parsed.toString();
    }
  } catch {
  }
  return normalized;
}
function cleanWordPressImageUrl(url) {
  const normalized = normalizeProtocol(url);
  try {
    const parsed = new URL(normalized);
    if (parsed.pathname.includes("/wp-content/uploads/")) {
      const cleanPath = parsed.pathname.replace(/-\d+x\d+(\.[a-zA-Z0-9]+)$/i, "$1");
      parsed.pathname = cleanPath;
      return parsed.toString();
    }
  } catch {
  }
  return normalized;
}
function getLargestFromSrcset(srcset, baseUrl) {
  if (!srcset) return null;
  const entries = srcset.split(",").map((s) => s.trim()).filter(Boolean);
  let largestUrl = null;
  let maxDescriptor = 0;
  for (const entry of entries) {
    const parts = entry.split(/\s+/);
    const rawUrl = parts[0];
    const descriptor = parts[1] || "";
    let score = 1;
    if (descriptor.endsWith("w")) {
      score = parseInt(descriptor.replace("w", ""), 10) || 1;
    } else if (descriptor.endsWith("x")) {
      score = (parseFloat(descriptor.replace("x", "")) || 1) * 1e3;
    }
    if (score >= maxDescriptor && rawUrl) {
      maxDescriptor = score;
      try {
        largestUrl = new URL(normalizeProtocol(rawUrl), baseUrl).toString();
      } catch {
        largestUrl = rawUrl;
      }
    }
  }
  return largestUrl;
}
function parseShopifyProductUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl.trim());
    const pathname = parsed.pathname;
    const match = pathname.match(/\/products\/([^\/\?#]+)/);
    if (match && match[1]) {
      const handle = match[1].replace(/\.(js|json)$/, "");
      return {
        isShopifyProduct: true,
        origin: parsed.origin,
        handle,
        jsonUrl: `${parsed.origin}/products/${handle}.js`,
        jsonAltUrl: `${parsed.origin}/products/${handle}.json`
      };
    }
  } catch {
  }
  return {
    isShopifyProduct: false,
    jsonUrl: null,
    jsonAltUrl: null,
    origin: null,
    handle: null
  };
}
function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, "").trim();
}
function cleanStoreNameString(raw) {
  if (!raw || typeof raw !== "string") return "";
  let s = raw.trim();
  const copyrightMatch = s.match(/(?:©|\bcopyright\b|&copy;|\(c\))\s*(?:\d{4}(?:\s*[-–]\s*\d{4})?)?\s*,?\s*([^.,\n\r|•–—<>{}\[\]]+)/i);
  if (copyrightMatch && copyrightMatch[1]) {
    s = copyrightMatch[1].trim();
  }
  s = s.replace(/report\s*abuse.*$/i, "");
  s = s.replace(/\breport\s*abuse\b/gi, "");
  s = s.replace(/powered\s*by.*$/i, "");
  s = s.replace(/all\s*rights\s*reserved.*$/i, "");
  s = s.replace(/(?:©|\bcopyright\b|&copy;|\(c\))\s*(?:\d{4}(?:\s*[-–]\s*\d{4})?)?/gi, "");
  s = s.replace(/\b(Inc|LLC|Ltd|Corp|Co)\.?\b/gi, "");
  s = s.replace(/[|•–—].*$/, "");
  s = s.replace(/^[,.\s\-–—:|]+|[,.\s\-–—:|]+$/g, "");
  return s.trim();
}
var FORBIDDEN_STORE_WORDS = /* @__PURE__ */ new Set([
  "categories",
  "category",
  "support",
  "customer support",
  "customer service",
  "information",
  "info",
  "quick links",
  "links",
  "explore",
  "company",
  "about us",
  "about",
  "follow us",
  "shop all",
  "contact us",
  "contact",
  "help",
  "faqs",
  "faq",
  "legal",
  "resources",
  "newsletter",
  "stay in touch",
  "sign up",
  "connect",
  "account",
  "my account",
  "orders",
  "navigation",
  "nav",
  "pages",
  "collections",
  "collection",
  "featured",
  "policies",
  "policy",
  "terms",
  "terms of service",
  "privacy",
  "privacy policy",
  "accessibility",
  "shipping",
  "returns",
  "size guide",
  "track order",
  "store locator",
  "locations",
  "gift cards",
  "rewards",
  "our story",
  "careers",
  "blog",
  "press",
  "affiliates",
  "sitemap",
  "search",
  "menu",
  "cart",
  "bag",
  "checkout",
  "home",
  "shop",
  "products",
  "product",
  "catalog",
  "services",
  "overview",
  "view all",
  "details",
  "description",
  "reviews",
  "ratings",
  "share",
  "subscribe",
  "footer",
  "header",
  "main",
  "sidebar",
  "filter",
  "sort by",
  "price",
  "brand",
  "brands",
  "vendor",
  "vendors",
  "size",
  "sizes",
  "color",
  "colors",
  "shopify",
  "woocommerce",
  "squarespace",
  "wix",
  "wordpress",
  "lightspeed",
  "ecwid",
  "magento",
  "bigcommerce",
  "weebly",
  "square",
  "clover",
  "toast",
  "report abuse",
  "all rights reserved",
  "powered by",
  "untitled",
  "null",
  "undefined",
  "image",
  "photo",
  "item",
  "items",
  "loading",
  "close",
  "open",
  "back",
  "next",
  "previous"
]);
function isValidStoreName(candidate) {
  if (!candidate || typeof candidate !== "string") return false;
  const cleaned = cleanStoreNameString(candidate);
  if (cleaned.length < 2 || cleaned.length > 60) return false;
  if (/^\d+$/.test(cleaned)) return false;
  if (/oklch|rgba?|hsla?|var\(|[;{}:@\\]|--|\bpx\b|\brem\b|calc\(|!important/i.test(cleaned)) return false;
  if (/^[-_=+*/.,;:)\]}>#@!%&|]/.test(cleaned)) return false;
  const lower = cleaned.toLowerCase();
  if (FORBIDDEN_STORE_WORDS.has(lower)) return false;
  if (/^(powered by|report abuse|all rights reserved|designed by|built with|theme by)/i.test(cleaned)) return false;
  if (!/[a-zA-Z]/.test(cleaned)) return false;
  return true;
}
function extractStoreName($, url, rawHtml) {
  let $clean = null;
  if ($) {
    try {
      $clean = cheerio.load($.html());
      $clean("script, style, noscript, svg, template, iframe, link, a[href*='abuse'], a[href*='report'], [class*='abuse'], [class*='report']").remove();
    } catch {
      $clean = $;
    }
  } else if (rawHtml) {
    try {
      $clean = cheerio.load(rawHtml);
      $clean("script, style, noscript, svg, template, iframe, link, a[href*='abuse'], a[href*='report'], [class*='abuse'], [class*='report']").remove();
    } catch {
    }
  }
  if ($) {
    const ogSiteName = cleanStoreNameString($('meta[property="og:site_name"]').attr("content") || $('meta[name="og:site_name"]').attr("content") || "");
    if (ogSiteName && isValidStoreName(ogSiteName)) {
      return sanitizeFilename(ogSiteName);
    }
    const appName = cleanStoreNameString($('meta[name="application-name"]').attr("content") || $('meta[name="apple-mobile-web-app-title"]').attr("content") || "");
    if (appName && isValidStoreName(appName)) {
      return sanitizeFilename(appName);
    }
    const ogBrand = cleanStoreNameString($('meta[property="og:brand"]').attr("content") || $('meta[name="author"]').attr("content") || "");
    if (ogBrand && isValidStoreName(ogBrand)) {
      return sanitizeFilename(ogBrand);
    }
  }
  if ($) {
    try {
      let ldStoreName = "";
      $('script[type="application/ld+json"]').each((_, el) => {
        const text = $(el).html()?.trim();
        if (!text) return;
        try {
          const parsed = JSON.parse(text);
          const items = Array.isArray(parsed) ? parsed : [parsed];
          for (const item of items) {
            if (item["@type"] === "Organization" || item["@type"] === "Store" || item["@type"] === "LocalBusiness" || item["@type"] === "WebSite" || item["@type"] === "Brand") {
              const nameCand = cleanStoreNameString(item.name || item.legalName || "");
              if (nameCand && isValidStoreName(nameCand)) {
                ldStoreName = nameCand;
                return false;
              }
            }
            if (item["@type"] === "Product" && item.brand) {
              const bName = cleanStoreNameString(typeof item.brand === "string" ? item.brand : item.brand?.name || "");
              if (bName && isValidStoreName(bName)) {
                ldStoreName = bName;
              }
            }
          }
        } catch {
        }
      });
      if (ldStoreName && isValidStoreName(ldStoreName)) return sanitizeFilename(ldStoreName);
    } catch {
    }
  }
  if ($clean) {
    try {
      const copyrightSelectors = [
        'footer [class*="copyright"]',
        'footer [class*="footer-bottom"]',
        'footer [class*="site-footer__copyright"]',
        'footer [class*="footer__copyright"]',
        'footer [class*="bottom-bar"]',
        'footer [class*="legal"]',
        '[class*="footer-copyright"]',
        '[class*="copyright"]',
        'small[class*="copyright"]',
        'p[class*="copyright"]',
        "footer small",
        "footer p"
      ];
      for (const sel of copyrightSelectors) {
        const els = $clean(sel);
        for (let i = 0; i < els.length; i++) {
          const elText = $clean(els[i]).text().trim();
          if (/©|copyright|&copy;|\(c\)/i.test(elText)) {
            const parsedName = cleanStoreNameString(elText);
            if (isValidStoreName(parsedName)) {
              return sanitizeFilename(parsedName);
            }
          }
        }
      }
      const footerBrandLinks = $clean('footer a[href="/"], footer [class*="copyright"] a, footer [class*="brand"] a, footer [class*="logo"] a');
      for (let i = 0; i < footerBrandLinks.length; i++) {
        const linkText = cleanStoreNameString($clean(footerBrandLinks[i]).text());
        if (isValidStoreName(linkText)) {
          return sanitizeFilename(linkText);
        }
      }
    } catch {
    }
  }
  if ($clean) {
    try {
      const headerTextEl = $clean('header .header__heading-link, header .site-header__logo-link, header [class*="logo-text"], header h1 a, header a.logo, header .site-title, header .brand, .navbar-brand').first();
      const headerText = cleanStoreNameString(headerTextEl.text());
      if (isValidStoreName(headerText)) {
        return sanitizeFilename(headerText);
      }
      if ($) {
        const headerLogoImg = $('header img[alt], .site-header img[alt], .header__heading-logo img[alt], [class*="header"] [class*="logo"] img[alt], a[href="/"] img[alt]').first();
        const logoAlt = cleanStoreNameString(headerLogoImg.attr("alt") || "");
        if (logoAlt && isValidStoreName(logoAlt) && !/^(logo|icon|image|photo|graphic|store logo|site logo)$/i.test(logoAlt)) {
          return sanitizeFilename(logoAlt);
        }
      }
    } catch {
    }
  }
  if ($) {
    try {
      const fullTitle = $("title").text().trim();
      if (fullTitle) {
        const delims = [" \u2013 ", " \u2014 ", " | ", " \u2022 ", " - "];
        for (const delim of delims) {
          if (fullTitle.includes(delim)) {
            const parts = fullTitle.split(delim);
            const lastPart = cleanStoreNameString(parts[parts.length - 1]);
            if (isValidStoreName(lastPart) && !/^(page\s*\d+|official site|shop|products?|home|online boutique|boutique|store)$/i.test(lastPart)) {
              return sanitizeFilename(lastPart);
            }
            const firstPart = cleanStoreNameString(parts[0]);
            if (isValidStoreName(firstPart) && parts.length > 1 && /^(welcome to|home of)/i.test(firstPart)) {
              return sanitizeFilename(firstPart.replace(/^(welcome to|home of)\s*/i, ""));
            }
          }
        }
      }
    } catch {
    }
  }
  try {
    const parsed = new URL(normalizeProtocol(url));
    let host = parsed.hostname.replace(/^www\./i, "");
    host = host.replace(/\.myshopify\.com$/i, "");
    host = host.replace(/\.square\.site$/i, "");
    host = host.replace(/\.company\.site$/i, "");
    host = host.replace(/\.shoplightspeed\.com$/i, "");
    host = host.replace(/\.webshopapp\.com$/i, "");
    host = host.replace(/\.com(\.[a-z]{2})?$|\.org$|\.net$|\.co(\.[a-z]{2})?$|\.io$|\.store$|\.shop$/i, "");
    const parts = host.split(".").filter(Boolean);
    const mainName = parts.length > 1 && parts[0] === "shop" ? parts[1] : parts[0];
    const formatted = mainName.replace(/[-_]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
    const result = formatted.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    if (isValidStoreName(result)) return result;
  } catch {
  }
  return "Store";
}
function getCanonicalUrlKey(url) {
  try {
    const parsed = new URL(normalizeProtocol(url));
    return `${parsed.hostname}${parsed.pathname}`.toLowerCase();
  } catch {
    return url.toLowerCase().split("?")[0];
  }
}
function isNonProductGraphic(url, contextText = "") {
  const lowerUrl = url.toLowerCase();
  const lowerCtx = contextText.toLowerCase();
  const blocked = [
    "logo",
    "banner",
    "header",
    "footer",
    "icon",
    "badge",
    "social",
    "facebook",
    "instagram",
    "twitter",
    "pinterest",
    "tiktok",
    "cart",
    "payment",
    "trustpilot",
    "visa",
    "mastercard",
    "paypal",
    "amex",
    "applepay",
    "googlepay",
    "star-rating",
    "star.svg",
    "menu",
    "arrow",
    "avatar",
    "spinner",
    "loading",
    "favicon",
    "swatch",
    "placeholder",
    "1x1",
    "pixel",
    "spacer"
  ];
  if (lowerUrl.endsWith(".svg")) return true;
  return blocked.some((b) => lowerUrl.includes(b) || lowerCtx.includes(b));
}
function extractShopifyImages(shopifyData, originalPageUrl, storeNameOverride) {
  const storeName = storeNameOverride || extractStoreName(null, originalPageUrl);
  const cleanStore = sanitizeFilename(storeName || "Store");
  const title = shopifyData.title || "Product";
  const cleanProd = sanitizeFilename(title);
  const candidates = [];
  const seenCanonicalUrls = /* @__PURE__ */ new Set();
  const variantsList = [];
  const addCandidate = (rawUrl, variantName, type) => {
    if (!rawUrl || typeof rawUrl !== "string") return;
    const httpsUrl = normalizeProtocol(rawUrl);
    if (!httpsUrl || httpsUrl.startsWith("data:") || isNonProductGraphic(httpsUrl)) return;
    const highResUrl = getShopifyHighResImageUrl(httpsUrl);
    const key = getCanonicalUrlKey(highResUrl);
    if (seenCanonicalUrls.has(key)) return;
    seenCanonicalUrls.add(key);
    const index = candidates.length + 1;
    const cleanVar = variantName && variantName !== "General" && variantName !== "Default" ? ` - ${sanitizeFilename(variantName)}` : "";
    const filename = `${cleanStore} - ${cleanProd}${cleanVar} - ${String(index).padStart(2, "0")}.jpg`;
    candidates.push({
      id: `img-shopify-${index}`,
      url: highResUrl,
      originalUrl: httpsUrl,
      variant: variantName || "General",
      type,
      filename,
      resolution: "Highest Available (Shopify CDN Master)"
    });
  };
  if (shopifyData.featured_image) {
    const featUrl = typeof shopifyData.featured_image === "string" ? shopifyData.featured_image : shopifyData.featured_image.src || shopifyData.featured_image.url;
    addCandidate(featUrl, "Default", "Main");
  }
  if (Array.isArray(shopifyData.variants)) {
    for (const v of shopifyData.variants) {
      const vTitle = v.title && v.title !== "Default Title" ? String(v.title) : "Variant";
      if (vTitle && !variantsList.includes(vTitle) && vTitle !== "Variant") {
        variantsList.push(vTitle);
      }
      let vImgUrl = null;
      if (v.featured_image) {
        vImgUrl = typeof v.featured_image === "string" ? v.featured_image : v.featured_image.src;
      } else if (v.image) {
        vImgUrl = typeof v.image === "string" ? v.image : v.image.src;
      }
      if (vImgUrl) {
        addCandidate(vImgUrl, vTitle, "Variant");
      }
    }
  }
  if (Array.isArray(shopifyData.images)) {
    for (const img of shopifyData.images) {
      const imgUrl = typeof img === "string" ? img : img?.src || img?.url;
      addCandidate(imgUrl, "General", candidates.length === 0 ? "Main" : "Gallery");
    }
  }
  return {
    id: `prod-shopify-${Date.now()}`,
    name: title,
    storeName,
    url: originalPageUrl,
    platform: "Shopify",
    confidence: 0.98,
    images: candidates,
    variants: variantsList
  };
}
function extractWooCommerceImages($, baseUrl, html) {
  const storeName = extractStoreName($, baseUrl);
  const cleanStore = sanitizeFilename(storeName || "Store");
  let title = $("h1.product_title, .woocommerce-products-header__title").first().text().trim() || $('meta[property="og:title"]').attr("content") || $("h1").first().text().trim() || "WooCommerce Product";
  if (title.includes("|")) title = title.split("|")[0].trim();
  if (title.includes(" - ")) title = title.split(" - ")[0].trim();
  const cleanProd = sanitizeFilename(title);
  const candidates = [];
  const seenCanonicalUrls = /* @__PURE__ */ new Set();
  const variantsList = [];
  const addCandidate = (rawUrl, variantName, type) => {
    if (!rawUrl || typeof rawUrl !== "string") return;
    const trimmed = rawUrl.trim();
    if (!trimmed || trimmed.startsWith("data:") || isNonProductGraphic(trimmed, variantName)) return;
    try {
      const resolved = new URL(normalizeProtocol(trimmed), baseUrl).toString();
      const highRes = cleanWordPressImageUrl(resolved);
      const key = getCanonicalUrlKey(highRes);
      if (seenCanonicalUrls.has(key)) return;
      seenCanonicalUrls.add(key);
      const index = candidates.length + 1;
      const cleanVar = variantName && variantName !== "General" && variantName !== "Default" ? ` - ${sanitizeFilename(variantName)}` : "";
      const filename = `${cleanStore} - ${cleanProd}${cleanVar} - ${String(index).padStart(2, "0")}.jpg`;
      candidates.push({
        id: `img-woo-${index}`,
        url: highRes,
        originalUrl: resolved,
        variant: variantName || "General",
        type: candidates.length === 0 ? "Main" : type,
        filename,
        resolution: "Full-size WordPress Attachment"
      });
    } catch {
    }
  };
  const varForm = $("form.variations_form");
  if (varForm.length > 0) {
    const rawVariations = varForm.attr("data-product_variations");
    if (rawVariations) {
      try {
        const parsedVars = JSON.parse(rawVariations);
        if (Array.isArray(parsedVars)) {
          for (const item of parsedVars) {
            let varTitle = "Variant";
            if (item.attributes) {
              const attrValues = Object.values(item.attributes).filter(Boolean);
              if (attrValues.length > 0) varTitle = attrValues.join(" / ");
            }
            if (!variantsList.includes(varTitle) && varTitle !== "Variant") {
              variantsList.push(varTitle);
            }
            const imgObj = item.image;
            if (imgObj) {
              const fullSrc = imgObj.full_src || imgObj.url || imgObj.src;
              if (fullSrc) {
                addCandidate(fullSrc, varTitle, "Variant");
              }
            }
          }
        }
      } catch {
      }
    }
  }
  $(".woocommerce-product-gallery__image").each((_, el) => {
    const $el = $(el);
    const $link = $el.find("a").first();
    const $img = $el.find("img").first();
    const fullSize = $link.attr("href") || $img.attr("data-large_image") || $img.attr("data-src") || $img.attr("data-lazy-src");
    const alt = $img.attr("alt")?.trim() || "";
    if (fullSize) {
      addCandidate(fullSize, alt || "Gallery", candidates.length === 0 ? "Main" : "Gallery");
    } else {
      const srcset = $img.attr("srcset");
      const fromSrcset = srcset ? getLargestFromSrcset(srcset, baseUrl) : null;
      if (fromSrcset) {
        addCandidate(fromSrcset, alt || "Gallery", "Gallery");
      } else {
        const src = $img.attr("src");
        if (src) addCandidate(src, alt || "Gallery", "Gallery");
      }
    }
  });
  $("img.wp-post-image").each((_, el) => {
    const $img = $(el);
    const large = $img.attr("data-large_image") || $img.attr("src");
    addCandidate(large, "Main", "Main");
  });
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || "{}");
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) {
        if (item["@type"] === "Product" || item.type === "Product") {
          if (Array.isArray(item.image)) {
            item.image.forEach((img) => {
              const u = typeof img === "string" ? img : img?.url || img?.contentUrl;
              addCandidate(u, "General", "Gallery");
            });
          } else if (typeof item.image === "string") {
            addCandidate(item.image, "Default", "Main");
          }
        }
      }
    } catch {
    }
  });
  if (candidates.length === 0) {
    const ogImg = $('meta[property="og:image"]').attr("content") || $('meta[name="twitter:image"]').attr("content");
    if (ogImg) {
      addCandidate(ogImg, "Main", "Main");
    }
    $('img[src*="/wp-content/uploads/"]').each((_, el) => {
      const src = $(el).attr("data-large_image") || $(el).attr("data-src") || $(el).attr("src");
      if (src && !src.includes("logo") && !src.includes("icon") && !src.includes("avatar")) {
        addCandidate(src, "General", candidates.length === 0 ? "Main" : "Gallery");
      }
    });
    if (candidates.length === 0) {
      const fallback = extractGenericPlatformImages($, baseUrl, "WooCommerce", 0.9);
      if (fallback.images.length > 0) {
        return fallback;
      }
    }
  }
  return {
    id: `prod-woo-${Date.now()}`,
    name: title,
    storeName,
    url: baseUrl,
    platform: "WooCommerce",
    confidence: 0.95,
    images: candidates,
    variants: variantsList
  };
}
function extractGenericPlatformImages($, baseUrl, platform, confidence) {
  const storeName = extractStoreName($, baseUrl);
  const cleanStore = sanitizeFilename(storeName || "Store");
  let title = $('meta[property="og:title"]').attr("content") || $('meta[name="twitter:title"]').attr("content") || $("h1").first().text().trim() || $("title").text().trim() || "Product";
  if (title.includes("|")) title = title.split("|")[0].trim();
  if (title.includes(" - ")) title = title.split(" - ")[0].trim();
  const cleanProd = sanitizeFilename(title);
  const candidates = [];
  const seenCanonicalUrls = /* @__PURE__ */ new Set();
  const variantsList = [];
  const addCandidate = (rawUrl, variantName, type) => {
    if (!rawUrl || typeof rawUrl !== "string") return;
    const trimmed = rawUrl.trim();
    if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("javascript:")) return;
    if (isNonProductGraphic(trimmed, variantName)) return;
    try {
      const resolved = new URL(normalizeProtocol(trimmed), baseUrl).toString();
      let finalUrl = resolved;
      if (platform === "Shopify" || resolved.includes("cdn.shopify.com")) {
        finalUrl = getShopifyHighResImageUrl(resolved);
      } else if (platform === "WooCommerce" || platform === "WordPress" || resolved.includes("/wp-content/")) {
        finalUrl = cleanWordPressImageUrl(resolved);
      } else if (resolved.includes("editmysite.com")) {
        const u = new URL(resolved);
        u.searchParams.delete("width");
        finalUrl = u.toString();
      }
      const key = getCanonicalUrlKey(finalUrl);
      if (seenCanonicalUrls.has(key)) return;
      seenCanonicalUrls.add(key);
      const index = candidates.length + 1;
      const cleanVar = variantName && variantName !== "General" && variantName !== "Default" ? ` - ${sanitizeFilename(variantName)}` : "";
      const filename = `${cleanStore} - ${cleanProd}${cleanVar} - ${String(index).padStart(2, "0")}.jpg`;
      candidates.push({
        id: `img-${index}`,
        url: finalUrl,
        originalUrl: resolved,
        variant: variantName || "General",
        type: candidates.length === 0 ? "Main" : type,
        filename,
        resolution: "Master / High Resolution"
      });
    } catch {
    }
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || "{}");
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) {
        if (item["@type"] === "Product" || item.type === "Product") {
          if (item.name && (!title || title === "Product")) title = item.name;
          if (Array.isArray(item.image)) {
            item.image.forEach((img) => {
              const u = typeof img === "string" ? img : img?.url || img?.contentUrl;
              addCandidate(u, "General", "Gallery");
            });
          } else if (typeof item.image === "string") {
            addCandidate(item.image, "Default", "Main");
          } else if (item.image?.url || item.image?.contentUrl) {
            addCandidate(item.image.url || item.image.contentUrl, "Default", "Main");
          }
        }
      }
    } catch {
    }
  });
  $("script").each((_, el) => {
    const text = $(el).html()?.trim();
    if (!text) return;
    const typeAttr = ($(el).attr("type") || "").toLowerCase();
    const idAttr = ($(el).attr("id") || "").toLowerCase();
    if (typeAttr.includes("json") || idAttr.includes("product") || idAttr.includes("next")) {
      try {
        const parsed = JSON.parse(text);
        if (parsed) {
          const stack = [parsed];
          let depth = 0;
          while (stack.length > 0 && depth < 50) {
            const curr = stack.pop();
            depth++;
            if (!curr || typeof curr !== "object") continue;
            if (curr.images && Array.isArray(curr.images)) {
              for (const img of curr.images) {
                const u = typeof img === "string" ? img : img?.src || img?.url;
                addCandidate(u, "General", "Gallery");
              }
            }
            if (curr.featured_image) {
              const u = typeof curr.featured_image === "string" ? curr.featured_image : curr.featured_image?.src || curr.featured_image?.url;
              addCandidate(u, "Default", "Main");
            }
            if (Array.isArray(curr.variants)) {
              for (const v of curr.variants) {
                const vTitle = v.title && v.title !== "Default Title" ? String(v.title) : "Variant";
                if (vTitle && !variantsList.includes(vTitle) && vTitle !== "Variant") variantsList.push(vTitle);
                const vImg = v.featured_image ? typeof v.featured_image === "string" ? v.featured_image : v.featured_image?.src : v.image ? typeof v.image === "string" ? v.image : v.image?.src : null;
                if (vImg) addCandidate(vImg, vTitle, "Variant");
              }
            }
            for (const key of Object.keys(curr)) {
              if (["product", "pageProps", "props", "initialState", "data", "store"].includes(key) && curr[key] && typeof curr[key] === "object") {
                stack.push(curr[key]);
              }
            }
          }
        }
      } catch {
      }
    }
    if (text.includes("cdn.shopify.com") || text.includes("paige.com")) {
      const matches = text.match(/https?:\/\/(?:cdn\.shopify\.com|paige\.com)\/s\/files\/[^\s"'\\,<>]+\.(?:jpg|jpeg|png|webp)/gi);
      if (matches) {
        for (const m of matches) {
          addCandidate(m, "General", "Gallery");
        }
      }
    }
  });
  const ogImage = $('meta[property="og:image"]').attr("content") || $('meta[property="og:image:secure_url"]').attr("content");
  if (ogImage) addCandidate(ogImage, "Default", "Main");
  const twitterImage = $('meta[name="twitter:image"]').attr("content");
  if (twitterImage) addCandidate(twitterImage, "Default", "Gallery");
  $("img, source").each((_, el) => {
    const $el = $(el);
    const highRes = $el.attr("data-zoom-image") || $el.attr("data-large_image") || $el.attr("data-high-res") || $el.attr("data-master") || $el.attr("data-large") || $el.attr("data-original") || $el.attr("data-src") || $el.attr("data-lazy-src");
    const alt = $el.attr("alt")?.trim() || "";
    if (highRes) {
      addCandidate(highRes, alt || "Gallery", "Gallery");
    }
    const srcset = $el.attr("srcset") || $el.attr("data-srcset");
    if (srcset) {
      const largest = getLargestFromSrcset(srcset, baseUrl);
      if (largest) addCandidate(largest, alt || "Gallery", "Gallery");
    }
    const src = $el.attr("src");
    if (src) addCandidate(src, alt || "Gallery", "Gallery");
  });
  $("[data-image], .product-image, .gallery-item, .zoomWindow").each((_, el) => {
    const style = $(el).attr("style") || "";
    const bgMatch = style.match(/url\(['"]?(.*?)['"]?\)/);
    if (bgMatch && bgMatch[1]) {
      addCandidate(bgMatch[1], "Gallery", "Gallery");
    }
  });
  return {
    id: `prod-${Date.now()}`,
    name: title,
    storeName,
    url: baseUrl,
    platform,
    confidence,
    images: candidates,
    variants: variantsList
  };
}
function discoverProductLinks($, baseUrl) {
  const discovered = [];
  const seen = /* @__PURE__ */ new Set();
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || "{}");
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) {
        if (item["@type"] === "ItemList" && Array.isArray(item.itemListElement)) {
          for (const listItem of item.itemListElement) {
            const itemUrl = listItem.url || listItem.item?.url;
            const itemName = listItem.name || listItem.item?.name;
            if (itemUrl && typeof itemUrl === "string") {
              const full = new URL(itemUrl, baseUrl).toString();
              if (!seen.has(full)) {
                seen.add(full);
                discovered.push({ url: full, name: itemName });
              }
            }
          }
        }
      }
    } catch {
    }
  });
  const productCardSelectors = [
    "a.woocommerce-LoopProduct-link",
    "li.product a",
    ".product-card a",
    ".product-item a",
    ".grid-product__link",
    ".product-grid-item a",
    'a[href*="/product/"]',
    'a[href*="/products/"]',
    'a[href*="/item/"]',
    'a[href*="/p/"]'
  ];
  $(productCardSelectors.join(", ")).each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const resolved = new URL(href, baseUrl).toString();
      const lower = resolved.toLowerCase();
      if (lower === baseUrl.toLowerCase() || lower.includes("/collections/") && !lower.includes("/products/") || lower.includes("/category/") && !lower.includes("/product/") || lower.includes("cart") || lower.includes("checkout") || lower.includes("account") || lower.includes("#") || seen.has(resolved)) {
        return;
      }
      seen.add(resolved);
      const name = $(el).text().trim() || $(el).find("img").attr("alt")?.trim() || void 0;
      discovered.push({ url: resolved, name });
    } catch {
    }
  });
  return discovered;
}
async function fetchWaybackSnapshotProduct(cleanUrl) {
  try {
    const wbApiUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(cleanUrl)}`;
    const res = await fetch(wbApiUrl, { headers: SECURE_FETCH_HEADERS });
    if (!res.ok) return null;
    const json = await res.json();
    const snapshotUrl = json?.archived_snapshots?.closest?.url;
    if (!snapshotUrl) return null;
    const snapRes = await fetch(snapshotUrl, { headers: SECURE_FETCH_HEADERS });
    if (!snapRes.ok) return null;
    const html = await snapRes.text();
    const $ = cheerio.load(html);
    const detection = detectPlatform(cleanUrl, html, $);
    let product;
    if (detection.platform === "WooCommerce") {
      product = extractWooCommerceImages($, cleanUrl, html);
    } else {
      product = extractGenericPlatformImages($, cleanUrl, detection.platform, detection.confidence);
    }
    if (product && product.images.length > 0) {
      return product;
    }
  } catch {
  }
  return null;
}
async function extractProductFromUrl(targetUrl) {
  const validation = validatePublicUrl(targetUrl);
  if (!validation.isValid || !validation.normalizedUrl) {
    return {
      success: false,
      error: validation.error || "Invalid public URL provided.",
      statusCode: 400
    };
  }
  const cleanUrl = validation.normalizedUrl;
  try {
    const shopifyInfo = parseShopifyProductUrl(cleanUrl);
    if (shopifyInfo.isShopifyProduct && shopifyInfo.jsonUrl) {
      const jsonEndpoints = [shopifyInfo.jsonUrl, shopifyInfo.jsonAltUrl].filter(Boolean);
      for (const endpoint of jsonEndpoints) {
        try {
          const controller2 = new AbortController();
          const timer2 = setTimeout(() => controller2.abort(), 6e3);
          const shopifyRes = await fetch(endpoint, {
            headers: SECURE_FETCH_HEADERS,
            signal: controller2.signal
          });
          clearTimeout(timer2);
          if (shopifyRes.ok) {
            const contentType = shopifyRes.headers.get("content-type") || "";
            if (contentType.includes("json") || contentType.includes("javascript")) {
              const rawData = await shopifyRes.json();
              const data = rawData.product || rawData;
              if (data && (data.title || data.images || data.featured_image)) {
                let storeName;
                try {
                  const pageRes = await fetch(cleanUrl, { headers: SECURE_FETCH_HEADERS });
                  if (pageRes.ok) {
                    const pageHtml = await pageRes.text();
                    const $page = cheerio.load(pageHtml);
                    storeName = extractStoreName($page, cleanUrl, pageHtml);
                  }
                } catch (_) {
                }
                const product2 = extractShopifyImages(data, cleanUrl, storeName);
                if (product2.images.length > 0) {
                  return {
                    success: true,
                    product: product2,
                    platform: "Shopify",
                    confidence: 0.98
                  };
                }
              }
            }
          }
        } catch {
        }
      }
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8e3);
    const htmlRes = await fetch(cleanUrl, {
      headers: SECURE_FETCH_HEADERS,
      signal: controller.signal
    });
    clearTimeout(timer);
    let html = "";
    let isWafBlocked = false;
    if (!htmlRes.ok || htmlRes.status === 429 || htmlRes.status === 403 || htmlRes.status === 503) {
      isWafBlocked = true;
    } else {
      html = await htmlRes.text();
      if (html.includes("Vercel Security Checkpoint") || html.includes("Cloudflare") && html.includes("Attention Required") || html.includes("Just a moment...")) {
        isWafBlocked = true;
      }
    }
    if (isWafBlocked) {
      const waybackProduct = await fetchWaybackSnapshotProduct(cleanUrl);
      if (waybackProduct && waybackProduct.images.length > 0) {
        return {
          success: true,
          product: waybackProduct,
          platform: waybackProduct.images[0]?.filename?.includes("shopify") ? "Shopify" : "Custom E-Commerce",
          confidence: 0.95
        };
      }
      return {
        success: false,
        error: `Target store (${new URL(cleanUrl).hostname}) is protected by Vercel/Cloudflare Security Checkpoint. Please paste the page HTML or use HTML Import below.`,
        statusCode: 429
      };
    }
    const $ = cheerio.load(html);
    const detection = detectPlatform(cleanUrl, html, $);
    let product;
    if (detection.platform === "WooCommerce") {
      product = extractWooCommerceImages($, cleanUrl, html);
    } else {
      product = extractGenericPlatformImages($, cleanUrl, detection.platform, detection.confidence);
    }
    if (product.images.length === 0) {
      const waybackProduct = await fetchWaybackSnapshotProduct(cleanUrl);
      if (waybackProduct && waybackProduct.images.length > 0) {
        return {
          success: true,
          product: waybackProduct,
          platform: detection.platform,
          confidence: 0.9
        };
      }
      return {
        success: false,
        platform: detection.platform,
        confidence: detection.confidence,
        error: `No high-resolution product images found on this ${detection.platform} page.`,
        statusCode: 422
      };
    }
    return {
      success: true,
      product,
      platform: detection.platform,
      confidence: detection.confidence
    };
  } catch (err) {
    const isTimeout = err.name === "AbortError" || err.message?.includes("aborted");
    try {
      const waybackProduct = await fetchWaybackSnapshotProduct(cleanUrl);
      if (waybackProduct && waybackProduct.images.length > 0) {
        return {
          success: true,
          product: waybackProduct,
          platform: "Custom E-Commerce",
          confidence: 0.9
        };
      }
    } catch {
    }
    return {
      success: false,
      error: isTimeout ? "Request timed out while connecting to the store." : `Extraction error: ${err.message || "Unknown error"}`,
      statusCode: isTimeout ? 504 : 500
    };
  }
}
async function extractCollectionFromUrl(collectionUrl, maxProducts = 24) {
  const validation = validatePublicUrl(collectionUrl);
  if (!validation.isValid || !validation.normalizedUrl) {
    return {
      success: false,
      platform: "Custom E-Commerce",
      confidence: 0,
      products: [],
      stats: { successful: 0, failed: 0, skipped: 0, totalDiscovered: 0 },
      error: validation.error || "Invalid URL"
    };
  }
  const cleanUrl = validation.normalizedUrl;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8e3);
    const res = await fetch(cleanUrl, {
      headers: SECURE_FETCH_HEADERS,
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) {
      return {
        success: false,
        platform: "Custom E-Commerce",
        confidence: 0,
        products: [],
        stats: { successful: 0, failed: 0, skipped: 0, totalDiscovered: 0 },
        error: `HTTP ${res.status} from collection page`
      };
    }
    const html = await res.text();
    const $ = cheerio.load(html);
    const detection = detectPlatform(cleanUrl, html, $);
    const discovered = discoverProductLinks($, cleanUrl).slice(0, maxProducts);
    if (discovered.length === 0) {
      const single = await extractProductFromUrl(cleanUrl);
      if (single.success && single.product) {
        return {
          success: true,
          platform: single.platform || detection.platform,
          confidence: single.confidence || detection.confidence,
          products: [single.product],
          stats: { successful: 1, failed: 0, skipped: 0, totalDiscovered: 1 }
        };
      }
      return {
        success: false,
        platform: detection.platform,
        confidence: detection.confidence,
        products: [],
        stats: { successful: 0, failed: 0, skipped: 0, totalDiscovered: 0 },
        error: "No product cards or links were found on this collection page."
      };
    }
    const CONCURRENCY = 3;
    const products = [];
    let successful = 0;
    let failed = 0;
    let skipped = 0;
    for (let i = 0; i < discovered.length; i += CONCURRENCY) {
      const batch = discovered.slice(i, i + CONCURRENCY);
      const batchPromises = batch.map(async (item) => {
        try {
          const result = await extractProductFromUrl(item.url);
          if (result.success && result.product && result.product.images.length > 0) {
            successful++;
            return result.product;
          } else {
            failed++;
            return null;
          }
        } catch {
          failed++;
          return null;
        }
      });
      const batchResults = await Promise.all(batchPromises);
      for (const prod of batchResults) {
        if (prod) products.push(prod);
      }
    }
    return {
      success: products.length > 0,
      platform: detection.platform,
      confidence: detection.confidence,
      products,
      stats: {
        successful,
        failed,
        skipped,
        totalDiscovered: discovered.length
      }
    };
  } catch (err) {
    return {
      success: false,
      platform: "Custom E-Commerce",
      confidence: 0,
      products: [],
      stats: { successful: 0, failed: 0, skipped: 0, totalDiscovered: 0 },
      error: err.message || "Failed to process collection"
    };
  }
}

// api/extract.ts
async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }
  try {
    const body = req.body || {};
    const url = body.url;
    const urls = body.urls;
    const mode = body.mode || "auto";
    if (!url && (!urls || !Array.isArray(urls) || urls.length === 0)) {
      return res.status(400).json({ error: "URL or a list of URLs is required" });
    }
    const targetUrl = url || Array.isArray(urls) && urls[0];
    const jobId = `job-${Date.now()}`;
    if (mode === "collection") {
      const collectionResult = await extractCollectionFromUrl(targetUrl);
      if (!collectionResult.success || collectionResult.products.length === 0) {
        return res.status(422).json({
          error: collectionResult.error || "No products could be extracted from this collection.",
          status: "failed",
          detectedPlatform: collectionResult.platform,
          confidenceScore: collectionResult.confidence
        });
      }
      const totalImages = collectionResult.products.reduce(
        (acc, p) => acc + p.images.length,
        0
      );
      const formattedProducts = collectionResult.products.map((prod2) => ({
        id: prod2.id,
        name: prod2.name,
        storeName: prod2.storeName,
        url: prod2.url,
        variants: prod2.variants,
        platform: prod2.platform,
        confidence: prod2.confidence,
        images: prod2.images.map((img) => ({
          id: img.id,
          filename: img.filename,
          originalUrl: img.originalUrl,
          resolution: img.resolution || "Master Asset",
          size: "Master Asset",
          variant: img.variant,
          type: img.type,
          contentType: "image/jpeg",
          downloadStatus: "Downloaded"
        }))
      }));
      const formattedJob2 = {
        jobId,
        url: targetUrl,
        storeName: formattedProducts[0]?.storeName,
        mode: "collection",
        status: "completed",
        detectedPlatform: collectionResult.platform,
        confidenceScore: collectionResult.confidence,
        collectionStats: {
          successful: collectionResult.stats.successful,
          failed: collectionResult.stats.failed,
          skipped: collectionResult.stats.skipped
        },
        options: {
          includeGallery: true,
          includeVariants: true,
          useHighestResolution: true,
          removeDuplicates: true
        },
        progress: {
          currentStep: `Successfully extracted ${formattedProducts.length} products!`,
          productsFound: collectionResult.stats.totalDiscovered,
          currentProductIndex: formattedProducts.length,
          currentProductName: formattedProducts[0]?.name || "Collection",
          imagesFound: totalImages,
          imagesDownloaded: totalImages,
          imagesFailed: collectionResult.stats.failed,
          duplicatesRemoved: 0,
          percent: 100
        },
        products: formattedProducts,
        failedDownloads: []
      };
      return res.status(200).json({
        success: true,
        jobId,
        job: formattedJob2
      });
    }
    const result = await extractProductFromUrl(targetUrl);
    if (!result.success && mode === "auto") {
      const collFallback = await extractCollectionFromUrl(targetUrl, 12);
      if (collFallback.success && collFallback.products.length > 0) {
        const totalImages = collFallback.products.reduce(
          (acc, p) => acc + p.images.length,
          0
        );
        const formattedProducts = collFallback.products.map((prod2) => ({
          id: prod2.id,
          name: prod2.name,
          storeName: prod2.storeName,
          url: prod2.url,
          variants: prod2.variants,
          platform: prod2.platform,
          confidence: prod2.confidence,
          images: prod2.images.map((img) => ({
            id: img.id,
            filename: img.filename,
            originalUrl: img.originalUrl,
            resolution: img.resolution || "Master Asset",
            size: "Master Asset",
            variant: img.variant,
            type: img.type,
            contentType: "image/jpeg",
            downloadStatus: "Downloaded"
          }))
        }));
        return res.status(200).json({
          success: true,
          jobId,
          job: {
            jobId,
            url: targetUrl,
            storeName: formattedProducts[0]?.storeName,
            mode: "collection",
            status: "completed",
            detectedPlatform: collFallback.platform,
            confidenceScore: collFallback.confidence,
            collectionStats: collFallback.stats,
            options: {
              includeGallery: true,
              includeVariants: true,
              useHighestResolution: true,
              removeDuplicates: true
            },
            progress: {
              currentStep: `Extracted ${formattedProducts.length} products!`,
              productsFound: collFallback.stats.totalDiscovered,
              currentProductIndex: formattedProducts.length,
              currentProductName: formattedProducts[0]?.name || "Collection",
              imagesFound: totalImages,
              imagesDownloaded: totalImages,
              imagesFailed: collFallback.stats.failed,
              duplicatesRemoved: 0,
              percent: 100
            },
            products: formattedProducts,
            failedDownloads: []
          }
        });
      }
    }
    if (!result.success || !result.product) {
      return res.status(result.statusCode || 422).json({
        error: result.error || "Failed to extract product images.",
        status: "failed",
        detectedPlatform: result.platform,
        confidenceScore: result.confidence
      });
    }
    const prod = result.product;
    const formattedJob = {
      jobId,
      url: targetUrl,
      storeName: prod.storeName,
      mode: body.mode || "product",
      status: "completed",
      detectedPlatform: result.platform,
      confidenceScore: result.confidence,
      collectionStats: { successful: 1, failed: 0, skipped: 0 },
      options: {
        includeGallery: true,
        includeVariants: true,
        useHighestResolution: true,
        removeDuplicates: true
      },
      progress: {
        currentStep: "Extraction successfully completed!",
        productsFound: 1,
        currentProductIndex: 1,
        currentProductName: prod.name,
        imagesFound: prod.images.length,
        imagesDownloaded: prod.images.length,
        imagesFailed: 0,
        duplicatesRemoved: 0,
        percent: 100
      },
      products: [
        {
          id: prod.id,
          name: prod.name,
          storeName: prod.storeName,
          url: prod.url,
          platform: prod.platform,
          confidence: prod.confidence,
          variants: prod.variants,
          images: prod.images.map((img) => ({
            id: img.id,
            filename: img.filename,
            originalUrl: img.originalUrl,
            resolution: img.resolution || "Highest Available (Master)",
            size: "Master Asset",
            variant: img.variant,
            type: img.type,
            contentType: "image/jpeg",
            downloadStatus: "Downloaded"
          }))
        }
      ],
      failedDownloads: []
    };
    return res.status(200).json({
      success: true,
      jobId,
      job: formattedJob
    });
  } catch (err) {
    console.error("Vercel Extract API Error:", err);
    return res.status(500).json({
      error: err.message || "An unexpected error occurred during extraction.",
      status: "failed"
    });
  }
}
export {
  handler as default
};
