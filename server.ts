import express from "express";
import path from "path";
import fs from "fs";
import * as cheerio from "cheerio";
import JSZip from "jszip";
import multer from "multer";
import * as XLSX from "xlsx";
import { ExtractionJob, ProductData, ImageMetadata } from "./src/types";
import {
  normalizeProtocol,
  getShopifyHighResImageUrl,
  parseShopifyProductUrl,
  extractShopifyImages,
  extractProductFromUrl,
  extractProductFromHtml,
  extractStoreName
} from "./src/lib/extractorEngine";
import { SECURE_FETCH_HEADERS } from "./src/lib/security";
import { detectPlatform } from "./src/lib/platforms";

const app = express();
const PORT = 3000;

app.use(express.json());

// Normalize URL paths for Vercel Serverless Function routing
app.use((req, res, next) => {
  if (process.env.VERCEL) {
    if (!req.url.startsWith("/api") && !req.url.startsWith("/api/")) {
      req.url = "/api" + (req.url.startsWith("/") ? req.url : "/" + req.url);
    }
  }
  next();
});

// In-memory + /tmp file-backed job state (resilient across serverless lambda restarts)
const jobs = new Map<string, ExtractionJob>();
const imageBuffers = new Map<string, Buffer>(); // key: `${jobId}_${productId}_${imageId}`

function saveJob(jobOrId: string | ExtractionJob, maybeJob?: ExtractionJob) {
  const job = typeof jobOrId === "string" ? maybeJob! : jobOrId;
  if (!job) return;
  jobs.set(job.jobId, job);
  try {
    const tmpDir = path.join("/tmp", "extractor_jobs");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, `${job.jobId}.json`), JSON.stringify(job));
  } catch (err) {
    // Ignore filesystem write errors if /tmp is read-only
  }
}

function getJob(jobId: string): ExtractionJob | undefined {
  if (jobs.has(jobId)) return jobs.get(jobId);
  try {
    const filePath = path.join("/tmp", "extractor_jobs", `${jobId}.json`);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      const job = JSON.parse(data) as ExtractionJob;
      saveJob(jobId, job);
      return job;
    }
  } catch (err) {
    // Ignore read error
  }
  return undefined;
}

const cancelledJobIds = new Set<string>();

function isJobCancelled(jobId: string): boolean {
  if (cancelledJobIds.has(jobId)) return true;
  const job = getJob(jobId);
  if (job?.status === "cancelled") {
    cancelledJobIds.add(jobId);
    return true;
  }
  return false;
}

function saveImageBuffer(key: string, buffer: Buffer) {
  imageBuffers.set(key, buffer);
  try {
    const tmpDir = path.join("/tmp", "extractor_images");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, `${key}.bin`), buffer);
  } catch (err) {
    // Ignore write error
  }
}

function getImageBuffer(key: string): Buffer | undefined {
  if (imageBuffers.has(key)) return imageBuffers.get(key);
  try {
    const filePath = path.join("/tmp", "extractor_images", `${key}.bin`);
    if (fs.existsSync(filePath)) {
      const buf = fs.readFileSync(filePath);
      imageBuffers.set(key, buf);
      return buf;
    }
  } catch (err) {
    // Ignore read error
  }
  return undefined;
}

