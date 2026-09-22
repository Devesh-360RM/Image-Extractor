import * as cheerio from "cheerio";
import { validatePublicUrl, SECURE_FETCH_HEADERS } from "./security";
import { detectPlatform, SupportedPlatform } from "./platforms";

export interface CandidateImage {
  id: string;
  url: string; // Highest quality CDN URL
  originalUrl: string;
  variant: string;
  type: "Main" | "Variant" | "Gallery";
  filename: string;
  resolution?: string;
}

export interface ExtractedProduct {
  id: string;
  name: string;
  url: string;
  platform: SupportedPlatform;
  confidence: number;
  images: CandidateImage[];
  variants: string[];
}

export interface CollectionExtractionResult {
  success: boolean;
  platform: SupportedPlatform;
  confidence: number;
  products: ExtractedProduct[];
  stats: {
    successful: number;
    failed: number;
    skipped: number;
    totalDiscovered: number;
  };
  error?: string;
}

// 1. Convert protocol-relative URLs beginning with // into https://
export function normalizeProtocol(url: string): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (trimmed.startsWith("//")) {
    return "https:" + trimmed;
  }
  return trimmed;
}

// 2. Remove image dimension modifiers only when generating the highest-quality Shopify CDN URL
export function getShopifyHighResImageUrl(url: string): string {
  const normalized = normalizeProtocol(url);
  try {
    const parsed = new URL(normalized);

    // Only apply Shopify CDN cleanup to Shopify-hosted assets
    if (parsed.hostname.includes("cdn.shopify.com") || parsed.hostname.includes("myshopify.com")) {
      // Remove filename dimension modifiers: e.g. _1024x1024, _300x300, _large, _master, _crop_center
      const cleanPath = parsed.pathname.replace(
        /_(small|medium|large|compact|grande|1024x1024|2048x2048|\d+x\d*|master)(_crop_(?:center|top|bottom|left|right))?(\.[a-zA-Z0-9]+)$/i,
        "$3"
      );
      parsed.pathname = cleanPath;

      // Strip query parameters that restrict resolution, preserving cache version 'v' if present
      parsed.searchParams.delete("width");
      parsed.searchParams.delete("height");
      parsed.searchParams.delete("crop");
      parsed.searchParams.delete("max_width");
      parsed.searchParams.delete("max_height");

      return parsed.toString();
    }
  } catch {}
  return normalized;
}

// 3. Remove WordPress size suffixes (e.g. -300x300, -768x512) only when the original image is verified or likely full-size
export function cleanWordPressImageUrl(url: string): string {
  const normalized = normalizeProtocol(url);
  try {
    const parsed = new URL(normalized);
    if (parsed.pathname.includes("/wp-content/uploads/")) {
      const cleanPath = parsed.pathname.replace(/-\d+x\d+(\.[a-zA-Z0-9]+)$/i, "$1");
      parsed.pathname = cleanPath;
      return parsed.toString();
    }
  } catch {}
  return normalized;
}

// Verify if clean WordPress URL exists asynchronously
export async function verifyWordPressFullSizeUrl(
  candidateUrl: string,
  timeoutMs = 2500
): Promise<string> {
  const cleaned = cleanWordPressImageUrl(candidateUrl);
  if (cleaned === candidateUrl) return candidateUrl;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headRes = await fetch(cleaned, {
      method: "HEAD",
      headers: SECURE_FETCH_HEADERS,
      signal: controller.signal
    });
    clearTimeout(timer);

    if (headRes.ok && headRes.status === 200) {
      return cleaned;
    }
  } catch {}

  return candidateUrl;
}

