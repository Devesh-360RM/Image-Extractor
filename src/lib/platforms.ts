import * as cheerio from "cheerio";

export type SupportedPlatform =
  | "Shopify"
  | "WooCommerce"
  | "WordPress"
  | "Square Online"
  | "Lightspeed eCom"
  | "Ecwid"
  | "BigCommerce"
  | "Wix Stores"
  | "Squarespace Commerce"
  | "Magento / Adobe Commerce"
  | "PrestaShop"
  | "Shopware"
  | "Webflow Ecommerce"
  | "Shift4Shop"
  | "Clover"
  | "GoDaddy Online Store"
  | "Volusion"
  | "Salesforce Commerce Cloud"
  | "Custom E-Commerce";

export interface DetectionResult {
  platform: SupportedPlatform;
  confidence: number; // 0.0 to 1.0
  reasons: string[];
}

export function detectPlatform(
  urlStr: string,
  html: string,
  $: cheerio.CheerioAPI
): DetectionResult {
  const reasons: string[] = [];
  let urlObj: URL | null = null;
  try {
    urlObj = new URL(urlStr);
  } catch {}

  const hostname = (urlObj?.hostname || "").toLowerCase();
  const lowerHtml = html.toLowerCase();

  // 1. Check Generator Meta Tags
  const generator = ($('meta[name="generator"]').attr("content") || "").toLowerCase();

  // 2. Check Hostnames & CDN Script URLs
  const scriptSources: string[] = [];
  $("script[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (src) scriptSources.push(src.toLowerCase());
  });
  const allScripts = scriptSources.join(" ");

  // 3. Shopify
  if (
    hostname.includes("myshopify.com") ||
    lowerHtml.includes("window.shopify") ||
    lowerHtml.includes("cdn.shopify.com") ||
    allScripts.includes("cdn.shopify.com") ||
    $('link[href*="cdn.shopify.com"]').length > 0
  ) {
    reasons.push("Shopify CDN and JS objects detected");
    return { platform: "Shopify", confidence: 0.98, reasons };
  }

  // 4. WooCommerce vs. standard WordPress
  const isWoo =
    lowerHtml.includes("woocommerce") ||
    $(".woocommerce, .woocommerce-page, .woocommerce-product-gallery, .product_type_simple").length > 0 ||
    $('form.variations_form[data-product_variations]').length > 0 ||
    $('link[rel*="woocommerce"], script[src*="woocommerce"]').length > 0;

  const isWp =
    generator.includes("wordpress") ||
    lowerHtml.includes("/wp-content/") ||
    lowerHtml.includes("/wp-includes/") ||
    $('link[rel="https://api.w.org/"]').length > 0;

  if (isWoo) {
    reasons.push("WooCommerce gallery, variation attributes, or plugins detected");
    return { platform: "WooCommerce", confidence: 0.95, reasons };
  }

  if (isWp) {
    reasons.push("WordPress theme assets or wp-content detected");
    return { platform: "WordPress", confidence: 0.90, reasons };
  }

  // 5. Square Online / square.site
  if (
    hostname.includes("square.site") ||
    hostname.includes("squareup.com") ||
    lowerHtml.includes("window.__bootstrap_state__") ||
    lowerHtml.includes("cdn2.editmysite.com") ||
    lowerHtml.includes("square-online")
  ) {
    reasons.push("Square Online / Weebly bootstrap state detected");
    return { platform: "Square Online", confidence: 0.95, reasons };
  }

  // 6. BigCommerce
  if (
    hostname.includes("mybigcommerce.com") ||
    lowerHtml.includes("cdn11.bigcommerce.com") ||
    lowerHtml.includes("window.bcstorefront") ||
    $('meta[name="platform"][content*="bigcommerce"]').length > 0 ||
    allScripts.includes("bigcommerce")
  ) {
    reasons.push("BigCommerce CDN and storefront scripts detected");
    return { platform: "BigCommerce", confidence: 0.95, reasons };
  }

  // 7. Lightspeed eCom (C-Series WebshopApp or E-Series with active Lightspeed branding or footer)
  if (
    lowerHtml.includes("powered by lightspeed") ||
    lowerHtml.includes("shoplightspeed.com") ||
    lowerHtml.includes("lightspeed") ||
    lowerHtml.includes("cdn.webshopapp.com") ||
    lowerHtml.includes("seoshop") ||
    hostname.includes("shoplightspeed.com") ||
    hostname.includes("webshopapp.com") ||
    allScripts.includes("webshopapp.com") ||
    lowerHtml.includes("ec-lightspeed-branding") ||
    $('meta[name="generator"][content*="lightspeed"]').length > 0
  ) {
    reasons.push("Lightspeed eCom / POS branding detected");
    return { platform: "Lightspeed eCom", confidence: 0.98, reasons };
  }

  // 8. Ecwid / company.site
  if (
    hostname.includes("company.site") ||
    hostname.includes("ecwid.com") ||
    lowerHtml.includes("app.ecwid.com") ||
    lowerHtml.includes("ecwid-product") ||
    allScripts.includes("ecwid.com/script.js")
  ) {
    reasons.push("Ecwid widget or company.site domain detected");
    return { platform: "Ecwid", confidence: 0.95, reasons };
  }

  // 9. Wix Stores
  if (
    generator.includes("wix") ||
    lowerHtml.includes("wix-warmup-data") ||
    lowerHtml.includes("static.parastorage.com") ||
    lowerHtml.includes("wixstores") ||
    allScripts.includes("parastorage.com")
  ) {
    reasons.push("Wix Stores platform and parastorage CDN detected");
    return { platform: "Wix Stores", confidence: 0.95, reasons };
  }

  // 10. Squarespace Commerce
  if (
    generator.includes("squarespace") ||
    lowerHtml.includes("static1.squarespace.com") ||
    lowerHtml.includes("squarespace-commerce") ||
    $('meta[name="squarespace-commerce"]').length > 0
  ) {
    reasons.push("Squarespace Commerce engine detected");
    return { platform: "Squarespace Commerce", confidence: 0.95, reasons };
  }

  // 11. Magento / Adobe Commerce
  if (
    lowerHtml.includes("mage/") ||
    lowerHtml.includes("magento") ||
    lowerHtml.includes("requirejs-config.js") && lowerHtml.includes("pub/static") ||
    $('script[type="text/x-magento-init"]').length > 0 ||
    $('body.catalog-product-view').length > 0
  ) {
    reasons.push("Magento x-magento-init and catalog view classes detected");
    return { platform: "Magento / Adobe Commerce", confidence: 0.93, reasons };
  }

  // 12. PrestaShop
  if (
    generator.includes("prestashop") ||
    lowerHtml.includes("prestashop") ||
    lowerHtml.includes("var prestashop =") ||
    $("#product-details").length > 0 && lowerHtml.includes("js/theme.js")
  ) {
    reasons.push("PrestaShop global state and meta tags detected");
    return { platform: "PrestaShop", confidence: 0.92, reasons };
  }

  // 13. Shopware
  if (
    generator.includes("shopware") ||
    lowerHtml.includes("shopware") ||
    lowerHtml.includes("bundles/storefront/")
  ) {
    reasons.push("Shopware storefront bundles detected");
    return { platform: "Shopware", confidence: 0.90, reasons };
  }

  // 14. Webflow Ecommerce
  if (
    generator.includes("webflow") ||
    lowerHtml.includes("data-wf-page") ||
    $(".w-commerce-commerceaddtocartform").length > 0
  ) {
    reasons.push("Webflow Ecommerce cart component detected");
    return { platform: "Webflow Ecommerce", confidence: 0.92, reasons };
  }

  // 15. Shift4Shop (formerly 3dcart)
  if (
    lowerHtml.includes("3dcart") ||
    lowerHtml.includes("shift4shop") ||
    lowerHtml.includes("assets/templates/common")
  ) {
    reasons.push("Shift4Shop / 3dcart templates detected");
    return { platform: "Shift4Shop", confidence: 0.90, reasons };
  }

  // 16. Clover
  if (
    hostname.includes("clover.com") ||
    lowerHtml.includes("clover-commerce") ||
    lowerHtml.includes("api.clover.com")
  ) {
    reasons.push("Clover storefront or API integration detected");
    return { platform: "Clover", confidence: 0.90, reasons };
  }

  // 17. GoDaddy Online Store
  if (
    lowerHtml.includes("godaddy") ||
    lowerHtml.includes("onlinestore.godaddy.com") ||
    lowerHtml.includes("secureserver.net")
  ) {
    reasons.push("GoDaddy Online Store platform detected");
    return { platform: "GoDaddy Online Store", confidence: 0.88, reasons };
  }

  // 18. Volusion
  if (
    lowerHtml.includes("volusion") ||
    lowerHtml.includes("a/v/vspfiles/")
  ) {
    reasons.push("Volusion vspfiles asset paths detected");
    return { platform: "Volusion", confidence: 0.88, reasons };
  }

  // 19. Salesforce Commerce Cloud (Demandware)
  if (
    lowerHtml.includes("demandware.store") ||
    lowerHtml.includes("demandware.static") ||
    lowerHtml.includes("dw.js")
  ) {
    reasons.push("Salesforce Commerce Cloud (Demandware) static asset domain detected");
    return { platform: "Salesforce Commerce Cloud", confidence: 0.92, reasons };
  }

  // Fallback: Custom E-Commerce
  reasons.push("Generic HTML structure with Product Schema / standard gallery");
  return {
    platform: "Custom E-Commerce",
    confidence: 0.75,
    reasons
  };
}