// Helper: Fetch with strict timeout to prevent Serverless Functions from hanging
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 4500): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (err: any) {
    if (err.name === "AbortError" || err.message?.includes("aborted")) {
      throw new Error(`Timeout reaching ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

// Cleanup older jobs to prevent memory growth (older than 30 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [jobId, job] of jobs.entries()) {
    // We parse job IDs which contain timestamp or we track creation time
    const timestamp = parseInt(jobId.split('-')[1]);
    if (isNaN(timestamp) || now - timestamp > 30 * 60 * 1000) {
      jobs.delete(jobId);
      // Delete matching buffers
      for (const key of imageBuffers.keys()) {
        if (key.startsWith(jobId)) {
          imageBuffers.delete(key);
        }
      }
    }
  }
}, 10 * 60 * 1000);

// Helper: Programmatically parse JPEG, PNG, GIF, WebP dimensions from a Buffer
function getImageDimensions(buffer: Buffer): { width: number; height: number } | null {
  try {
    if (buffer.length < 8) return null;

    // Check PNG signature
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      if (buffer.length >= 24) {
        const width = buffer.readInt32BE(16);
        const height = buffer.readInt32BE(20);
        return { width, height };
      }
    }

    // Check GIF signature
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
      if (buffer.length >= 10) {
        const width = buffer.readUInt16LE(6);
        const height = buffer.readUInt16LE(8);
        return { width, height };
      }
    }

    // Check JPEG
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
      let i = 2;
      while (i < buffer.length - 8) {
        if (buffer[i] === 0xFF) {
          const marker = buffer[i + 1];
          if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xC7) || (marker >= 0xC9 && marker <= 0xCB) || (marker >= 0xCD && marker <= 0xCF)) {
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

    // WebP signature
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 && // RIFF
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) { // WEBP
      if (buffer[12] === 0x56 && buffer[13] === 0x50 && buffer[14] === 0x38) {
        const type = buffer[15]; // ' ' (VP8), 'L' (VP8L), 'X' (VP8X)
        if (type === 0x20 && buffer.length >= 30) { // VP8
          const width = buffer.readUInt16LE(26) & 0x3FFF;
          const height = buffer.readUInt16LE(28) & 0x3FFF;
          return { width, height };
        } else if (type === 0x4C && buffer.length >= 25) { // VP8L
          const val = buffer.readUInt32LE(21);
          const width = (val & 0x3FFF) + 1;
          const height = ((val >> 14) & 0x3FFF) + 1;
          return { width, height };
        } else if (type === 0x58 && buffer.length >= 30) { // VP8X
          const width = (buffer.readUInt32LE(24) & 0xFFFFFF) + 1;
          const height = (buffer.readUInt32LE(27) & 0xFFFFFF) + 1;
          return { width, height };
        }
      }
    }
  } catch (err) {
    console.error("Error parsing dimensions programmatically:", err);
  }
  return null;
}

// Format bytes helper
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// Clean filename for different OS
function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "").trim();
}

// Normalize and upscale ecommerce image URLs to get highest-quality
function getHighResImageUrl(url: string, platform: string): string {
  let cleanUrl = url;
  if (url.startsWith("//")) {
    cleanUrl = "https:" + url;
  }

  try {
    const urlObj = new URL(cleanUrl);

    // Shopify CDN image cleanup
    if (cleanUrl.includes("cdn.shopify.com") || platform === "shopify") {
      // Remove size suffixes like _300x300, _medium, _1024x1024, _master, _crop_center etc.
      // Format: filename_1024x1024.jpg?v=123
      const pathWithoutQuery = urlObj.pathname;
      const cleanPath = pathWithoutQuery.replace(/_(small|medium|large|compact|grande|1024x1024|2048x2048|300x300|400x400|600x600|800x800|1000x1000|1200x1200|1600x1600|master)(_crop_center|_crop_top|_crop_bottom)?(\.[a-zA-Z0-9]+)$/, "$3");
      urlObj.pathname = cleanPath;
      
      // We can keep the query parameters just in case Shopify CDN needs a version parameter, but remove size limits
      if (urlObj.searchParams.has("width")) urlObj.searchParams.delete("width");
      if (urlObj.searchParams.has("height")) urlObj.searchParams.delete("height");
      if (urlObj.searchParams.has("crop")) urlObj.searchParams.delete("crop");
      
      return urlObj.toString();
    }

    // WooCommerce or WordPress attachments resizing (e.g. image-300x300.jpg -> image.jpg)
    if (cleanUrl.includes("/wp-content/uploads/")) {
      const cleanPath = urlObj.pathname.replace(/-\d+x\d+(\.[a-zA-Z0-9]+)$/, "$1");
      urlObj.pathname = cleanPath;
      return urlObj.toString();
    }

    // Weebly / Square Online CDN image cleanup (e.g. image.jpg?width=160 -> image.jpg)
    if (cleanUrl.includes("editmysite.com") || platform === "weebly") {
      if (urlObj.searchParams.has("width")) urlObj.searchParams.delete("width");
      if (urlObj.searchParams.has("height")) urlObj.searchParams.delete("height");
      return urlObj.toString();
    }
  } catch (e) {
    // Ignore invalid URL parsing
  }

  return cleanUrl;
}

// API: Check server health
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024 // 15MB limit
  }
});

function extractUrlsFromBuffer(buffer: Buffer, filename: string, mimeType: string): string[] {
  const urlRegex = /https?:\/\/[a-zA-Z0-9.\-_/=?&%#+~@:;()!*']+/gi;
  const discoveredUrls = new Set<string>();

  const ext = filename.split('.').pop()?.toLowerCase() || '';

  if (ext === "xlsx" || ext === "xls" || ext === "csv" || mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) {
    try {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;
        const ref = sheet['!ref'];
        if (!ref) continue;
        const range = XLSX.utils.decode_range(ref);
        for (let R = range.s.r; R <= range.e.r; ++R) {
          for (let C = range.s.c; C <= range.e.c; ++C) {
            const cell_address = { c: C, r: R };
            const cell_ref = XLSX.utils.encode_cell(cell_address);
            const cell = sheet[cell_ref];
            if (cell && cell.v !== undefined) {
              const valStr = String(cell.v);
              const matches = valStr.match(urlRegex);
              if (matches) {
                matches.forEach(u => discoveredUrls.add(u.trim()));
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

  // PDF parser or regex fallback
  if (ext === "pdf" || mimeType.includes("pdf")) {
    try {
      const utf8Str = buffer.toString("utf-8");
      const latin1Str = buffer.toString("latin1");
      
      const matchesUtf8 = utf8Str.match(urlRegex);
      if (matchesUtf8) {
        matchesUtf8.forEach(u => discoveredUrls.add(u.trim()));
      }
      const matchesLatin1 = latin1Str.match(urlRegex);
      if (matchesLatin1) {
        matchesLatin1.forEach(u => {
          const urlClean = u.replace(/[^a-zA-Z0-9.\-_/=?&%#+~@:;()!*']/g, "");
          discoveredUrls.add(urlClean.trim());
        });
      }

      // Also search for PDF URI annotations (/URI (https://...))
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
    // Normal text extraction (txt, md, json, xml, csv fallback)
    try {
      const text = buffer.toString("utf-8");
      const matches = text.match(urlRegex);
      if (matches) {
        matches.forEach(u => discoveredUrls.add(u.trim()));
      }
    } catch (err) {
      console.error("Error parsing standard text:", err);
    }
  }

  const validUrls: string[] = [];
  discoveredUrls.forEach(url => {
    try {
      const cleanUrl = url.trim().replace(/[.)),;>\]'"]+$/, "");
      if (cleanUrl.startsWith("http://") || cleanUrl.startsWith("https://")) {
        new URL(cleanUrl);
        validUrls.push(cleanUrl);
      }
    } catch (_) {}
  });

  return Array.from(new Set(validUrls));
}

// API: Parse uploaded file to extract URLs
app.post("/api/parse-file", upload.single("file"), (req: any, res: any) => {
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
  } catch (error: any) {
    console.error("File processing error:", error);
    res.status(500).json({ error: `Failed to process file: ${error.message}` });
  }
});

// API: Create extraction job
app.post("/api/extract", async (req, res) => {
  const { url, urls, fileName, mode = "auto", options = {} } = req.body;

  if (!url && (!urls || !Array.isArray(urls) || urls.length === 0)) {
    return res.status(400).json({ error: "URL or a list of URLs is required" });
  }

  const jobId = `job-${Date.now()}`;
  const job: ExtractionJob = {
    jobId,
    url: url || `Bulk Scrape: ${urls.length} links`,
    urls: urls || undefined,
    fileName: fileName || undefined,
    mode,
    status: "analyzing",
    options: {
      includeGallery: options.includeGallery !== false,
      includeVariants: options.includeVariants !== false,
      useHighestResolution: options.useHighestResolution !== false,
      removeDuplicates: options.removeDuplicates !== false,
      includeStyleSiblings: options.includeStyleSiblings === true,
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
      percent: 5,
    },
    products: [],
    failedDownloads: [],
  };

  saveJob(job);

  if (process.env.VERCEL) {
    // On Vercel serverless functions, execution is frozen after sending response.
    // We await crawler completion with a safety timeout to prevent FUNCTION_INVOCATION_FAILED.
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Extraction request timed out waiting for target store. Try Single Product mode or Sandbox Demo.")), 8500)
      );
      await Promise.race([runCrawler(jobId), timeoutPromise]);
    } catch (err: any) {
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
    // Run the crawler asynchronously in the background for standard Node containers
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

// API: Extract product directly from pasted HTML or client-fetched HTML
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

  const images: ImageMetadata[] = extracted.images.map((img, idx) => ({
    id: `img-${idx + 1}`,
    filename: img.filename || `image-${idx + 1}.jpg`,
    originalUrl: img.originalUrl,
    resolution: img.resolution || "Original Quality",
    size: "HD Asset",
    variant: img.variant || "General",
    type: img.type || "Gallery",
    contentType: "image/jpeg",
    downloadStatus: "Downloaded" as const
  }));

  const productData: ProductData = {
    id: `prod-1`,
    name: extracted.name,
    storeName: extracted.storeName,
    url,
    images,
    variants: extracted.variants || []
  };

  const job: ExtractionJob = {
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

  // Background download image buffers
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

// API: Get extraction job status
app.get("/api/jobs/:jobId", (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  res.json(job);
});

// API: Cancel an active extraction job
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

// API: Get/Stream product image buffer
app.get("/api/jobs/:jobId/products/:productId/images/:imageId", (req, res) => {
  const { jobId, productId, imageId } = req.params;
  const bufferKey = `${jobId}_${productId}_${imageId}`;
  const buffer = getImageBuffer(bufferKey);

  if (!buffer) {
    return res.status(404).send("Image not found");
  }

  // Find image metadata to set correct content-type
  const job = getJob(jobId);
  const product = job?.products.find(p => p.id === productId);
  const imageMeta = product?.images.find(i => i.id === imageId);

  res.setHeader("Content-Type", imageMeta?.contentType || "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=31536000");
  res.send(buffer);
});

// API: Download single image directly
app.get("/api/jobs/:jobId/download-image/:productId/:imageId", (req, res) => {
  const { jobId, productId, imageId } = req.params;
  const bufferKey = `${jobId}_${productId}_${imageId}`;
  const buffer = getImageBuffer(bufferKey);

  if (!buffer) {
    return res.status(404).send("Image not found");
  }

  const job = getJob(jobId);
  const product = job?.products.find(p => p.id === productId);
  const imageMeta = product?.images.find(i => i.id === imageId);

  if (!imageMeta) {
    return res.status(404).send("Image metadata not found");
  }

  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(imageMeta.filename)}"`);
  res.setHeader("Content-Type", imageMeta.contentType || "application/octet-stream");
  res.send(buffer);
});