// 4. Parse srcset attribute and extract largest available image
export function getLargestFromSrcset(srcset: string, baseUrl: string): string | null {
  if (!srcset) return null;
  const entries = srcset.split(",").map((s) => s.trim()).filter(Boolean);
  let largestUrl: string | null = null;
  let maxDescriptor = 0;

  for (const entry of entries) {
    const parts = entry.split(/\s+/);
    const rawUrl = parts[0];
    const descriptor = parts[1] || "";

    let score = 1;
    if (descriptor.endsWith("w")) {
      score = parseInt(descriptor.replace("w", ""), 10) || 1;
    } else if (descriptor.endsWith("x")) {
      score = (parseFloat(descriptor.replace("x", "")) || 1) * 1000;
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

// 5. Detect Shopify product URLs and format {origin}/products/{handle}.js
export function parseShopifyProductUrl(rawUrl: string): {
  isShopifyProduct: boolean;
  jsonUrl: string | null;
  origin: string | null;
  handle: string | null;
} {
  try {
    const parsed = new URL(rawUrl.trim());
    const pathname = parsed.pathname;
    const match = pathname.match(/\/products\/([^\/\?#]+)/);
    if (match && match[1]) {
      const handle = match[1].replace(/\.js$/, "");
      return {
        isShopifyProduct: true,
        origin: parsed.origin,
        handle,
        jsonUrl: `${parsed.origin}/products/${handle}.js`
      };
    }
  } catch {}
  return {
    isShopifyProduct: false,
    jsonUrl: null,
    origin: null,
    handle: null
  };
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "").trim();
}

function getCanonicalUrlKey(url: string): string {
  try {
    const parsed = new URL(normalizeProtocol(url));
    return `${parsed.hostname}${parsed.pathname}`.toLowerCase();
  } catch {
    return url.toLowerCase().split("?")[0];
  }
}

// Filter non-product UI graphics
export function isNonProductGraphic(url: string, contextText = ""): boolean {
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

// 6. Extract product images from the Shopify JSON response
export function extractShopifyImages(
  shopifyData: any,
  originalPageUrl: string
): ExtractedProduct {
  const title = shopifyData.title || "Product";
  const candidates: CandidateImage[] = [];
  const seenCanonicalUrls = new Set<string>();
  const variantsList: string[] = [];

  const addCandidate = (
    rawUrl: string | undefined | null,
    variantName: string,
    type: "Main" | "Variant" | "Gallery"
  ) => {
    if (!rawUrl || typeof rawUrl !== "string") return;
    const httpsUrl = normalizeProtocol(rawUrl);
    if (!httpsUrl || httpsUrl.startsWith("data:") || isNonProductGraphic(httpsUrl)) return;

    const highResUrl = getShopifyHighResImageUrl(httpsUrl);
    const key = getCanonicalUrlKey(highResUrl);

    if (seenCanonicalUrls.has(key)) return;
    seenCanonicalUrls.add(key);

    const index = candidates.length + 1;
    const cleanProd = sanitizeFilename(title);
    const cleanVar = variantName && variantName !== "General" ? ` - ${sanitizeFilename(variantName)}` : "";
    const filename = `${cleanProd}${cleanVar} - ${String(index).padStart(2, "0")}.jpg`;

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

  // 1. Featured image (Main)
  if (shopifyData.featured_image) {
    const featUrl =
      typeof shopifyData.featured_image === "string"
        ? shopifyData.featured_image
        : shopifyData.featured_image.src || shopifyData.featured_image.url;
    addCandidate(featUrl, "Default", "Main");
  }

  // 2. Variant featured images
  if (Array.isArray(shopifyData.variants)) {
    for (const v of shopifyData.variants) {
      const vTitle = v.title && v.title !== "Default Title" ? String(v.title) : "Variant";
      if (vTitle && !variantsList.includes(vTitle) && vTitle !== "Variant") {
        variantsList.push(vTitle);
      }

      let vImgUrl: string | null = null;
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

  // 3. Images array (Gallery)
  if (Array.isArray(shopifyData.images)) {
    for (const img of shopifyData.images) {
      const imgUrl = typeof img === "string" ? img : img?.src || img?.url;
      addCandidate(imgUrl, "General", candidates.length === 0 ? "Main" : "Gallery");
    }
  }

  return {
    id: `prod-shopify-${Date.now()}`,
    name: title,
    url: originalPageUrl,
    platform: "Shopify",
    confidence: 0.98,
    images: candidates,
    variants: variantsList
  };
}

// 7. Extract WooCommerce Product Data and Variations
export function extractWooCommerceImages(
  $: cheerio.CheerioAPI,
  baseUrl: string,
  html: string
): ExtractedProduct {
  let title =
    $('h1.product_title, .woocommerce-products-header__title').first().text().trim() ||
    $('meta[property="og:title"]').attr("content") ||
    $("h1").first().text().trim() ||
    "WooCommerce Product";

  if (title.includes("|")) title = title.split("|")[0].trim();
  if (title.includes(" - ")) title = title.split(" - ")[0].trim();

  const candidates: CandidateImage[] = [];
  const seenCanonicalUrls = new Set<string>();
  const variantsList: string[] = [];

  const addCandidate = (
    rawUrl: string | undefined | null,
    variantName: string,
    type: "Main" | "Variant" | "Gallery"
  ) => {
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
      const cleanProd = sanitizeFilename(title);
      const cleanVar = variantName && variantName !== "General" ? ` - ${sanitizeFilename(variantName)}` : "";
      const filename = `${cleanProd}${cleanVar} - ${String(index).padStart(2, "0")}.jpg`;

      candidates.push({
        id: `img-woo-${index}`,
        url: highRes,
        originalUrl: resolved,
        variant: variantName || "General",
        type: candidates.length === 0 ? "Main" : type,
        filename,
        resolution: "Full-size WordPress Attachment"
      });
    } catch {}
  };

  // A. Variations Form Embedded Data: data-product_variations
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

            // Extract variation image
            const imgObj = item.image;
            if (imgObj) {
              const fullSrc = imgObj.full_src || imgObj.url || imgObj.src;
              if (fullSrc) {
                addCandidate(fullSrc, varTitle, "Variant");
              }
            }
          }
        }
      } catch {}
    }
  }

  // B. WooCommerce Product Gallery (Main & Additional gallery items)
  $(".woocommerce-product-gallery__image").each((_, el) => {
    const $el = $(el);
    const $link = $el.find("a").first();
    const $img = $el.find("img").first();

    const fullSize =
      $link.attr("href") ||
      $img.attr("data-large_image") ||
      $img.attr("data-src") ||
      $img.attr("data-lazy-src");

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

  // C. wp-post-image
  $("img.wp-post-image").each((_, el) => {
    const $img = $(el);
    const large = $img.attr("data-large_image") || $img.attr("src");
    addCandidate(large, "Main", "Main");
  });

  // D. JSON-LD fallback for WooCommerce
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || "{}");
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) {
        if (item["@type"] === "Product" || item.type === "Product") {
          if (Array.isArray(item.image)) {
            item.image.forEach((img: any) => {
              const u = typeof img === "string" ? img : img?.url || img?.contentUrl;
              addCandidate(u, "General", "Gallery");
            });
          } else if (typeof item.image === "string") {
            addCandidate(item.image, "Default", "Main");
          }
        }
      }
    } catch {}
  });

  // E. Fallback: og:image, twitter:image, wp-content/uploads/ images, and generic parser
  if (candidates.length === 0) {
    const ogImg =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content");
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
    url: baseUrl,
    platform: "WooCommerce",
    confidence: 0.95,
    images: candidates,
    variants: variantsList
  };
}

