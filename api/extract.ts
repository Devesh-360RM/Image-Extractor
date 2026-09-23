import {
  extractProductFromUrl,
  extractCollectionFromUrl
} from "../src/lib/extractorEngine.ts";

export default async function handler(req: any, res: any) {
  // CORS & Options pre-flight
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

    const targetUrl = url || (Array.isArray(urls) && urls[0]);
    const jobId = `job-${Date.now()}`;

    // 1. Collection Mode extraction
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

      const formattedProducts = collectionResult.products.map((prod) => ({
        id: prod.id,
        name: prod.name,
        storeName: prod.storeName,
        url: prod.url,
        variants: prod.variants,
        platform: prod.platform,
        confidence: prod.confidence,
        images: prod.images.map((img) => ({
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

      const formattedJob = {
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
        job: formattedJob
      });
    }

    // 2. Product Mode (or Auto)
    const result = await extractProductFromUrl(targetUrl);

    // If auto mode and single extraction found no images, attempt collection extraction
    if (!result.success && mode === "auto") {
      const collFallback = await extractCollectionFromUrl(targetUrl, 12);
      if (collFallback.success && collFallback.products.length > 0) {
        const totalImages = collFallback.products.reduce(
          (acc, p) => acc + p.images.length,
          0
        );
        const formattedProducts = collFallback.products.map((prod) => ({
          id: prod.id,
          name: prod.name,
          storeName: prod.storeName,
          url: prod.url,
          variants: prod.variants,
          platform: prod.platform,
          confidence: prod.confidence,
          images: prod.images.map((img) => ({
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
  } catch (err: any) {
    console.error("Vercel Extract API Error:", err);
    return res.status(500).json({
      error: err.message || "An unexpected error occurred during extraction.",
      status: "failed"
    });
  }
}