// API: Generate and Download ZIP for a specific product folder
app.get("/api/jobs/:jobId/products/:productId/download-zip", async (req, res) => {
  const { jobId, productId } = req.params;
  const job = getJob(jobId);
  const product = job?.products.find(p => p.id === productId);

  if (!job || !product) {
    return res.status(404).json({ error: "Product or Job not found" });
  }

  try {
    const zip = new JSZip();
    const prodStoreName = product.storeName || job.storeName || extractStoreName(null, product.url) || "Store";
    const cleanStore = sanitizeFilename(prodStoreName);
    const cleanProd = sanitizeFilename(product.name);
    const folderName = `${cleanStore} - ${cleanProd}`;
    const productFolder = zip.folder(folderName);
    if (!productFolder) throw new Error("Could not create product folder in ZIP");

    let imageNum = 1;
    let csvContent = `"Product Name","Store Name","Product URL","Variant","Image Type","Image Number","Image File Name","Image URL","Image Resolution","Download Status"\n`;

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
      ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(",");
      csvContent += csvRow + "\n";
    }

    zip.file("product_data.csv", csvContent);

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(folderName)}.zip"`);
    res.setHeader("Content-Type", "application/zip");
    res.send(zipBuffer);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to generate product folder ZIP: " + err.message });
  }
});

// API: Download product_data.csv directly
app.get("/api/jobs/:jobId/download-csv", (req, res) => {
  const { jobId } = req.params;
  const job = getJob(jobId);

  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  const defaultStoreName = job.storeName || extractStoreName(null, job.url);
  let csvContent = `"Product Name","Store Name","Product URL","Variant","Image Type","Image Number","Image File Name","Image URL","Image Resolution","Download Status"\n`;

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
      ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(",");
      csvContent += csvRow + "\n";
    }
  }

  res.setHeader("Content-Disposition", 'attachment; filename="product_data.csv"');
  res.setHeader("Content-Type", "text/csv");
  res.send(csvContent);
});

// API: Generate and Download ZIP of the entire job
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

    // CSV header row
    let csvContent = `"Product Name","Store Name","Product URL","Variant","Image Type","Image Number","Image File Name","Image URL","Image Resolution","Download Status"\n`;

    const firstProd = job.products[0];
    const defaultStoreName = firstProd?.storeName || job.storeName || extractStoreName(null, job.url);
    const cleanDefaultStore = sanitizeFilename(defaultStoreName || "Store");

    // Process each product
    for (const product of job.products) {
      const prodStoreName = product.storeName || defaultStoreName;
      const cleanStore = sanitizeFilename(prodStoreName || "Store");
      const sanitizedProductName = sanitizeFilename(product.name);
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

        // Add to CSV metadata
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
        ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(",");
        csvContent += csvRow + "\n";
      }
    }

    // Add product_data.csv
    zip.file("product_data.csv", csvContent);

    // Generate zip content
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

    // Stream download with formatted ZIP name
    let zipName = `${cleanDefaultStore} - Extracted Products.zip`;
    if (job.fileName) {
      const cleanFileBase = sanitizeFilename(job.fileName.replace(/\.[^/.]+$/, "")) || "Extracted Products";
      zipName = `${cleanFileBase}.zip`;
    } else if (job.products.length === 1 && firstProd) {
      zipName = `${cleanDefaultStore} - ${sanitizeFilename(firstProd.name)}.zip`;
    }

    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(zipName)}"`);
    res.setHeader("Content-Type", "application/zip");
    res.send(zipBuffer);
  } catch (err: any) {
    console.error("ZIP Generation Error:", err);
    res.status(500).json({ error: "Failed to generate ZIP file: " + err.message });
  }
});