// 8. Generic Multi-Platform Cheerio Extractor
export function extractGenericPlatformImages(
  $: cheerio.CheerioAPI,
  baseUrl: string,
  platform: SupportedPlatform,
  confidence: number
): ExtractedProduct {
  let title =
    $('meta[property="og:title"]').attr("content") ||
    $('meta[name="twitter:title"]').attr("content") ||
    $("h1").first().text().trim() ||
    $("title").text().trim() ||
    "Product";

  if (title.includes("|")) title = title.split("|")[0].trim();
  if (title.includes(" - ")) title = title.split(" - ")[0].trim();

  const candidates: CandidateImage[] = [];
  const seenCanonicalUrls = new Set<string>();
  const variantsList: string[] = [];

  const addCandidate = (
    rawUrl: string | undefined | null,
    variantName: string,
    type: "Main" | "Variant" | "Gallery"
  ) => {
    if (!rawUrl || typeof rawUrl !== "string") return;
    const trimmed = rawUrl.trim();
    if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("javascript:")) return;
    if (isNonProductGraphic(trimmed, variantName)) return;

    try {
      const resolved = new URL(normalizeProtocol(trimmed), baseUrl).toString();

      // Apply platform-specific resolution enhancers
      let finalUrl = resolved;
      if (platform === "Shopify" || resolved.includes("cdn.shopify.com")) {
        finalUrl = getShopifyHighResImageUrl(resolved);
      } else if (platform === "WooCommerce" || platform === "WordPress" || resolved.includes("/wp-content/")) {
        finalUrl = cleanWordPressImageUrl(resolved);
      } else if (resolved.includes("editmysite.com")) {
        // Square Online: remove ?width=
        const u = new URL(resolved);
        u.searchParams.delete("width");
        finalUrl = u.toString();
      }

      const key = getCanonicalUrlKey(finalUrl);
      if (seenCanonicalUrls.has(key)) return;
      seenCanonicalUrls.add(key);

      const index = candidates.length + 1;
      const cleanProd = sanitizeFilename(title);
      const cleanVar = variantName && variantName !== "General" ? ` - ${sanitizeFilename(variantName)}` : "";
      const filename = `${cleanProd}${cleanVar} - ${String(index).padStart(2, "0")}.jpg`;

      candidates.push({
        id: `img-${index}`,
        url: finalUrl,
        originalUrl: resolved,
        variant: variantName || "General",
        type: candidates.length === 0 ? "Main" : type,
        filename,
        resolution: "Master / High Resolution"
      });
    } catch {}
  };

  // 1. JSON-LD structured data (Product schema)
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || "{}");
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) {
        if (item["@type"] === "Product" || item.type === "Product") {
          if (item.name && (!title || title === "Product")) title = item.name;
          if (Array.isArray(item.image)) {
            item.image.forEach((img: any) => {
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
    } catch {}
  });

  // 2. OpenGraph and Twitter Meta Tags
  const ogImage =
    $('meta[property="og:image"]').attr("content") ||
    $('meta[property="og:image:secure_url"]').attr("content");
  if (ogImage) addCandidate(ogImage, "Default", "Main");

  const twitterImage = $('meta[name="twitter:image"]').attr("content");
  if (twitterImage) addCandidate(twitterImage, "Default", "Gallery");

  // 3. Image Tags with High-Res / Zoom / Gallery attributes
  $("img, source").each((_, el) => {
    const $el = $(el);

    // Zoom and High-Res attributes
    const highRes =
      $el.attr("data-zoom-image") ||
      $el.attr("data-large_image") ||
      $el.attr("data-high-res") ||
      $el.attr("data-master") ||
      $el.attr("data-large") ||
      $el.attr("data-original") ||
      $el.attr("data-src") ||
      $el.attr("data-lazy-src");

    const alt = $el.attr("alt")?.trim() || "";

    if (highRes) {
      addCandidate(highRes, alt || "Gallery", "Gallery");
    }

    // Srcset evaluation (select largest candidate)
    const srcset = $el.attr("srcset") || $el.attr("data-srcset");
    if (srcset) {
      const largest = getLargestFromSrcset(srcset, baseUrl);
      if (largest) addCandidate(largest, alt || "Gallery", "Gallery");
    }

    // Standard src
    const src = $el.attr("src");
    if (src) addCandidate(src, alt || "Gallery", "Gallery");
  });

  // 4. CSS Background Images on product gallery elements
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
    url: baseUrl,
    platform,
    confidence,
    images: candidates,
    variants: variantsList
  };
}

