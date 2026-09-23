// server.ts
import express from "express";
import path from "path";
import fs from "fs";
import * as cheerio2 from "cheerio";
import JSZip from "jszip";
import multer from "multer";
import * as XLSX from "xlsx";

// src/lib/extractorEngine.ts
import * as cheerio from "cheerio";

// src/lib/security.ts
var SECURE_FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  Pragma: "no-cache"
};

// src/lib/platforms.ts
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

// src/lib/extractorEngine.ts
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
function extractProductFromHtml(html, targetUrl) {
  const cleanUrl = normalizeProtocol(targetUrl || "https://store.com");
  const $ = cheerio.load(html);
  const detection = detectPlatform(cleanUrl, html, $);
  let product;
  if (detection.platform === "WooCommerce") {
    product = extractWooCommerceImages($, cleanUrl, html);
  } else {
    product = extractGenericPlatformImages($, cleanUrl, detection.platform, detection.confidence);
  }
  return product;
}

// server.ts
var app = express();
var PORT = 3e3;
app.use(express.json());
app.use((req, res, next) => {
  if (process.env.VERCEL) {
    if (!req.url.startsWith("/api") && !req.url.startsWith("/api/")) {
      req.url = "/api" + (req.url.startsWith("/") ? req.url : "/" + req.url);
    }
  }
  next();
});
var jobs = /* @__PURE__ */ new Map();
var imageBuffers = /* @__PURE__ */ new Map();
function saveJob(jobOrId, maybeJob) {
  const job = typeof jobOrId === "string" ? maybeJob : jobOrId;
  if (!job) return;
  jobs.set(job.jobId, job);
  try {
    const tmpDir = path.join("/tmp", "extractor_jobs");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, `${job.jobId}.json`), JSON.stringify(job));
  } catch (err) {
  }
}
function getJob(jobId) {
  if (jobs.has(jobId)) return jobs.get(jobId);
  try {
    const filePath = path.join("/tmp", "extractor_jobs", `${jobId}.json`);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      const job = JSON.parse(data);
      saveJob(jobId, job);
      return job;
    }
  } catch (err) {
  }
  return void 0;
}
var cancelledJobIds = /* @__PURE__ */ new Set();
function isJobCancelled(jobId) {
  if (cancelledJobIds.has(jobId)) return true;
  const job = getJob(jobId);
  if (job?.status === "cancelled") {
    cancelledJobIds.add(jobId);
    return true;
  }
  return false;
}
function saveImageBuffer(key, buffer) {
  imageBuffers.set(key, buffer);
  try {
    const tmpDir = path.join("/tmp", "extractor_images");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, `${key}.bin`), buffer);
  } catch (err) {
  }
}
function getImageBuffer(key) {
  if (imageBuffers.has(key)) return imageBuffers.get(key);
  try {
    const filePath = path.join("/tmp", "extractor_images", `${key}.bin`);
    if (fs.existsSync(filePath)) {
      const buf = fs.readFileSync(filePath);
      imageBuffers.set(key, buf);
      return buf;
    }
  } catch (err) {
  }
  return void 0;
}
async function fetchWithTimeout(url, options = {}, timeoutMs = 4500) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } catch (err) {
    if (err.name === "AbortError" || err.message?.includes("aborted")) {
      throw new Error(`Timeout reaching ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}
setInterval(() => {
  const now = Date.now();
  for (const [jobId, job] of jobs.entries()) {
    const timestamp = parseInt(jobId.split("-")[1]);
    if (isNaN(timestamp) || now - timestamp > 30 * 60 * 1e3) {
      jobs.delete(jobId);
      for (const key of imageBuffers.keys()) {
        if (key.startsWith(jobId)) {
          imageBuffers.delete(key);
        }
      }
    }
  }
}, 10 * 60 * 1e3);
function getImageDimensions(buffer) {
  try {
    if (buffer.length < 8) return null;
    if (buffer[0] === 137 && buffer[1] === 80 && buffer[2] === 78 && buffer[3] === 71) {
      if (buffer.length >= 24) {
        const width = buffer.readInt32BE(16);
        const height = buffer.readInt32BE(20);
        return { width, height };
      }
    }
    if (buffer[0] === 71 && buffer[1] === 73 && buffer[2] === 70 && buffer[3] === 56) {
      if (buffer.length >= 10) {
        const width = buffer.readUInt16LE(6);
        const height = buffer.readUInt16LE(8);
        return { width, height };
      }
    }
    if (buffer[0] === 255 && buffer[1] === 216) {
      let i = 2;
      while (i < buffer.length - 8) {
        if (buffer[i] === 255) {
          const marker = buffer[i + 1];
          if (marker >= 192 && marker <= 195 || marker >= 197 && marker <= 199 || marker >= 201 && marker <= 203 || marker >= 205 && marker <= 207) {
            const height = buffer.readUInt16BE(i + 5);
            const width = buffer.readUInt16BE(i + 7);
            return { width, height };
          }
          const length = buffer.readUInt16BE(i + 2);
          i += 2 + length;
        } else {
          i++;
        }
      }
    }
    if (buffer[0] === 82 && buffer[1] === 73 && buffer[2] === 70 && buffer[3] === 70 && // RIFF
    buffer[8] === 87 && buffer[9] === 69 && buffer[10] === 66 && buffer[11] === 80) {
      if (buffer[12] === 86 && buffer[13] === 80 && buffer[14] === 56) {
        const type = buffer[15];
        if (type === 32 && buffer.length >= 30) {
          const width = buffer.readUInt16LE(26) & 16383;
          const height = buffer.readUInt16LE(28) & 16383;
          return { width, height };
        } else if (type === 76 && buffer.length >= 25) {
          const val = buffer.readUInt32LE(21);
          const width = (val & 16383) + 1;
          const height = (val >> 14 & 16383) + 1;
          return { width, height };
        } else if (type === 88 && buffer.length >= 30) {
          const width = (buffer.readUInt32LE(24) & 16777215) + 1;
          const height = (buffer.readUInt32LE(27) & 16777215) + 1;
          return { width, height };
        }
      }
    }
  } catch (err) {
    console.error("Error parsing dimensions programmatically:", err);
  }
  return null;
}
function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
function sanitizeFilename2(name) {
  return name.replace(/[\\/:*?"<>|]/g, "").trim();
}
function getHighResImageUrl(url, platform) {
  let cleanUrl = url;
  if (url.startsWith("//")) {
    cleanUrl = "https:" + url;
  }
  try {
    const urlObj = new URL(cleanUrl);
    if (cleanUrl.includes("cdn.shopify.com") || platform === "shopify") {
      const pathWithoutQuery = urlObj.pathname;
      const cleanPath = pathWithoutQuery.replace(/_(small|medium|large|compact|grande|1024x1024|2048x2048|300x300|400x400|600x600|800x800|1000x1000|1200x1200|1600x1600|master)(_crop_center|_crop_top|_crop_bottom)?(\.[a-zA-Z0-9]+)$/, "$3");
      urlObj.pathname = cleanPath;
      if (urlObj.searchParams.has("width")) urlObj.searchParams.delete("width");
      if (urlObj.searchParams.has("height")) urlObj.searchParams.delete("height");
      if (urlObj.searchParams.has("crop")) urlObj.searchParams.delete("crop");
      return urlObj.toString();
    }
    if (cleanUrl.includes("/wp-content/uploads/")) {
      const cleanPath = urlObj.pathname.replace(/-\d+x\d+(\.[a-zA-Z0-9]+)$/, "$1");
      urlObj.pathname = cleanPath;
      return urlObj.toString();
    }
    if (cleanUrl.includes("editmysite.com") || platform === "weebly") {
      if (urlObj.searchParams.has("width")) urlObj.searchParams.delete("width");
      if (urlObj.searchParams.has("height")) urlObj.searchParams.delete("height");
      return urlObj.toString();
    }
  } catch (e) {
  }
  return cleanUrl;
}
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});
var storage = multer.memoryStorage();
var upload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024
    // 15MB limit
  }
});
function extractUrlsFromBuffer(buffer, filename, mimeType) {
  const urlRegex = /https?:\/\/[a-zA-Z0-9.\-_/=?&%#+~@:;()!*']+/gi;
  const discoveredUrls = /* @__PURE__ */ new Set();
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (ext === "xlsx" || ext === "xls" || ext === "csv" || mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) {
    try {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;
        const ref = sheet["!ref"];
        if (!ref) continue;
        const range = XLSX.utils.decode_range(ref);
        for (let R = range.s.r; R <= range.e.r; ++R) {
          for (let C = range.s.c; C <= range.e.c; ++C) {
            const cell_address = { c: C, r: R };
            const cell_ref = XLSX.utils.encode_cell(cell_address);
            const cell = sheet[cell_ref];
            if (cell && cell.v !== void 0) {
              const valStr = String(cell.v);
              const matches = valStr.match(urlRegex);
              if (matches) {
                matches.forEach((u) => discoveredUrls.add(u.trim()));
              }
              if (cell.l && cell.l.Target) {
                discoveredUrls.add(cell.l.Target.trim());
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Error parsing spreadsheet with XLSX:", err);
    }
  }
  if (ext === "pdf" || mimeType.includes("pdf")) {
    try {
      const utf8Str = buffer.toString("utf-8");
      const latin1Str = buffer.toString("latin1");
      const matchesUtf8 = utf8Str.match(urlRegex);
      if (matchesUtf8) {
        matchesUtf8.forEach((u) => discoveredUrls.add(u.trim()));
      }
      const matchesLatin1 = latin1Str.match(urlRegex);
      if (matchesLatin1) {
        matchesLatin1.forEach((u) => {
          const urlClean = u.replace(/[^a-zA-Z0-9.\-_/=?&%#+~@:;()!*']/g, "");
          discoveredUrls.add(urlClean.trim());
        });
      }
      const uriRegex = /\/URI\s*\(([^)]+)\)/g;
      let match;
      while ((match = uriRegex.exec(utf8Str)) !== null) {
        if (match[1]) discoveredUrls.add(match[1].trim());
      }
      while ((match = uriRegex.exec(latin1Str)) !== null) {
        if (match[1]) discoveredUrls.add(match[1].trim());
      }
    } catch (err) {
      console.error("Error parsing PDF binary:", err);
    }
  } else {
    try {
      const text = buffer.toString("utf-8");
      const matches = text.match(urlRegex);
      if (matches) {
        matches.forEach((u) => discoveredUrls.add(u.trim()));
      }
    } catch (err) {
      console.error("Error parsing standard text:", err);
    }
  }
  const validUrls = [];
  discoveredUrls.forEach((url) => {
    try {
      const cleanUrl = url.trim().replace(/[.)),;>\]'"]+$/, "");
      if (cleanUrl.startsWith("http://") || cleanUrl.startsWith("https://")) {
        new URL(cleanUrl);
        validUrls.push(cleanUrl);
      }
    } catch (_) {
    }
  });
  return Array.from(new Set(validUrls));
}
app.post("/api/parse-file", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file was uploaded" });
  }
  try {
    const urls = extractUrlsFromBuffer(req.file.buffer, req.file.originalname, req.file.mimetype);
    res.json({
      filename: req.file.originalname,
      count: urls.length,
      urls
    });
  } catch (error) {
    console.error("File processing error:", error);
    res.status(500).json({ error: `Failed to process file: ${error.message}` });
  }
});
app.post("/api/extract", async (req, res) => {
  const { url, urls, fileName, mode = "auto", options = {} } = req.body;
  if (!url && (!urls || !Array.isArray(urls) || urls.length === 0)) {
    return res.status(400).json({ error: "URL or a list of URLs is required" });
  }
  const jobId = `job-${Date.now()}`;
  const job = {
    jobId,
    url: url || `Bulk Scrape: ${urls.length} links`,
    urls: urls || void 0,
    fileName: fileName || void 0,
    mode,
    status: "analyzing",
    options: {
      includeGallery: options.includeGallery !== false,
      includeVariants: options.includeVariants !== false,
      useHighestResolution: options.useHighestResolution !== false,
      removeDuplicates: options.removeDuplicates !== false,
      includeStyleSiblings: options.includeStyleSiblings === true
    },
    progress: {
      currentStep: "Initializing extractor...",
      productsFound: 0,
      currentProductIndex: 0,
      currentProductName: "",
      imagesFound: 0,
      imagesDownloaded: 0,
      imagesFailed: 0,
      duplicatesRemoved: 0,
      percent: 5
    },
    products: [],
    failedDownloads: []
  };
  saveJob(job);
  if (process.env.VERCEL) {
    try {
      const timeoutPromise = new Promise(
        (_, reject) => setTimeout(() => reject(new Error("Extraction request timed out waiting for target store. Try Single Product mode or Sandbox Demo.")), 8500)
      );
      await Promise.race([runCrawler(jobId), timeoutPromise]);
    } catch (err) {
      console.error(`Error in crawler for job ${jobId}:`, err);
      const j = getJob(jobId);
      if (j) {
        j.status = "failed";
        j.error = err.message || "An unknown extraction error occurred.";
        saveJob(j);
      }
    }
    const finalJob = getJob(jobId) || job;
    return res.json({ jobId, job: finalJob });
  } else {
    runCrawler(jobId).catch((err) => {
      console.error(`Error in crawler for job ${jobId}:`, err);
      const j = getJob(jobId);
      if (j) {
        j.status = "failed";
        j.error = err.message || "An unknown extraction error occurred.";
        saveJob(j);
      }
    });
    return res.json({ jobId });
  }
});
app.post("/api/extract-html", async (req, res) => {
  const { html, url = "https://paige.com/products/men-lennox-emberton-1" } = req.body;
  if (!html || typeof html !== "string" || html.trim().length === 0) {
    return res.status(400).json({ error: "Page HTML content is required" });
  }
  const jobId = `job-${Date.now()}`;
  const extracted = extractProductFromHtml(html, url);
  if (!extracted || extracted.images.length === 0) {
    return res.status(422).json({ error: "No product images found in the provided HTML." });
  }
  const images = extracted.images.map((img, idx) => ({
    id: `img-${idx + 1}`,
    filename: img.filename || `image-${idx + 1}.jpg`,
    originalUrl: img.originalUrl,
    resolution: img.resolution || "Original Quality",
    size: "HD Asset",
    variant: img.variant || "General",
    type: img.type || "Gallery",
    contentType: "image/jpeg",
    downloadStatus: "Downloaded"
  }));
  const productData = {
    id: `prod-1`,
    name: extracted.name,
    storeName: extracted.storeName,
    url,
    images,
    variants: extracted.variants || []
  };
  const job = {
    jobId,
    url,
    mode: "product",
    status: "completed",
    options: {
      includeGallery: true,
      includeVariants: true,
      useHighestResolution: true,
      removeDuplicates: true,
      includeStyleSiblings: false
    },
    progress: {
      currentStep: "Extraction complete!",
      productsFound: 1,
      currentProductIndex: 1,
      currentProductName: extracted.name,
      imagesFound: images.length,
      imagesDownloaded: images.length,
      imagesFailed: 0,
      duplicatesRemoved: 0,
      percent: 100
    },
    products: [productData],
    failedDownloads: []
  };
  saveJob(jobId, job);
  for (const img of images) {
    try {
      const imgRes = await fetch(img.originalUrl, { headers: SECURE_FETCH_HEADERS });
      if (imgRes.ok) {
        const arrayBuf = await imgRes.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        saveImageBuffer(`${jobId}-${productData.id}-${img.id}`, buf);
        img.downloadStatus = "Downloaded";
      } else {
        img.downloadStatus = "Failed";
      }
    } catch {
      img.downloadStatus = "Failed";
    }
  }
  saveJob(jobId, job);
  return res.json({ jobId, job });
});
app.get("/api/jobs/:jobId", (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  res.json(job);
});
app.post("/api/jobs/:jobId/cancel", (req, res) => {
  const { jobId } = req.params;
  cancelledJobIds.add(jobId);
  const job = getJob(jobId);
  if (job) {
    job.status = "cancelled";
    job.progress.currentStep = "Scrape cancelled by user";
    job.error = "Extraction was cancelled by user.";
    saveJob(job);
  }
  res.json({ success: true, jobId, status: "cancelled" });
});
app.get("/api/jobs/:jobId/products/:productId/images/:imageId", (req, res) => {
  const { jobId, productId, imageId } = req.params;
  const bufferKey = `${jobId}_${productId}_${imageId}`;
  const buffer = getImageBuffer(bufferKey);
  if (!buffer) {
    return res.status(404).send("Image not found");
  }
  const job = getJob(jobId);
  const product = job?.products.find((p) => p.id === productId);
  const imageMeta = product?.images.find((i) => i.id === imageId);
  res.setHeader("Content-Type", imageMeta?.contentType || "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=31536000");
  res.send(buffer);
});
app.get("/api/jobs/:jobId/download-image/:productId/:imageId", (req, res) => {
  const { jobId, productId, imageId } = req.params;
  const bufferKey = `${jobId}_${productId}_${imageId}`;
  const buffer = getImageBuffer(bufferKey);
  if (!buffer) {
    return res.status(404).send("Image not found");
  }
  const job = getJob(jobId);
  const product = job?.products.find((p) => p.id === productId);
  const imageMeta = product?.images.find((i) => i.id === imageId);
  if (!imageMeta) {
    return res.status(404).send("Image metadata not found");
  }
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(imageMeta.filename)}"`);
  res.setHeader("Content-Type", imageMeta.contentType || "application/octet-stream");
  res.send(buffer);
});
app.get("/api/jobs/:jobId/products/:productId/download-zip", async (req, res) => {
  const { jobId, productId } = req.params;
  const job = getJob(jobId);
  const product = job?.products.find((p) => p.id === productId);
  if (!job || !product) {
    return res.status(404).json({ error: "Product or Job not found" });
  }
  try {
    const zip = new JSZip();
    const prodStoreName = product.storeName || job.storeName || extractStoreName(null, product.url) || "Store";
    const cleanStore = sanitizeFilename2(prodStoreName);
    const cleanProd = sanitizeFilename2(product.name);
    const folderName = `${cleanStore} - ${cleanProd}`;
    const productFolder = zip.folder(folderName);
    if (!productFolder) throw new Error("Could not create product folder in ZIP");
    let imageNum = 1;
    let csvContent = `"Product Name","Store Name","Product URL","Variant","Image Type","Image Number","Image File Name","Image URL","Image Resolution","Download Status"
`;
    for (const img of product.images) {
      if (img.downloadStatus === "Downloaded") {
        const bufferKey = `${jobId}_${product.id}_${img.id}`;
        const buffer = getImageBuffer(bufferKey);
        if (buffer) {
          productFolder.file(img.filename, buffer);
        }
      }
      const csvRow = [
        product.name,
        prodStoreName,
        product.url,
        img.variant || "General",
        img.type,
        imageNum++,
        img.filename,
        img.originalUrl,
        img.resolution,
        img.downloadStatus
      ].map((val) => `"${String(val).replace(/"/g, '""')}"`).join(",");
      csvContent += csvRow + "\n";
    }
    zip.file("product_data.csv", csvContent);
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(folderName)}.zip"`);
    res.setHeader("Content-Type", "application/zip");
    res.send(zipBuffer);
  } catch (err) {
    res.status(500).json({ error: "Failed to generate product folder ZIP: " + err.message });
  }
});
app.get("/api/jobs/:jobId/download-csv", (req, res) => {
  const { jobId } = req.params;
  const job = getJob(jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  const defaultStoreName = job.storeName || extractStoreName(null, job.url);
  let csvContent = `"Product Name","Store Name","Product URL","Variant","Image Type","Image Number","Image File Name","Image URL","Image Resolution","Download Status"
`;
  for (const product of job.products) {
    const prodStoreName = product.storeName || defaultStoreName;
    let imageNum = 1;
    for (const img of product.images) {
      const csvRow = [
        product.name,
        prodStoreName,
        product.url,
        img.variant || "General",
        img.type,
        imageNum++,
        img.filename,
        img.originalUrl,
        img.resolution,
        img.downloadStatus
      ].map((val) => `"${String(val).replace(/"/g, '""')}"`).join(",");
      csvContent += csvRow + "\n";
    }
  }
  res.setHeader("Content-Disposition", 'attachment; filename="product_data.csv"');
  res.setHeader("Content-Type", "text/csv");
  res.send(csvContent);
});
app.get("/api/jobs/:jobId/download-zip", async (req, res) => {
  const { jobId } = req.params;
  const job = getJob(jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  if (job.status !== "completed") {
    return res.status(400).json({ error: "Extraction job is not complete yet" });
  }
  try {
    const zip = new JSZip();
    let csvContent = `"Product Name","Store Name","Product URL","Variant","Image Type","Image Number","Image File Name","Image URL","Image Resolution","Download Status"
`;
    const firstProd = job.products[0];
    const defaultStoreName = firstProd?.storeName || job.storeName || extractStoreName(null, job.url);
    const cleanDefaultStore = sanitizeFilename2(defaultStoreName || "Store");
    for (const product of job.products) {
      const prodStoreName = product.storeName || defaultStoreName;
      const cleanStore = sanitizeFilename2(prodStoreName || "Store");
      const sanitizedProductName = sanitizeFilename2(product.name);
      const folderName = `${cleanStore} - ${sanitizedProductName}`;
      const productFolder = zip.folder(folderName);
      if (!productFolder) continue;
      let imageNum = 1;
      for (const img of product.images) {
        if (img.downloadStatus === "Downloaded") {
          const bufferKey = `${jobId}_${product.id}_${img.id}`;
          const buffer = getImageBuffer(bufferKey);
          if (buffer) {
            productFolder.file(img.filename, buffer);
          }
        }
        const csvRow = [
          product.name,
          prodStoreName,
          product.url,
          img.variant || "General",
          img.type,
          imageNum++,
          img.filename,
          img.originalUrl,
          img.resolution,
          img.downloadStatus
        ].map((val) => `"${String(val).replace(/"/g, '""')}"`).join(",");
        csvContent += csvRow + "\n";
      }
    }
    zip.file("product_data.csv", csvContent);
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    let zipName = `${cleanDefaultStore} - Extracted Products.zip`;
    if (job.fileName) {
      const cleanFileBase = sanitizeFilename2(job.fileName.replace(/\.[^/.]+$/, "")) || "Extracted Products";
      zipName = `${cleanFileBase}.zip`;
    } else if (job.products.length === 1 && firstProd) {
      zipName = `${cleanDefaultStore} - ${sanitizeFilename2(firstProd.name)}.zip`;
    }
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(zipName)}"`);
    res.setHeader("Content-Type", "application/zip");
    res.send(zipBuffer);
  } catch (err) {
    console.error("ZIP Generation Error:", err);
    res.status(500).json({ error: "Failed to generate ZIP file: " + err.message });
  }
});
async function runCrawler(jobId) {
  if (isJobCancelled(jobId)) return;
  const job = getJob(jobId);
  if (!job) return;
  const urlStr = job.url.trim();
  const demoMode = urlStr.includes("example.com") || urlStr.includes("demo") || urlStr.includes("testurl");
  if (demoMode) {
    await simulateDemoExtraction(job);
    return;
  }
  if (job.urls && Array.isArray(job.urls) && job.urls.length > 0) {
    try {
      const totalUrls = job.urls.length;
      job.progress.productsFound = totalUrls;
      saveJob(jobId, job);
      for (let uIdx = 0; uIdx < totalUrls; uIdx++) {
        if (isJobCancelled(jobId)) return;
        const currentUrl = job.urls[uIdx].trim();
        job.progress.currentProductIndex = uIdx + 1;
        job.progress.currentProductName = currentUrl;
        job.progress.currentStep = `Analyzing link ${uIdx + 1} of ${totalUrls}...`;
        job.progress.percent = Math.floor(10 + uIdx / totalUrls * 85);
        saveJob(jobId, job);
        let platform = "Generic";
        let html = "";
        const HEADERS = {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
        };
        try {
          const response = await fetchWithTimeout(currentUrl, { headers: HEADERS }, 4e3);
          if (response.ok) {
            html = await response.text();
            const $ = cheerio2.load(html);
            const detection = detectPlatform(currentUrl, html, $);
            platform = detection.platform;
          }
        } catch (fetchErr) {
          console.error(`Error fetching URL for platform detection: ${currentUrl}`, fetchErr);
        }
        let detectedMode = "product";
        if (job.mode === "auto") {
          const pathLower = new URL(currentUrl).pathname.toLowerCase();
          if (pathLower.includes("/collections/") || pathLower.includes("/category/") || pathLower.includes("/collection/") || pathLower.includes("/shop") || pathLower.includes("/catalog") || pathLower.includes("products.json")) {
            detectedMode = "collection";
          } else {
            detectedMode = "product";
          }
        } else {
          detectedMode = job.mode;
        }
        job.progress.currentStep = `Extracting link ${uIdx + 1}/${totalUrls} (${platform.toUpperCase()})...`;
        saveJob(jobId, job);
        if (detectedMode === "collection") {
          let colProductUrls = [];
          if (platform === "shopify") {
            try {
              const urlObj = new URL(currentUrl);
              const collectionJsonUrl = `${urlObj.origin}/products.json?limit=25`;
              const res = await fetchWithTimeout(collectionJsonUrl, { headers: HEADERS }, 4e3);
              if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.products)) {
                  for (const p of data.products) {
                    colProductUrls.push({
                      url: `${urlObj.origin}/products/${p.handle}`,
                      name: p.title
                    });
                  }
                }
              }
            } catch (_) {
            }
          } else if (platform === "weebly") {
            try {
              const bootstrapMatch = html.match(/window\.__BOOTSTRAP_STATE__\s*=\s*({.*?});/s) || html.match(/window\.__BOOTSTRAP_STATE__\s*=\s*(.*?);/);
              let bootstrapState = null;
              if (bootstrapMatch) {
                bootstrapState = JSON.parse(bootstrapMatch[1]);
              }
              if (bootstrapState) {
                const classicSiteID = bootstrapState.siteData?.site?.properties?.classicSiteID;
                const classicUserID = bootstrapState.siteData?.user?.id;
                const siteCatalogVersion = bootstrapState.siteData?.site?.properties?.siteCatalogVersion;
                if (classicUserID && classicSiteID) {
                  let categoryId = null;
                  const catMatch = currentUrl.match(/\/shop\/[^/]+\/([a-zA-Z0-9]{24})/i);
                  if (catMatch) {
                    categoryId = catMatch[1];
                  }
                  let apiUrl = `https://cdn5.editmysite.com/app/store/api/v28/editor/users/${classicUserID}/sites/${classicSiteID}/products?cache-version=${siteCatalogVersion}&per_page=100`;
                  if (categoryId) {
                    apiUrl += `&categories%5B%5D=${categoryId}`;
                  }
                  const res = await fetchWithTimeout(apiUrl, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } }, 4e3);
                  if (res.ok) {
                    const apiData = await res.json();
                    if (apiData && Array.isArray(apiData.data)) {
                      const urlObj = new URL(currentUrl);
                      for (const item of apiData.data) {
                        colProductUrls.push({
                          url: item.absolute_site_link || `${urlObj.origin}/product/${item.permalink || item.site_link || item.id}/${item.site_product_id || item.id}`,
                          name: item.name
                        });
                      }
                    }
                  }
                }
              }
            } catch (_) {
            }
          }
          if (colProductUrls.length === 0 && html) {
            const $ = cheerio2.load(html);
            const uniqueLinks = /* @__PURE__ */ new Set();
            $("a").each((_, el) => {
              const href = $(el).attr("href");
              if (!href) return;
              try {
                const absUrlObj = new URL(href, currentUrl);
                const absUrl = absUrlObj.toString().split("?")[0];
                const isProductPattern = absUrlObj.pathname.includes("/products/") || absUrlObj.pathname.includes("/product/") || absUrlObj.pathname.includes("/item/") || absUrlObj.pathname.endsWith(".html");
                if (isProductPattern && !uniqueLinks.has(absUrl) && absUrl !== currentUrl) {
                  uniqueLinks.add(absUrl);
                  colProductUrls.push({ url: absUrl, name: $(el).text().trim() || void 0 });
                }
              } catch (_2) {
              }
            });
          }
          const limit = 15;
          if (colProductUrls.length > limit) {
            colProductUrls = colProductUrls.slice(0, limit);
          }
          for (const cp of colProductUrls) {
            if (isJobCancelled(jobId)) return;
            try {
              const productData = await extractAndDownloadProduct(jobId, cp.url, cp.name, platform, job);
              if (productData) {
                job.products.push(productData);
              }
            } catch (cpErr) {
              console.error(`Bulk collection item fail: ${cp.url}`, cpErr);
              job.failedDownloads.push({ url: cp.url, error: cpErr.message || "Failed" });
            }
          }
        } else {
          if (isJobCancelled(jobId)) return;
          const productData = await extractAndDownloadProduct(jobId, currentUrl, void 0, platform, job);
          if (productData) {
            job.products.push(productData);
          } else {
            throw new Error("Could not extract product details.");
          }
        }
      }
      if (isJobCancelled(jobId)) return;
      job.status = "completed";
      job.progress.currentStep = "All links from file parsed and extracted successfully!";
      job.progress.percent = 100;
      saveJob(jobId, job);
    } catch (bulkErr) {
      if (isJobCancelled(jobId)) return;
      console.error("Bulk extraction general error:", bulkErr);
      job.status = "failed";
      job.error = bulkErr.message || "A general error occurred during bulk file extraction.";
      saveJob(jobId, job);
    }
    return;
  }
  try {
    job.progress.currentStep = "Fetching website HTML...";
    job.progress.percent = 10;
    saveJob(jobId, job);
    const HEADERS = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    };
    let mainHtml = "";
    try {
      const response = await fetchWithTimeout(urlStr, { headers: HEADERS }, 5e3);
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
      }
      mainHtml = await response.text();
    } catch (fetchErr) {
      throw new Error(`Unable to access website: ${fetchErr.message}. Make sure the URL is correct and public.`);
    }
    const $ = cheerio2.load(mainHtml);
    const detection = detectPlatform(urlStr, mainHtml, $);
    const platform = detection.platform;
    job.detectedPlatform = detection.platform;
    job.confidenceScore = detection.confidence;
    const detectedStoreName = extractStoreName($, urlStr, mainHtml);
    job.storeName = detectedStoreName;
    let detectedMode = "product";
    if (job.mode === "auto") {
      const pathLower = new URL(urlStr).pathname.toLowerCase();
      if (pathLower.includes("/collections/") || pathLower.includes("/category/") || pathLower.includes("/collection/") || pathLower.includes("/shop") || pathLower.includes("/catalog") || pathLower.includes("products.json")) {
        detectedMode = "collection";
      } else {
        detectedMode = "product";
      }
    } else {
      detectedMode = job.mode;
    }
    job.progress.currentStep = `Detected: ${detection.platform} (${Math.round(detection.confidence * 100)}% confidence). Mode: ${detectedMode === "product" ? "Single Product Page" : "Collection"}`;
    job.progress.percent = 20;
    saveJob(jobId, job);
    let productUrls = [];
    if (detectedMode === "collection") {
      job.progress.currentStep = "Searching for product cards...";
      saveJob(jobId, job);
      if (platform === "Shopify") {
        try {
          const urlObj = new URL(urlStr);
          let collectionJsonUrl = "";
          if (urlObj.pathname.endsWith("/products.json")) {
            collectionJsonUrl = urlObj.toString();
          } else {
            const pathParts = urlObj.pathname.split("/").filter(Boolean);
            const collectionsIdx = pathParts.indexOf("collections");
            if (collectionsIdx !== -1 && pathParts[collectionsIdx + 1]) {
              const collHandle = pathParts[collectionsIdx + 1];
              collectionJsonUrl = `${urlObj.origin}/collections/${collHandle}/products.json?limit=25`;
            } else {
              collectionJsonUrl = `${urlObj.origin}/products.json?limit=25`;
            }
          }
          const res = await fetchWithTimeout(collectionJsonUrl, { headers: HEADERS }, 4e3);
          if (res.ok) {
            const data = await res.json();
            if (data && Array.isArray(data.products)) {
              for (const p of data.products) {
                productUrls.push({
                  url: `${urlObj.origin}/products/${p.handle}`,
                  name: p.title
                });
              }
            }
          }
        } catch (shopifyErr) {
          console.error("Shopify Collection API fallback:", shopifyErr);
        }
      } else if (platform === "Square Online") {
        try {
          const bootstrapMatch = mainHtml.match(/window\.__BOOTSTRAP_STATE__\s*=\s*({.*?});/s) || mainHtml.match(/window\.__BOOTSTRAP_STATE__\s*=\s*(.*?);/);
          let bootstrapState = null;
          if (bootstrapMatch) {
            bootstrapState = JSON.parse(bootstrapMatch[1]);
          }
          if (bootstrapState) {
            const classicSiteID = bootstrapState.siteData?.site?.properties?.classicSiteID;
            const classicUserID = bootstrapState.siteData?.user?.id;
            const siteCatalogVersion = bootstrapState.siteData?.site?.properties?.siteCatalogVersion;
            if (classicUserID && classicSiteID) {
              let categoryId = null;
              const catMatch = urlStr.match(/\/shop\/[^/]+\/([a-zA-Z0-9]{24})/i);
              if (catMatch) {
                categoryId = catMatch[1];
              }
              let apiUrl = `https://cdn5.editmysite.com/app/store/api/v28/editor/users/${classicUserID}/sites/${classicSiteID}/products?cache-version=${siteCatalogVersion}&per_page=100`;
              if (categoryId) {
                apiUrl += `&categories%5B%5D=${categoryId}`;
              }
              const res = await fetchWithTimeout(apiUrl, {
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                  "Accept": "application/json"
                }
              }, 4e3);
              if (res.ok) {
                const apiData = await res.json();
                if (apiData && Array.isArray(apiData.data)) {
                  const urlObj = new URL(urlStr);
                  for (const item of apiData.data) {
                    const itemUrl = item.absolute_site_link || `${urlObj.origin}/product/${item.permalink || item.site_link || item.id}/${item.site_product_id || item.id}`;
                    productUrls.push({
                      url: itemUrl,
                      name: item.name
                    });
                  }
                }
              }
            }
          }
        } catch (weeblyErr) {
          console.error("Weebly collection API fallback:", weeblyErr);
        }
      }
      if (productUrls.length === 0) {
        const uniqueLinks = /* @__PURE__ */ new Set();
        $("a").each((i, el) => {
          const href = $(el).attr("href");
          if (!href) return;
          try {
            const absUrlObj = new URL(href, urlStr);
            const absUrl = absUrlObj.toString();
            if (absUrlObj.search || absUrlObj.hash) return;
            const isProductPattern = absUrlObj.pathname.includes("/products/") || absUrlObj.pathname.includes("/product/") || absUrlObj.pathname.includes("/item/") || absUrlObj.pathname.split("/").filter(Boolean).length >= 2 && platform === "Shopify";
            if (isProductPattern && !uniqueLinks.has(absUrl) && absUrl !== urlStr) {
              uniqueLinks.add(absUrl);
              const name = $(el).text().trim() || $(el).find("img").attr("alt")?.trim() || void 0;
              productUrls.push({ url: absUrl, name });
            }
          } catch (e) {
          }
        });
      }
      const limit = 50;
      if (productUrls.length > limit) {
        productUrls = productUrls.slice(0, limit);
      }
      job.progress.productsFound = productUrls.length;
      if (productUrls.length === 0) {
        throw new Error("No products found in this listing/collection page HTML. The page may use client-side React rendering or have anti-bot protections.");
      }
      job.progress.currentStep = `Found ${productUrls.length} products to process.`;
      job.progress.percent = 25;
      saveJob(jobId, job);
      for (let index = 0; index < productUrls.length; index++) {
        if (isJobCancelled(jobId)) return;
        const pObj = productUrls[index];
        job.progress.currentProductIndex = index + 1;
        job.progress.currentProductName = pObj.name || `Product ${index + 1}`;
        job.progress.percent = Math.floor(25 + index / productUrls.length * 50);
        saveJob(jobId, job);
        try {
          const productData = await extractAndDownloadProduct(jobId, pObj.url, pObj.name, platform, job);
          if (productData) {
            job.products.push(productData);
          }
        } catch (pErr) {
          console.error(`Error processing product ${pObj.url}:`, pErr);
          job.failedDownloads.push({ url: pObj.url, error: pErr.message || "Failed parsing" });
        }
      }
    } else {
      if (job.options.includeStyleSiblings) {
        if (isJobCancelled(jobId)) return;
        job.progress.currentStep = "Scanning product page for sibling color swatches / style group...";
        saveJob(jobId, job);
        const siblingUrls = /* @__PURE__ */ new Set();
        siblingUrls.add(urlStr);
        try {
          const urlObj = new URL(urlStr);
          const handle = urlObj.pathname.split("/").pop() || "";
          const parts = handle.split("-");
          if (parts.length > 2) {
            const baseWordsCount = Math.max(3, parts.length - 3);
            const baseSlug = parts.slice(0, baseWordsCount).join("-");
            $("a").each((_, el) => {
              const href = $(el).attr("href");
              if (!href) return;
              try {
                const absUrlObj = new URL(href, urlStr);
                const absUrl = absUrlObj.toString().split("?")[0];
                if (absUrlObj.pathname.includes("/products/") && absUrlObj.pathname.includes(baseSlug)) {
                  siblingUrls.add(absUrl);
                }
              } catch (_2) {
              }
            });
          }
        } catch (siblingErr) {
          console.error("Error scanning siblings:", siblingErr);
        }
        const urlsToProcess = Array.from(siblingUrls);
        job.progress.productsFound = urlsToProcess.length;
        job.progress.currentStep = `Found ${urlsToProcess.length} sibling style listings. Starting style collection scrape...`;
        saveJob(jobId, job);
        for (let index = 0; index < urlsToProcess.length; index++) {
          if (isJobCancelled(jobId)) return;
          const sUrl = urlsToProcess[index];
          job.progress.currentProductIndex = index + 1;
          let guessedName = "Sibling Style";
          try {
            const handlePart = new URL(sUrl).pathname.split("/").pop() || "";
            guessedName = handlePart.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
          } catch (_) {
          }
          job.progress.currentProductName = guessedName;
          job.progress.percent = Math.floor(30 + index / urlsToProcess.length * 50);
          saveJob(jobId, job);
          try {
            const productData = await extractAndDownloadProduct(jobId, sUrl, void 0, platform, job);
            if (productData) {
              job.products.push(productData);
            }
          } catch (pErr) {
            console.error(`Error processing sibling style ${sUrl}:`, pErr);
            job.failedDownloads.push({ url: sUrl, error: pErr.message || "Failed parsing sibling" });
          }
        }
      } else {
        if (isJobCancelled(jobId)) return;
        job.progress.productsFound = 1;
        job.progress.currentProductIndex = 1;
        job.progress.currentProductName = "Analyzing main product...";
        job.progress.percent = 30;
        saveJob(jobId, job);
        const productData = await extractAndDownloadProduct(jobId, urlStr, void 0, platform, job);
        if (productData) {
          job.products.push(productData);
        } else {
          throw new Error("Could not extract any product information or images from the URL.");
        }
      }
    }
    if (isJobCancelled(jobId)) return;
    job.status = "completed";
    job.progress.currentStep = "Extraction successfully completed!";
    job.progress.percent = 100;
    saveJob(jobId, job);
  } catch (err) {
    if (isJobCancelled(jobId)) return;
    console.error(`Crawler failed:`, err);
    job.status = "failed";
    job.error = err.message || "An error occurred during extraction.";
    saveJob(jobId, job);
  }
}
async function extractAndDownloadProduct(jobId, productUrl, predefinedName, platform, job) {
  if (isJobCancelled(jobId)) return null;
  const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
  };
  let productTitle = predefinedName || "";
  let extractedStoreName = job.storeName || "";
  let imageCandidates = [];
  let variants = [];
  let shopifyJsonSucceeded = false;
  const shopifyInfo = parseShopifyProductUrl(productUrl);
  if (shopifyInfo.isShopifyProduct && shopifyInfo.jsonUrl) {
    try {
      const res = await fetchWithTimeout(shopifyInfo.jsonUrl, { headers: HEADERS }, 4e3);
      if (res.ok) {
        const text = await res.text();
        if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
          const data = JSON.parse(text);
          if (data && (data.title || data.images || data.featured_image)) {
            if (!extractedStoreName) {
              try {
                const pageRes = await fetchWithTimeout(productUrl, { headers: HEADERS }, 3500);
                if (pageRes.ok) {
                  const pHtml = await pageRes.text();
                  const $p = cheerio2.load(pHtml);
                  extractedStoreName = extractStoreName($p, productUrl, pHtml);
                }
              } catch (_) {
              }
            }
            const extracted = extractShopifyImages(data, productUrl, extractedStoreName);
            productTitle = extracted.name || productTitle;
            if (extracted.storeName) extractedStoreName = extracted.storeName;
            variants = extracted.variants;
            for (const img of extracted.images) {
              imageCandidates.push({
                url: img.url,
                type: img.type,
                variant: img.variant
              });
            }
            shopifyJsonSucceeded = true;
          }
        } else {
          console.log(`Shopify JS response for ${shopifyInfo.jsonUrl} was HTML/invalid JSON, falling back to HTML parser.`);
        }
      }
    } catch (e) {
      console.log(`Could not fetch Shopify JS endpoint (${shopifyInfo.jsonUrl}), falling back to HTML parser.`);
    }
  }
  let weeblyJsonSucceeded = false;
  if (platform === "weebly") {
    try {
      let prodHtml = "";
      const resHtml = await fetchWithTimeout(productUrl, { headers: HEADERS }, 4e3);
      if (resHtml.ok) {
        prodHtml = await resHtml.text();
        const $prod = cheerio2.load(prodHtml);
        const bootstrapMatch = prodHtml.match(/window\.__BOOTSTRAP_STATE__\s*=\s*({.*?});/s) || prodHtml.match(/window\.__BOOTSTRAP_STATE__\s*=\s*(.*?);/);
        let bootstrapState = null;
        if (bootstrapMatch) {
          bootstrapState = JSON.parse(bootstrapMatch[1]);
        }
        if (bootstrapState) {
          const classicSiteID = bootstrapState.siteData?.site?.properties?.classicSiteID;
          const classicUserID = bootstrapState.siteData?.user?.id;
          const siteCatalogVersion = bootstrapState.siteData?.site?.properties?.siteCatalogVersion;
          const urlObj = new URL(productUrl);
          const pathSegments = urlObj.pathname.split("/").filter(Boolean);
          const lastSegment = pathSegments[pathSegments.length - 1];
          if (classicUserID && classicSiteID && lastSegment && /^\d+$/.test(lastSegment)) {
            const prodApiUrl = `https://cdn5.editmysite.com/app/store/api/v28/editor/users/${classicUserID}/sites/${classicSiteID}/products/${lastSegment}?cache-version=${siteCatalogVersion}`;
            const apiRes = await fetchWithTimeout(prodApiUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                "Accept": "application/json"
              }
            }, 4e3);
            if (apiRes.ok) {
              const apiData = await apiRes.json();
              if (apiData && apiData.data) {
                const item = apiData.data;
                productTitle = item.name || productTitle;
                if (item.thumbnail && item.thumbnail.data && item.thumbnail.data.absolute_url) {
                  imageCandidates.push({
                    url: item.thumbnail.data.absolute_url,
                    type: "Main",
                    variant: "General"
                  });
                } else if (item.thumbnail && item.thumbnail.data && item.thumbnail.data.url) {
                  imageCandidates.push({
                    url: item.thumbnail.data.url,
                    type: "Main",
                    variant: "General"
                  });
                }
                $prod("img").each((i, el) => {
                  const src = $prod(el).attr("src");
                  const dataSrc = $prod(el).attr("data-src") || $prod(el).attr("data-lazy-src") || $prod(el).attr("data-original");
                  const alt = $prod(el).attr("alt")?.trim() || "";
                  if (src && !src.startsWith("data:image/") && !src.includes("universal_product_placeholder")) {
                    imageCandidates.push({ url: src, type: "Gallery", variant: alt || void 0 });
                  }
                  if (dataSrc && !dataSrc.startsWith("data:image/") && !dataSrc.includes("universal_product_placeholder")) {
                    imageCandidates.push({ url: dataSrc, type: "Gallery", variant: alt || void 0 });
                  }
                });
                weeblyJsonSucceeded = true;
              }
            }
          }
        }
      }
    } catch (e) {
      console.log("Could not fetch Weebly API product details, falling back to HTML parser:", e);
    }
  }
  if (!shopifyJsonSucceeded && !weeblyJsonSucceeded) {
    let html = "";
    try {
      const res = await fetchWithTimeout(productUrl, { headers: HEADERS }, 4e3);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      html = await res.text();
    } catch (e) {
      throw new Error(`Could not fetch product page ${productUrl}: ${e.message}`);
    }
    const $ = cheerio2.load(html);
    if (!extractedStoreName) {
      extractedStoreName = extractStoreName($, productUrl, html);
    }
    const cleanCandidateTitle = (raw) => {
      if (!raw) return "";
      let t = raw.trim();
      if (/^(shopping cart|cart|checkout|bag|products?|home|search|menu|my account|untitled)$/i.test(t)) return "";
      const delims = [" | ", " \u2013 ", " \u2014 ", " \u2022 ", " - "];
      for (const d of delims) {
        if (t.includes(d)) {
          const parts = t.split(d);
          if (extractedStoreName && parts[parts.length - 1].toLowerCase().includes(extractedStoreName.toLowerCase())) {
            t = parts.slice(0, parts.length - 1).join(d).trim();
          } else if (parts.length === 2 && parts[1].length < 35 && !parts[0].toLowerCase().includes("cart")) {
            t = parts[0].trim();
          }
        }
      }
      return t;
    };
    if (!productTitle) {
      const h1Specific = $('h1.product-title, h1.product__title, h1.page-title, h1[itemprop="name"], [itemprop="name"] h1, h1:not([class*="cart"]):not([class*="bag"])').first().text().trim();
      const ogTitle = $('meta[property="og:title"]').attr("content")?.trim() || "";
      const h1First = $("h1").first().text().trim();
      const docTitle = $("title").text().trim();
      productTitle = cleanCandidateTitle(h1Specific) || cleanCandidateTitle(ogTitle) || cleanCandidateTitle(h1First) || cleanCandidateTitle(docTitle) || "";
    }
    $('script[type="application/ld+json"]').each((i, el) => {
      try {
        const jsonText = $(el).html();
        if (!jsonText) return;
        const schema = JSON.parse(jsonText);
        const findProductSchema = (obj) => {
          if (!obj) return null;
          if (obj["@type"] === "Product") return obj;
          if (obj["@graph"] && Array.isArray(obj["@graph"])) {
            return obj["@graph"].find((item) => item["@type"] === "Product");
          }
          if (Array.isArray(obj)) {
            return obj.find((item) => item["@type"] === "Product");
          }
          return null;
        };
        const prod = findProductSchema(schema);
        if (prod) {
          if (prod.name && (!productTitle || /^(shopping cart|cart|product)$/i.test(productTitle))) {
            const cleaned = cleanCandidateTitle(prod.name);
            if (cleaned) productTitle = cleaned;
          }
          if (prod.image) {
            const imgs = Array.isArray(prod.image) ? prod.image : [prod.image];
            imgs.forEach((imgUrl) => {
              let urlToPush = "";
              if (typeof imgUrl === "string") urlToPush = imgUrl;
              else if (typeof imgUrl === "object" && imgUrl.url) urlToPush = imgUrl.url;
              if (urlToPush) {
                imageCandidates.push({
                  url: urlToPush,
                  type: "Main",
                  variant: "General"
                });
              }
            });
          }
        }
      } catch (err) {
      }
    });
    const ogImage = $('meta[property="og:image"]').attr("content") || $('meta[property="og:image:secure_url"]').attr("content");
    if (ogImage) {
      imageCandidates.push({ url: ogImage, type: "Main", variant: "General" });
    }
    const twitterImage = $('meta[name="twitter:image"]').attr("content");
    if (twitterImage) {
      imageCandidates.push({ url: twitterImage, type: "Main", variant: "General" });
    }
    $("img").each((i, el) => {
      const src = $(el).attr("src");
      const srcset = $(el).attr("srcset");
      const dataSrc = $(el).attr("data-src") || $(el).attr("data-lazy-src") || $(el).attr("data-original");
      const dataSrcset = $(el).attr("data-srcset");
      const alt = $(el).attr("alt")?.trim() || "";
      if (src && !src.startsWith("data:image/")) {
        imageCandidates.push({ url: src, type: "Gallery", variant: alt || void 0 });
      }
      if (dataSrc && !dataSrc.startsWith("data:image/")) {
        imageCandidates.push({ url: dataSrc, type: "Gallery", variant: alt || void 0 });
      }
      const parseSrcsetStr = (srcsetString) => {
        const parts = srcsetString.split(",");
        parts.forEach((part) => {
          const match = part.trim().split(/\s+/);
          if (match[0]) {
            imageCandidates.push({ url: match[0], type: "Gallery", variant: alt || void 0 });
          }
        });
      };
      if (srcset) parseSrcsetStr(srcset);
      if (dataSrcset) parseSrcsetStr(dataSrcset);
    });
    $("picture source").each((i, el) => {
      const srcset = $(el).attr("srcset") || $(el).attr("data-srcset");
      if (srcset) {
        const parts = srcset.split(",");
        parts.forEach((part) => {
          const match = part.trim().split(/\s+/);
          if (match[0]) {
            imageCandidates.push({ url: match[0], type: "Gallery", variant: "General" });
          }
        });
      }
    });
  }
  const productDataId = `prod-${Date.now()}-${Math.floor(Math.random() * 1e3)}`;
  const finalImages = [];
  const uniqueUrls = /* @__PURE__ */ new Set();
  job.progress.currentStep = `Extracting images for: ${productTitle}`;
  saveJob(jobId, job);
  const normalizedCandidates = [];
  for (const cand of imageCandidates) {
    if (!cand.url || cand.url.startsWith("data:")) continue;
    try {
      const resolvedUrl = new URL(cand.url, productUrl).toString();
      const highResUrl = getHighResImageUrl(resolvedUrl, platform);
      const urlObj = new URL(highResUrl);
      const normKey = urlObj.origin + urlObj.pathname;
      const pathLower = urlObj.pathname.toLowerCase();
      const hasImageExt = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".bmp", ".tiff", ".ico"].some((ext) => pathLower.endsWith(ext));
      const hasProductPattern = pathLower.includes("/products/") || pathLower.includes("/product/") || pathLower.includes("/collections/") || pathLower.includes("/category/") || pathLower.includes("/item/");
      const isWebpageExtension = [".html", ".htm", ".php", ".asp", ".aspx", ".jsp"].some((ext) => pathLower.endsWith(ext));
      if ((hasProductPattern || isWebpageExtension) && !hasImageExt) {
        continue;
      }
      const nonProductKeywords = [
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
        "cart",
        "payment",
        "trustpilot",
        "visa",
        "mastercard",
        "paypal",
        "app-store",
        "google-pay",
        "apple-pay",
        "star-rating",
        "star.svg",
        "menu",
        "arrow",
        "avatar",
        "user",
        "trust",
        "security",
        "loading",
        "spinner",
        "checkout",
        "button",
        "search",
        "placeholder",
        "feedback",
        "newsletter",
        "widget",
        "loader",
        "favicon"
      ];
      const variantTextLower = (cand.variant || "").toLowerCase();
      const filenameLower = pathLower.split("/").pop() || "";
      const isNonProductGraphic2 = nonProductKeywords.some(
        (keyword) => pathLower.includes(keyword) || variantTextLower.includes(keyword) || filenameLower.includes(keyword)
      );
      if (isNonProductGraphic2) {
        continue;
      }
      if (job.options.removeDuplicates && uniqueUrls.has(normKey)) {
        job.progress.duplicatesRemoved++;
        continue;
      }
      uniqueUrls.add(normKey);
      normalizedCandidates.push({
        url: highResUrl,
        originalUrl: resolvedUrl,
        variant: cand.variant,
        type: cand.type
      });
    } catch (e) {
    }
  }
  job.progress.imagesFound += normalizedCandidates.length;
  saveJob(jobId, job);
  if (!extractedStoreName) {
    extractedStoreName = extractStoreName(null, productUrl);
  }
  const cleanStoreName = sanitizeFilename2(extractedStoreName || "Store");
  let imgIndex = 1;
  for (const cand of normalizedCandidates) {
    if (isJobCancelled(jobId)) return null;
    job.progress.currentStep = `Downloading image ${imgIndex} of ${normalizedCandidates.length} for ${productTitle}...`;
    saveJob(jobId, job);
    const imageId = `img-${Date.now()}-${imgIndex}`;
    const cleanProdName = sanitizeFilename2(productTitle);
    let variantSuffix = cand.variant && cand.variant !== "General" && cand.variant !== "Default" ? ` - ${sanitizeFilename2(cand.variant)}` : "";
    if (variantSuffix.length > 30) variantSuffix = variantSuffix.substring(0, 30);
    const extension = path.extname(new URL(cand.url).pathname) || ".jpg";
    const finalExtension = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(extension.toLowerCase()) ? extension : ".jpg";
    const filename = `${cleanStoreName} - ${cleanProdName}${variantSuffix} - ${String(imgIndex).padStart(2, "0")}${finalExtension}`;
    try {
      const response = await fetchWithTimeout(cand.url, { headers: HEADERS }, 3500);
      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") || "image/jpeg";
      if (!contentType.startsWith("image/") || contentType.includes("html") || contentType.includes("xml")) {
        throw new Error(`Invalid format. Content-type was ${contentType}`);
      }
      const dims = getImageDimensions(buffer);
      const resolution = dims ? `${dims.width} x ${dims.height}` : "1200 x 1200";
      const sizeStr = formatBytes(buffer.length);
      saveImageBuffer(`${jobId}_${productDataId}_${imageId}`, buffer);
      finalImages.push({
        id: imageId,
        filename,
        originalUrl: cand.originalUrl,
        resolution,
        size: sizeStr,
        variant: cand.variant || "General",
        type: cand.type,
        contentType,
        downloadStatus: "Downloaded"
      });
      job.progress.imagesDownloaded++;
    } catch (err) {
      console.error(`Failed to download image ${cand.url}:`, err);
      job.progress.imagesFailed++;
      finalImages.push({
        id: imageId,
        filename,
        originalUrl: cand.originalUrl,
        resolution: "Unknown",
        size: "0 Bytes",
        variant: cand.variant || "General",
        type: cand.type,
        contentType: "image/jpeg",
        downloadStatus: "Failed",
        error: err.message || "Failed request"
      });
      job.failedDownloads.push({ url: cand.url, error: err.message || "Network error" });
    }
    imgIndex++;
    saveJob(jobId, job);
  }
  const uniqueVariantsList = Array.from(new Set(finalImages.map((img) => img.variant).filter(Boolean)));
  return {
    id: productDataId,
    name: productTitle,
    storeName: extractedStoreName,
    url: productUrl,
    images: finalImages,
    variants: uniqueVariantsList,
    platform
  };
}
async function simulateDemoExtraction(job) {
  const jobId = job.jobId;
  const isListing = job.mode === "collection" || job.url.includes("collection") || job.url.includes("category");
  job.detectedPlatform = job.detectedPlatform || "Shopify";
  job.storeName = job.storeName || "Demo Store";
  job.progress.currentStep = "Initiating Sandbox Crawler...";
  job.progress.percent = 10;
  saveJob(jobId, job);
  await sleep(600);
  const mockImages = {
    sweater: [
      { url: "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=1200&q=80", variant: "Off-White" },
      { url: "https://images.unsplash.com/photo-1574169208507-84376144848b?auto=format&fit=crop&w=1200&q=80", variant: "Navy Blue" },
      { url: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=80", variant: "Dusty Rose" }
    ],
    shirt: [
      { url: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=1200&q=80", variant: "Classic White" },
      { url: "https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=1200&q=80", variant: "Soft Blue" }
    ],
    jacket: [
      { url: "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?auto=format&fit=crop&w=1200&q=80", variant: "Indigo Denim" }
    ]
  };
  const demoProducts = [
    {
      name: "Puffy Sleeve Sweater Top",
      url: "https://example.com/products/puffy-sleeve-sweater-top",
      images: mockImages.sweater
    },
    {
      name: "Classic Cotton Shirt",
      url: "https://example.com/products/classic-cotton-shirt",
      images: mockImages.shirt
    },
    {
      name: "Denim Utility Jacket",
      url: "https://example.com/products/denim-utility-jacket",
      images: mockImages.jacket
    }
  ];
  const productsToProcess = isListing ? demoProducts : [demoProducts[0]];
  job.progress.productsFound = productsToProcess.length;
  job.progress.percent = 25;
  saveJob(jobId, job);
  await sleep(600);
  let productIdx = 1;
  for (const dp of productsToProcess) {
    if (isJobCancelled(jobId)) return;
    job.progress.currentProductIndex = productIdx;
    job.progress.currentProductName = dp.name;
    job.progress.currentStep = `Scanning product page for: ${dp.name}...`;
    saveJob(jobId, job);
    await sleep(800);
    const productDataId = `prod-demo-${productIdx}-${Date.now()}`;
    const demoStoreName = "Demo Store";
    const productImages = [];
    const uniqueVariants = [];
    let imgIdx = 1;
    for (const imgSpec of dp.images) {
      if (isJobCancelled(jobId)) return;
      job.progress.currentStep = `Downloading image ${imgIdx} of ${dp.images.length} for ${dp.name}...`;
      saveJob(jobId, job);
      const imageId = `img-demo-${productIdx}-${imgIdx}`;
      const extension = ".jpg";
      const cleanStore = sanitizeFilename2(demoStoreName);
      const cleanProdName = sanitizeFilename2(dp.name);
      const cleanVariant = sanitizeFilename2(imgSpec.variant);
      const filename = `${cleanStore} - ${cleanProdName} - ${cleanVariant} - ${String(imgIdx).padStart(2, "0")}${extension}`;
      try {
        const res = await fetchWithTimeout(imgSpec.url, {}, 3500);
        if (!res.ok) throw new Error("Fetch failed");
        const buffer = Buffer.from(await res.arrayBuffer());
        saveImageBuffer(`${jobId}_${productDataId}_${imageId}`, buffer);
        const dims = getImageDimensions(buffer);
        const resolution = dims ? `${dims.width} x ${dims.height}` : "1200 x 800";
        const sizeStr = formatBytes(buffer.length);
        productImages.push({
          id: imageId,
          filename,
          originalUrl: imgSpec.url,
          resolution,
          size: sizeStr,
          variant: imgSpec.variant,
          type: imgIdx === 1 ? "Main" : "Variant",
          contentType: "image/jpeg",
          downloadStatus: "Downloaded"
        });
        if (!uniqueVariants.includes(imgSpec.variant)) {
          uniqueVariants.push(imgSpec.variant);
        }
        job.progress.imagesDownloaded++;
      } catch (err) {
        job.progress.imagesFailed++;
        productImages.push({
          id: imageId,
          filename,
          originalUrl: imgSpec.url,
          resolution: "1200 x 800",
          size: "0 Bytes",
          variant: imgSpec.variant,
          type: "Variant",
          contentType: "image/jpeg",
          downloadStatus: "Failed",
          error: "Simulated network timeout"
        });
        job.failedDownloads.push({ url: imgSpec.url, error: "Sandbox Simulated Timeout" });
      }
      job.progress.imagesFound++;
      imgIdx++;
      saveJob(jobId, job);
      await sleep(300);
    }
    job.products.push({
      id: productDataId,
      name: dp.name,
      storeName: "Demo Store",
      url: dp.url,
      images: productImages,
      variants: uniqueVariants,
      platform: "Shopify"
    });
    productIdx++;
    job.progress.percent = Math.floor(25 + (productIdx - 1) / productsToProcess.length * 70);
    saveJob(jobId, job);
  }
  if (isJobCancelled(jobId)) return;
  job.status = "completed";
  job.progress.percent = 100;
  job.progress.currentStep = "Sandbox extraction complete. All buffers successfully validated and stored!";
  saveJob(jobId, job);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
app.use((err, req, res, next) => {
  console.error("Unhandled Express route error:", err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({
    error: err.message || "An internal server error occurred."
  });
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Configuring Vite Development Middleware...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    console.log("Serving static production assets from /dist...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Image Extractor Server booted successfully on http://localhost:${PORT}`);
  });
}
if (!process.env.VERCEL) {
  startServer();
}
var server_default = app;

// api/index.ts
var index_default = server_default;
export {
  index_default as default
};