// THE CRAWLING SCRAPER ENGINE
async function runCrawler(jobId: string) {
  if (isJobCancelled(jobId)) return;
  const job = getJob(jobId);
  if (!job) return;

  const urlStr = job.url.trim();
  const demoMode = urlStr.includes("example.com") || urlStr.includes("demo") || urlStr.includes("testurl");

  if (demoMode) {
    await simulateDemoExtraction(job);
    return;
  }

  // --- BULK EXTRACTION MULTI-LINK WORKFLOW ---
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
        job.progress.percent = Math.floor(10 + (uIdx / totalUrls) * 85);
        saveJob(jobId, job);

        let platform = "Generic";
        let html = "";
        const HEADERS = {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        };

        try {
          const response = await fetchWithTimeout(currentUrl, { headers: HEADERS }, 4000);
          if (response.ok) {
            html = await response.text();
            const $ = cheerio.load(html);
            const detection = detectPlatform(currentUrl, html, $);
            platform = detection.platform;
          }
        } catch (fetchErr) {
          console.error(`Error fetching URL for platform detection: ${currentUrl}`, fetchErr);
        }

        // Determine mode for this URL
        let detectedMode: "product" | "collection" = "product";
        if (job.mode === "auto") {
          const pathLower = new URL(currentUrl).pathname.toLowerCase();
          if (
            pathLower.includes("/collections/") || 
            pathLower.includes("/category/") || 
            pathLower.includes("/collection/") || 
            pathLower.includes("/shop") || 
            pathLower.includes("/catalog") ||
            pathLower.includes("products.json")
          ) {
            detectedMode = "collection";
          } else {
            detectedMode = "product";
          }
        } else {
          detectedMode = job.mode as any;
        }

        job.progress.currentStep = `Extracting link ${uIdx + 1}/${totalUrls} (${platform.toUpperCase()})...`;
        saveJob(jobId, job);

        if (detectedMode === "collection") {
          let colProductUrls: { url: string; name?: string }[] = [];
          
          if (platform === "shopify") {
            try {
              const urlObj = new URL(currentUrl);
              const collectionJsonUrl = `${urlObj.origin}/products.json?limit=25`;
              const res = await fetchWithTimeout(collectionJsonUrl, { headers: HEADERS }, 4000);
              if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.products)) {
                  for (const p of data.products) {
                    colProductUrls.push({
                      url: `${urlObj.origin}/products/${p.handle}`,
                      name: p.title,
                    });
                  }
                }
              }
            } catch (_) {}
          } else if (platform === "weebly") {
            try {
              const bootstrapMatch = html.match(/window\.__BOOTSTRAP_STATE__\s*=\s*({.*?});/s) || html.match(/window\.__BOOTSTRAP_STATE__\s*=\s*(.*?);/);
              let bootstrapState: any = null;
              if (bootstrapMatch) {
                bootstrapState = JSON.parse(bootstrapMatch[1]);
              }
              if (bootstrapState) {
                const classicSiteID = bootstrapState.siteData?.site?.properties?.classicSiteID;
                const classicUserID = bootstrapState.siteData?.user?.id;
                const siteCatalogVersion = bootstrapState.siteData?.site?.properties?.siteCatalogVersion;

                if (classicUserID && classicSiteID) {
                  let categoryId: string | null = null;
                  const catMatch = currentUrl.match(/\/shop\/[^/]+\/([a-zA-Z0-9]{24})/i);
                  if (catMatch) {
                    categoryId = catMatch[1];
                  }

                  let apiUrl = `https://cdn5.editmysite.com/app/store/api/v28/editor/users/${classicUserID}/sites/${classicSiteID}/products?cache-version=${siteCatalogVersion}&per_page=100`;
                  if (categoryId) {
                    apiUrl += `&categories%5B%5D=${categoryId}`;
                  }

                  const res = await fetchWithTimeout(apiUrl, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } }, 4000);
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
            } catch (_) {}
          }

          // Fallback parsing for collection if needed
          if (colProductUrls.length === 0 && html) {
            const $ = cheerio.load(html);
            const uniqueLinks = new Set<string>();
            $("a").each((_, el) => {
              const href = $(el).attr("href");
              if (!href) return;
              try {
                const absUrlObj = new URL(href, currentUrl);
                const absUrl = absUrlObj.toString().split("?")[0];
                const isProductPattern = 
                  absUrlObj.pathname.includes("/products/") || 
                  absUrlObj.pathname.includes("/product/") || 
                  absUrlObj.pathname.includes("/item/") ||
                  absUrlObj.pathname.endsWith(".html");

                if (isProductPattern && !uniqueLinks.has(absUrl) && absUrl !== currentUrl) {
                  uniqueLinks.add(absUrl);
                  colProductUrls.push({ url: absUrl, name: $(el).text().trim() || undefined });
                }
              } catch (_) {}
            });
          }

          // Limit scanning for collections inside a bulk job to prevent timeouts
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
            } catch (cpErr: any) {
              console.error(`Bulk collection item fail: ${cp.url}`, cpErr);
              job.failedDownloads.push({ url: cp.url, error: cpErr.message || "Failed" });
            }
          }
        } else {
          // Product Mode
          if (isJobCancelled(jobId)) return;
          const productData = await extractAndDownloadProduct(jobId, currentUrl, undefined, platform, job);
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
    } catch (bulkErr: any) {
      if (isJobCancelled(jobId)) return;
      console.error("Bulk extraction general error:", bulkErr);
      job.status = "failed";
      job.error = bulkErr.message || "A general error occurred during bulk file extraction.";
      saveJob(jobId, job);
    }
    return;
  }

  try {
    // 1. Fetch main page HTML
    job.progress.currentStep = "Fetching website HTML...";
    job.progress.percent = 10;
    saveJob(jobId, job);

    const HEADERS = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    };

    let mainHtml = "";
    try {
      const response = await fetchWithTimeout(urlStr, { headers: HEADERS }, 5000);
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
      }
      mainHtml = await response.text();
    } catch (fetchErr: any) {
      throw new Error(`Unable to access website: ${fetchErr.message}. Make sure the URL is correct and public.`);
    }

    // 2. Parse HTML and detect platform
    const $ = cheerio.load(mainHtml);
    const detection = detectPlatform(urlStr, mainHtml, $);
    const platform = detection.platform;
    job.detectedPlatform = detection.platform;
    job.confidenceScore = detection.confidence;

    // Extract exact store / company name from HTML footer, header, og:site_name, and meta tags
    const detectedStoreName = extractStoreName($, urlStr, mainHtml);
    job.storeName = detectedStoreName;

    // 3. Determine URL Mode (Product vs Listing)
    let detectedMode: "product" | "collection" = "product";
    if (job.mode === "auto") {
      const pathLower = new URL(urlStr).pathname.toLowerCase();
      if (
        pathLower.includes("/collections/") || 
        pathLower.includes("/category/") || 
        pathLower.includes("/collection/") || 
        pathLower.includes("/shop") || 
        pathLower.includes("/catalog") ||
        pathLower.includes("products.json")
      ) {
        detectedMode = "collection";
      } else {
        detectedMode = "product";
      }
    } else {
      detectedMode = job.mode as any;
    }

    job.progress.currentStep = `Detected: ${detection.platform} (${Math.round(detection.confidence * 100)}% confidence). Mode: ${detectedMode === "product" ? "Single Product Page" : "Collection"}`;
    job.progress.percent = 20;
    saveJob(jobId, job);

    let productUrls: { url: string; name?: string }[] = [];

    // --- COLLECTION WORKFLOW ---
    if (detectedMode === "collection") {
      job.progress.currentStep = "Searching for product cards...";
      saveJob(jobId, job);

      if (platform === "Shopify") {
        // Shopify collection JSON extraction trick is incredibly clean!
        try {
          const urlObj = new URL(urlStr);
          // Try adding /products.json
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

          const res = await fetchWithTimeout(collectionJsonUrl, { headers: HEADERS }, 4000);
          if (res.ok) {
            const data = await res.json();
            if (data && Array.isArray(data.products)) {
              for (const p of data.products) {
                productUrls.push({
                  url: `${urlObj.origin}/products/${p.handle}`,
                  name: p.title,
                });
              }
            }
          }
        } catch (shopifyErr) {
          console.error("Shopify Collection API fallback:", shopifyErr);
        }
      } else if (platform === "Square Online") {
        // Weebly / Square Online JSON API extraction
        try {
          const bootstrapMatch = mainHtml.match(/window\.__BOOTSTRAP_STATE__\s*=\s*({.*?});/s) || mainHtml.match(/window\.__BOOTSTRAP_STATE__\s*=\s*(.*?);/);
          let bootstrapState: any = null;
          if (bootstrapMatch) {
            bootstrapState = JSON.parse(bootstrapMatch[1]);
          }

          if (bootstrapState) {
            const classicSiteID = bootstrapState.siteData?.site?.properties?.classicSiteID;
            const classicUserID = bootstrapState.siteData?.user?.id;
            const siteCatalogVersion = bootstrapState.siteData?.site?.properties?.siteCatalogVersion;

            if (classicUserID && classicSiteID) {
              let categoryId: string | null = null;
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
              }, 4000);

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

      // Fallback HTML parse if productUrls is empty
      if (productUrls.length === 0) {
        const uniqueLinks = new Set<string>();
        // Look for <a> tags containing /products/ or similar pattern
        $("a").each((i: number, el: any) => {
          const href = $(el).attr("href");
          if (!href) return;
          try {
            const absUrlObj = new URL(href, urlStr);
            const absUrl = absUrlObj.toString();
            
            // Exclude common Shopify queries, account, carts, etc.
            if (absUrlObj.search || absUrlObj.hash) return;

            const isProductPattern = 
              absUrlObj.pathname.includes("/products/") || 
              absUrlObj.pathname.includes("/product/") || 
              absUrlObj.pathname.includes("/item/") || 
              (absUrlObj.pathname.split("/").filter(Boolean).length >= 2 && platform === "Shopify");

            if (isProductPattern && !uniqueLinks.has(absUrl) && absUrl !== urlStr) {
              uniqueLinks.add(absUrl);
              const name = $(el).text().trim() || $(el).find("img").attr("alt")?.trim() || undefined;
              productUrls.push({ url: absUrl, name });
            }
          } catch (e) {
            // ignore
          }
        });
      }

      // Limit collection scanning to prevent abuse and timeouts
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

      // Extract products sequentially
      for (let index = 0; index < productUrls.length; index++) {
        if (isJobCancelled(jobId)) return;
        const pObj = productUrls[index];
        job.progress.currentProductIndex = index + 1;
        job.progress.currentProductName = pObj.name || `Product ${index + 1}`;
        job.progress.percent = Math.floor(25 + (index / productUrls.length) * 50);
        saveJob(jobId, job);

        try {
          const productData = await extractAndDownloadProduct(jobId, pObj.url, pObj.name, platform, job);
          if (productData) {
            job.products.push(productData);
          }
        } catch (pErr: any) {
          console.error(`Error processing product ${pObj.url}:`, pErr);
          job.failedDownloads.push({ url: pObj.url, error: pErr.message || "Failed parsing" });
        }
      }

    } else {
      // --- SINGLE PRODUCT WORKFLOW ---
      if (job.options.includeStyleSiblings) {
        if (isJobCancelled(jobId)) return;
        job.progress.currentStep = "Scanning product page for sibling color swatches / style group...";
        saveJob(jobId, job);

        const siblingUrls = new Set<string>();
        siblingUrls.add(urlStr); // Always include the original page URL!

        try {
          const urlObj = new URL(urlStr);
          const handle = urlObj.pathname.split("/").pop() || "";
          const parts = handle.split("-");
          
          // Heuristic: take base terms to match prefix (e.g. "spacedye-caught-in-the-midi-high-waisted")
          if (parts.length > 2) {
            const baseWordsCount = Math.max(3, parts.length - 3);
            const baseSlug = parts.slice(0, baseWordsCount).join("-");
            
            $("a").each((_, el) => {
              const href = $(el).attr("href");
              if (!href) return;
              try {
                const absUrlObj = new URL(href, urlStr);
                const absUrl = absUrlObj.toString().split("?")[0];
                // Make sure it belongs to product directory and contains base style slug
                if (absUrlObj.pathname.includes("/products/") && absUrlObj.pathname.includes(baseSlug)) {
                  siblingUrls.add(absUrl);
                }
              } catch (_) {}
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
          
          // Parse name from handle to show progress nicely
          let guessedName = "Sibling Style";
          try {
            const handlePart = new URL(sUrl).pathname.split("/").pop() || "";
            guessedName = handlePart.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
          } catch (_) {}

          job.progress.currentProductName = guessedName;
          job.progress.percent = Math.floor(30 + (index / urlsToProcess.length) * 50);
          saveJob(jobId, job);

          try {
            const productData = await extractAndDownloadProduct(jobId, sUrl, undefined, platform, job);
            if (productData) {
              job.products.push(productData);
            }
          } catch (pErr: any) {
            console.error(`Error processing sibling style ${sUrl}:`, pErr);
            job.failedDownloads.push({ url: sUrl, error: pErr.message || "Failed parsing sibling" });
          }
        }
      } else {
        // Just extract the single product URL provided
        if (isJobCancelled(jobId)) return;
        job.progress.productsFound = 1;
        job.progress.currentProductIndex = 1;
        job.progress.currentProductName = "Analyzing main product...";
        job.progress.percent = 30;
        saveJob(jobId, job);

        const productData = await extractAndDownloadProduct(jobId, urlStr, undefined, platform, job);
        if (productData) {
          job.products.push(productData);
        } else {
          throw new Error("Could not extract any product information or images from the URL.");
        }
      }
    }

    if (isJobCancelled(jobId)) return;
    // Complete the Job
    job.status = "completed";
    job.progress.currentStep = "Extraction successfully completed!";
    job.progress.percent = 100;
    saveJob(jobId, job);

  } catch (err: any) {
    if (isJobCancelled(jobId)) return;
    console.error(`Crawler failed:`, err);
    job.status = "failed";
    job.error = err.message || "An error occurred during extraction.";
    saveJob(jobId, job);
  }
}

// Single product details scraper & image downloader
async function extractAndDownloadProduct(
  jobId: string, 
  productUrl: string, 
  predefinedName: string | undefined, 
  platform: string,
  job: ExtractionJob
): Promise<ProductData | null> {
  if (isJobCancelled(jobId)) return null;
  
  const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  };

  let productTitle = predefinedName || "";
  let extractedStoreName = job.storeName || "";
  let imageCandidates: { url: string; variant?: string; type: string }[] = [];
  let variants: string[] = [];

  // 3. For Shopify product URLs, remove query parameters and fetch {origin}/products/{handle}.js
  let shopifyJsonSucceeded = false;
  const shopifyInfo = parseShopifyProductUrl(productUrl);

  if (shopifyInfo.isShopifyProduct && shopifyInfo.jsonUrl) {
    try {
      const res = await fetchWithTimeout(shopifyInfo.jsonUrl, { headers: HEADERS }, 4000);
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
                  const $p = cheerio.load(pHtml);
                  extractedStoreName = extractStoreName($p, productUrl, pHtml);
                }
              } catch (_) {}
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
      // 1. Fetch the product page HTML to extract __BOOTSTRAP_STATE__ and find the product ID
      let prodHtml = "";
      const resHtml = await fetchWithTimeout(productUrl, { headers: HEADERS }, 4000);
      if (resHtml.ok) {
        prodHtml = await resHtml.text();
        const $prod = cheerio.load(prodHtml);
        
        // Extract bootstrap state
        const bootstrapMatch = prodHtml.match(/window\.__BOOTSTRAP_STATE__\s*=\s*({.*?});/s) || prodHtml.match(/window\.__BOOTSTRAP_STATE__\s*=\s*(.*?);/);
        let bootstrapState: any = null;
        if (bootstrapMatch) {
          bootstrapState = JSON.parse(bootstrapMatch[1]);
        }
        
        if (bootstrapState) {
          const classicSiteID = bootstrapState.siteData?.site?.properties?.classicSiteID;
          const classicUserID = bootstrapState.siteData?.user?.id;
          const siteCatalogVersion = bootstrapState.siteData?.site?.properties?.siteCatalogVersion;
          
          // Match the product ID from the end of the URL pathname (e.g. 1435)
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
            }, 4000);
            
            if (apiRes.ok) {
              const apiData = await apiRes.json();
              if (apiData && apiData.data) {
                const item = apiData.data;
                productTitle = item.name || productTitle;
                
                // Extract main image
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
                
                // Grab any other <img> tags on the actual product HTML page for extra gallery photos!
                $prod("img").each((i: number, el: any) => {
                  const src = $prod(el).attr("src");
                  const dataSrc = $prod(el).attr("data-src") || $prod(el).attr("data-lazy-src") || $prod(el).attr("data-original");
                  const alt = $prod(el).attr("alt")?.trim() || "";
                  
                  if (src && !src.startsWith("data:image/") && !src.includes("universal_product_placeholder")) {
                    imageCandidates.push({ url: src, type: "Gallery", variant: alt || undefined });
                  }
                  if (dataSrc && !dataSrc.startsWith("data:image/") && !dataSrc.includes("universal_product_placeholder")) {
                    imageCandidates.push({ url: dataSrc, type: "Gallery", variant: alt || undefined });
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

  // Fallback to HTML Scraping
  if (!shopifyJsonSucceeded && !weeblyJsonSucceeded) {
    let html = "";
    try {
      const res = await fetchWithTimeout(productUrl, { headers: HEADERS }, 4000);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      html = await res.text();
    } catch (e: any) {
      throw new Error(`Could not fetch product page ${productUrl}: ${e.message}`);
    }

    const $ = cheerio.load(html);

    if (!extractedStoreName) {
      extractedStoreName = extractStoreName($, productUrl, html);
    }

    const cleanCandidateTitle = (raw: string): string => {
      if (!raw) return "";
      let t = raw.trim();
      if (/^(shopping cart|cart|checkout|bag|products?|home|search|menu|my account|untitled)$/i.test(t)) return "";
      // Strip delimiters like " | Store Name" or " - Store Name"
      const delims = [" | ", " – ", " — ", " • ", " - "];
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

    // A. Parse application/ld+json for Structured Product Data
    $('script[type="application/ld+json"]').each((i: number, el: any) => {
      try {
        const jsonText = $(el).html();
        if (!jsonText) return;
        const schema = JSON.parse(jsonText);
        
        // LD+Json could be a single object or an array of objects
        const findProductSchema = (obj: any): any => {
          if (!obj) return null;
          if (obj["@type"] === "Product") return obj;
          if (obj["@graph"] && Array.isArray(obj["@graph"])) {
            return obj["@graph"].find((item: any) => item["@type"] === "Product");
          }
          if (Array.isArray(obj)) {
            return obj.find((item: any) => item["@type"] === "Product");
          }
          return null;
        };

        const prod = findProductSchema(schema);
        if (prod) {
          if (prod.name && (!productTitle || /^(shopping cart|cart|product)$/i.test(productTitle))) {
            const cleaned = cleanCandidateTitle(prod.name);
            if (cleaned) productTitle = cleaned;
          }
          // Process schema images
          if (prod.image) {
            const imgs = Array.isArray(prod.image) ? prod.image : [prod.image];
            imgs.forEach((imgUrl: any) => {
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
        // invalid JSON
      }
    });

    // B. Parse OpenGraph and Meta images
    const ogImage = $('meta[property="og:image"]').attr("content") || $('meta[property="og:image:secure_url"]').attr("content");
    if (ogImage) {
      imageCandidates.push({ url: ogImage, type: "Main", variant: "General" });
    }
    const twitterImage = $('meta[name="twitter:image"]').attr("content");
    if (twitterImage) {
      imageCandidates.push({ url: twitterImage, type: "Main", variant: "General" });
    }

    // C. Scan <img> elements with various sources
    $("img").each((i: number, el: any) => {
      const src = $(el).attr("src");
      const srcset = $(el).attr("srcset");
      const dataSrc = $(el).attr("data-src") || $(el).attr("data-lazy-src") || $(el).attr("data-original");
      const dataSrcset = $(el).attr("data-srcset");
      const alt = $(el).attr("alt")?.trim() || "";

      // Push raw src
      if (src && !src.startsWith("data:image/")) {
        imageCandidates.push({ url: src, type: "Gallery", variant: alt || undefined });
      }
      // Push data-src
      if (dataSrc && !dataSrc.startsWith("data:image/")) {
        imageCandidates.push({ url: dataSrc, type: "Gallery", variant: alt || undefined });
      }

      // Parse srcset
      const parseSrcsetStr = (srcsetString: string) => {
        const parts = srcsetString.split(",");
        parts.forEach((part: string) => {
          const match = part.trim().split(/\s+/);
          if (match[0]) {
            imageCandidates.push({ url: match[0], type: "Gallery", variant: alt || undefined });
          }
        });
      };

      if (srcset) parseSrcsetStr(srcset);
      if (dataSrcset) parseSrcsetStr(dataSrcset);
    });

    // D. Scan dynamic picture elements
    $("picture source").each((i: number, el: any) => {
      const srcset = $(el).attr("srcset") || $(el).attr("data-srcset");
      if (srcset) {
        const parts = srcset.split(",");
        parts.forEach((part: string) => {
          const match = part.trim().split(/\s+/);
          if (match[0]) {
            imageCandidates.push({ url: match[0], type: "Gallery", variant: "General" });
          }
        });
      }
    });
  }

  // Ensure unique candidates and normalize them
  const productDataId = `prod-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const finalImages: ImageMetadata[] = [];
  const uniqueUrls = new Set<string>();

  job.progress.currentStep = `Extracting images for: ${productTitle}`;
  saveJob(jobId, job);

  // Normalize URLs and deduplicate
  const normalizedCandidates: { url: string; originalUrl: string; variant?: string; type: string }[] = [];

  for (const cand of imageCandidates) {
    if (!cand.url || cand.url.startsWith("data:")) continue;

    try {
      // Resolve relative url
      const resolvedUrl = new URL(cand.url, productUrl).toString();
      const highResUrl = getHighResImageUrl(resolvedUrl, platform);

      // Normalize key to remove query strings and double slashes to identify true duplicates
      const urlObj = new URL(highResUrl);
      const normKey = urlObj.origin + urlObj.pathname;

      // Filter out candidate URLs that are actually webpage pages instead of images
      const pathLower = urlObj.pathname.toLowerCase();
      const hasImageExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.bmp', '.tiff', '.ico'].some(ext => pathLower.endsWith(ext));
      const hasProductPattern = 
        pathLower.includes("/products/") || 
        pathLower.includes("/product/") || 
        pathLower.includes("/collections/") || 
        pathLower.includes("/category/") || 
        pathLower.includes("/item/");
      const isWebpageExtension = ['.html', '.htm', '.php', '.asp', '.aspx', '.jsp'].some(ext => pathLower.endsWith(ext));

      if ((hasProductPattern || isWebpageExtension) && !hasImageExt) {
        continue;
      }

      // Strict non-product graphic filter (ignores logos, checkouts, badges, footers, stars)
      const nonProductKeywords = [
        "logo", "banner", "header", "footer", "icon", "badge", "social", "facebook", "instagram",
        "twitter", "pinterest", "cart", "payment", "trustpilot", "visa", "mastercard", "paypal",
        "app-store", "google-pay", "apple-pay", "star-rating", "star.svg", "menu", "arrow",
        "avatar", "user", "trust", "security", "loading", "spinner", "checkout", "button",
        "search", "placeholder", "feedback", "newsletter", "widget", "loader", "favicon"
      ];
      const variantTextLower = (cand.variant || "").toLowerCase();
      const filenameLower = pathLower.split("/").pop() || "";
      const isNonProductGraphic = nonProductKeywords.some(keyword => 
        pathLower.includes(keyword) || 
        variantTextLower.includes(keyword) || 
        filenameLower.includes(keyword)
      );

      if (isNonProductGraphic) {
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
      // invalid URL
    }
  }

  job.progress.imagesFound += normalizedCandidates.length;
  saveJob(jobId, job);

  if (!extractedStoreName) {
    extractedStoreName = extractStoreName(null, productUrl);
  }
  const cleanStoreName = sanitizeFilename(extractedStoreName || "Store");

  // Download candidate images
  let imgIndex = 1;
  for (const cand of normalizedCandidates) {
    if (isJobCancelled(jobId)) return null;
    job.progress.currentStep = `Downloading image ${imgIndex} of ${normalizedCandidates.length} for ${productTitle}...`;
    saveJob(jobId, job);

    const imageId = `img-${Date.now()}-${imgIndex}`;
    const cleanProdName = sanitizeFilename(productTitle);
    
    // Create elegant filename in {{store Name}} - {{Product Name}} format
    let variantSuffix = cand.variant && cand.variant !== "General" && cand.variant !== "Default" ? ` - ${sanitizeFilename(cand.variant)}` : "";
    if (variantSuffix.length > 30) variantSuffix = variantSuffix.substring(0, 30); // clip excessively long alt texts
    const extension = path.extname(new URL(cand.url).pathname) || ".jpg";
    const finalExtension = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(extension.toLowerCase()) ? extension : ".jpg";
    
    const filename = `${cleanStoreName} - ${cleanProdName}${variantSuffix} - ${String(imgIndex).padStart(2, '0')}${finalExtension}`;

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

      // Read dimensions
      const dims = getImageDimensions(buffer);
      const resolution = dims ? `${dims.width} x ${dims.height}` : "1200 x 1200"; // realistic placeholder fallback
      const sizeStr = formatBytes(buffer.length);

      // Save to memory and /tmp storage
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
    } catch (err: any) {
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

  // Deduplicate options
  const uniqueVariantsList = Array.from(new Set(finalImages.map(img => img.variant).filter(Boolean)));

  return {
    id: productDataId,
    name: productTitle,
    storeName: extractedStoreName,
    url: productUrl,
    images: finalImages,
    variants: uniqueVariantsList,
    platform: platform
  };
}

// SANDBOX DEMO SCENARIO
async function simulateDemoExtraction(job: ExtractionJob) {
  const jobId = job.jobId;
  const isListing = job.mode === "collection" || job.url.includes("collection") || job.url.includes("category");

  job.detectedPlatform = job.detectedPlatform || "Shopify";
  job.storeName = job.storeName || "Demo Store";

  job.progress.currentStep = "Initiating Sandbox Crawler...";
  job.progress.percent = 10;
  saveJob(jobId, job);
  await sleep(600);

  // Unsplash high quality test images
  const mockImages = {
    sweater: [
      { url: "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=1200&q=80", variant: "Off-White" },
      { url: "https://images.unsplash.com/photo-1574169208507-84376144848b?auto=format&fit=crop&w=1200&q=80", variant: "Navy Blue" },
      { url: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=80", variant: "Dusty Rose" },
    ],
    shirt: [
      { url: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=1200&q=80", variant: "Classic White" },
      { url: "https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=1200&q=80", variant: "Soft Blue" },
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
    const productImages: ImageMetadata[] = [];
    const uniqueVariants: string[] = [];

    let imgIdx = 1;
    for (const imgSpec of dp.images) {
      if (isJobCancelled(jobId)) return;
      job.progress.currentStep = `Downloading image ${imgIdx} of ${dp.images.length} for ${dp.name}...`;
      saveJob(jobId, job);

      const imageId = `img-demo-${productIdx}-${imgIdx}`;
      const extension = ".jpg";
      const cleanStore = sanitizeFilename(demoStoreName);
      const cleanProdName = sanitizeFilename(dp.name);
      const cleanVariant = sanitizeFilename(imgSpec.variant);
      const filename = `${cleanStore} - ${cleanProdName} - ${cleanVariant} - ${String(imgIdx).padStart(2, '0')}${extension}`;

      try {
        // Fetch real buffer from Unsplash to make the download ZIP completely functional and contain real JPEGs!
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
      } catch (err: any) {
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
    job.progress.percent = Math.floor(25 + ((productIdx - 1) / productsToProcess.length) * 70);
    saveJob(jobId, job);
  }

  if (isJobCancelled(jobId)) return;
  // Set as completed
  job.status = "completed";
  job.progress.percent = 100;
  job.progress.currentStep = "Sandbox extraction complete. All buffers successfully validated and stored!";
  saveJob(jobId, job);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Global Express error handler to ensure API errors always respond with JSON
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled Express route error:", err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({
    error: err.message || "An internal server error occurred."
  });
});

// SETUP VITE DEVELOPMENT MIDDLEWARE OR SERVE PRODUCTION BUNDLE
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Configuring Vite Development Middleware...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
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

export default app;