// 9. Discover Product Links in a Collection / Category Page
export function discoverProductLinks(
  $: cheerio.CheerioAPI,
  baseUrl: string
): { url: string; name?: string }[] {
  const discovered: { url: string; name?: string }[] = [];
  const seen = new Set<string>();

  // A. Check JSON-LD ItemList
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
    } catch {}
  });

  // B. HTML Product Card Links
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

      // Avoid collection links, carts, pagination links, or social links
      if (
        lower === baseUrl.toLowerCase() ||
        lower.includes("/collections/") && !lower.includes("/products/") ||
        lower.includes("/category/") && !lower.includes("/product/") ||
        lower.includes("cart") ||
        lower.includes("checkout") ||
        lower.includes("account") ||
        lower.includes("#") ||
        seen.has(resolved)
      ) {
        return;
      }

      seen.add(resolved);
      const name = $(el).text().trim() || $(el).find("img").attr("alt")?.trim() || undefined;
      discovered.push({ url: resolved, name });
    } catch {}
  });

  return discovered;
}

// 10. Extract a single product with full platform detection and fallback
export async function extractProductFromUrl(targetUrl: string): Promise<{
  success: boolean;
  product?: ExtractedProduct;
  platform?: SupportedPlatform;
  confidence?: number;
  error?: string;
  statusCode?: number;
}> {
  // SSRF & URL Validation
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
    // 1. Check if Shopify product URL
    const shopifyInfo = parseShopifyProductUrl(cleanUrl);
    if (shopifyInfo.isShopifyProduct && shopifyInfo.jsonUrl) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const shopifyRes = await fetch(shopifyInfo.jsonUrl, {
          headers: SECURE_FETCH_HEADERS,
          signal: controller.signal
        });
        clearTimeout(timer);

        if (shopifyRes.ok) {
          const contentType = shopifyRes.headers.get("content-type") || "";
          if (contentType.includes("json") || contentType.includes("javascript")) {
            const data = await shopifyRes.json();
            if (data && (data.title || data.images || data.featured_image)) {
              const product = extractShopifyImages(data, cleanUrl);
              return {
                success: true,
                product,
                platform: "Shopify",
                confidence: 0.98
              };
            }
          }
        }
      } catch {}
    }

    // 2. Server-side fetch HTML with AbortController timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const htmlRes = await fetch(cleanUrl, {
      headers: SECURE_FETCH_HEADERS,
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!htmlRes.ok) {
      return {
        success: false,
        error: `Target server responded with HTTP ${htmlRes.status}`,
        statusCode: htmlRes.status >= 400 && htmlRes.status < 500 ? htmlRes.status : 502
      };
    }

    const html = await htmlRes.text();
    const $ = cheerio.load(html);

    // 3. Platform Detection
    const detection = detectPlatform(cleanUrl, html, $);

    let product: ExtractedProduct;
    if (detection.platform === "WooCommerce") {
      product = extractWooCommerceImages($, cleanUrl, html);
    } else {
      product = extractGenericPlatformImages($, cleanUrl, detection.platform, detection.confidence);
    }

    if (product.images.length === 0) {
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
  } catch (err: any) {
    const isTimeout = err.name === "AbortError" || err.message?.includes("aborted");
    return {
      success: false,
      error: isTimeout
        ? "Request timed out while connecting to the store."
        : `Extraction error: ${err.message || "Unknown error"}`,
      statusCode: isTimeout ? 504 : 500
    };
  }
}

// 11. Concurrency-limited Collection Extraction (Concurrency = 3)
export async function extractCollectionFromUrl(
  collectionUrl: string,
  maxProducts = 24
): Promise<CollectionExtractionResult> {
  const validation = validatePublicUrl(collectionUrl);
  if (!validation.isValid || !validation.normalizedUrl) {
    return {
      success: false,
      platform: "Custom E-Commerce",
      confidence: 0.0,
      products: [],
      stats: { successful: 0, failed: 0, skipped: 0, totalDiscovered: 0 },
      error: validation.error || "Invalid URL"
    };
  }

  const cleanUrl = validation.normalizedUrl;

  try {
    // 1. Fetch collection HTML
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(cleanUrl, {
      headers: SECURE_FETCH_HEADERS,
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) {
      return {
        success: false,
        platform: "Custom E-Commerce",
        confidence: 0.0,
        products: [],
        stats: { successful: 0, failed: 0, skipped: 0, totalDiscovered: 0 },
        error: `HTTP ${res.status} from collection page`
      };
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const detection = detectPlatform(cleanUrl, html, $);

    // 2. Discover product links
    const discovered = discoverProductLinks($, cleanUrl).slice(0, maxProducts);

    if (discovered.length === 0) {
      // If no product links found, treat this page as a single product fallback
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

    // 3. Process products in batches with concurrency = 3
    const CONCURRENCY = 3;
    const products: ExtractedProduct[] = [];
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
  } catch (err: any) {
    return {
      success: false,
      platform: "Custom E-Commerce",
      confidence: 0.0,
      products: [],
      stats: { successful: 0, failed: 0, skipped: 0, totalDiscovered: 0 },
      error: err.message || "Failed to process collection"
    };
  }
}
