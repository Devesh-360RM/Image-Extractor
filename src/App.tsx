import { useState, useEffect, useRef } from "react";
import logoImage from "./assets/images/app_logo_icon_1789999735173.jpg";
import { 
  motion, 
  AnimatePresence 
} from "motion/react";
import { 
  Download, 
  Search, 
  Image as ImageIcon, 
  Folder, 
  Layers, 
  Settings, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink, 
  RefreshCw, 
  FileSpreadsheet, 
  Sparkles, 
  Info, 
  ChevronDown, 
  ChevronUp, 
  FileArchive, 
  X,
  HelpCircle,
  Upload,
  FileUp,
  FileText,
  File,
  Globe,
  ArrowLeft,
  Check,
  Loader2,
  Store,
  Building2
} from "lucide-react";
import { ExtractionJob, ProductData, ImageMetadata } from "./types";

async function safeParseJsonResponse<T = any>(res: Response): Promise<T> {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Server error (${res.status})`);
    }
    return data;
  }
  
  const text = await res.text();
  const cleanText = text.replace(/<[^>]*>?/gm, " ").replace(/\s+/g, " ").trim();
  const summary = cleanText.length > 200 ? cleanText.substring(0, 200) + "..." : cleanText;
  
  throw new Error(summary || `Request failed with status ${res.status}`);
}

export function getPOSDisplayName(platform?: string, url?: string): string {
  const norm = (platform || "").toLowerCase();
  if (norm.includes("lightspeed") || norm.includes("webshopapp") || norm.includes("seoshop")) return "Lightspeed";
  if (norm.includes("ecwid")) return "Ecwid";
  if (norm.includes("shopify")) return "Shopify";
  if (norm.includes("square") || norm.includes("weebly")) return "Square Online";
  if (norm.includes("woocommerce") || norm.includes("wordpress")) return "WooCommerce";
  if (norm.includes("magento")) return "Magento";
  if (norm.includes("bigcommerce")) return "BigCommerce";
  if (norm.includes("wix")) return "Wix";
  if (norm.includes("squarespace")) return "Squarespace";
  if (norm.includes("prestashop")) return "PrestaShop";
  if (norm.includes("shopware")) return "Shopware";
  if (norm.includes("webflow")) return "Webflow";
  if (norm.includes("shift4shop")) return "Shift4Shop";
  if (norm.includes("clover")) return "Clover";

  if (url) {
    const u = url.toLowerCase();
    if (u.includes("lightspeed") || u.includes("webshopapp") || u.includes("seoshop") || u.includes("shoplightspeed")) return "Lightspeed";
    if (u.includes("ecwid") || u.includes("company.site")) return "Ecwid";
    if (u.includes("shopify") || u.includes("myshopify")) return "Shopify";
    if (u.includes("square") || u.includes("squareup") || u.includes("square.site")) return "Square Online";
    if (u.includes("bigcommerce") || u.includes("mybigcommerce")) return "BigCommerce";
    if (u.includes("wix")) return "Wix";
    if (u.includes("squarespace")) return "Squarespace";
    if (u.includes("woocommerce") || u.includes("wp-content")) return "WooCommerce";
    if (u.includes("magento")) return "Magento";
    if (u.includes("clover")) return "Clover";
  }

  if (platform && platform !== "POS" && platform !== "Unknown" && platform !== "generic" && platform !== "Generic" && platform !== "Custom E-Commerce") {
    return platform;
  }

  return "Shopify";
}

export default function App() {
  // Input State
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<"auto" | "product" | "collection">("auto");
  
  // Scraper Options
  const [includeGallery, setIncludeGallery] = useState(true);
  const [includeVariants, setIncludeVariants] = useState(true);
  const useHighestResolution = true; // Always active
  const [removeDuplicates, setRemoveDuplicates] = useState(true);
  const [includeStyleSiblings, setIncludeStyleSiblings] = useState(false);

  // Job Tracking
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ExtractionJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // UI State
  const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});
  const [previewImage, setPreviewImage] = useState<{ product: ProductData; image: ImageMetadata } | null>(null);
  const [showDemoBanner, setShowDemoBanner] = useState(true);

  // File Upload State
  const [activeTab, setActiveTab] = useState<"url" | "file" | "html">("url");
  const [pastedHtml, setPastedHtml] = useState("");
  const [pastedUrl, setPastedUrl] = useState("");
  const [fileExtractionMode, setFileExtractionMode] = useState<"auto" | "product" | "collection">("auto");
  const [fileParsingState, setFileParsingState] = useState<{
    isLoading: boolean;
    error: string | null;
    result: { filename: string; count: number; urls: string[] } | null;
  }>({
    isLoading: false,
    error: null,
    result: null,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Poll Job Status
  const startPolling = (jobId: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const data: ExtractionJob = await safeParseJsonResponse(res);
        setJob(data);

        if (data.status === "completed") {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          // Expand the first product gallery automatically
          if (data.products && data.products.length > 0) {
            setExpandedProducts({ [data.products[0].id]: true });
          }
        } else if (data.status === "failed") {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setError(data.error || "Extraction failed on the server.");
        } else if (data.status === "cancelled") {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setIsSubmitting(false);
          setIsCancelling(false);
        }
      } catch (err: any) {
        console.error("Polling error:", err);
        setError(err.message || "Error communicating with the extraction service.");
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      }
    }, 800);
  };

  // Submit URL for Extraction
  const handleStartExtraction = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url.trim()) {
      setError("Please provide a valid website or product URL.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setJob(null);
    setActiveJobId(null);

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          mode,
          options: {
            includeGallery,
            includeVariants,
            useHighestResolution,
            removeDuplicates,
            includeStyleSiblings,
          }
        })
      });

      const responseData = await safeParseJsonResponse<{ jobId: string; job?: ExtractionJob }>(res);
      const jobId = responseData.jobId;
      setActiveJobId(jobId);
      
      if (responseData.job) {
        setJob(responseData.job);
        if (responseData.job.status === "completed" && responseData.job.products?.length > 0) {
          setExpandedProducts({ [responseData.job.products[0].id]: true });
        } else if (responseData.job.status === "failed") {
          setError(responseData.job.error || "Extraction failed.");
        }
      } else {
        // Initialize local layout progress state for asynchronous polling
        setJob({
          jobId,
          url,
          mode,
          status: "analyzing",
          options: { includeGallery, includeVariants, useHighestResolution, removeDuplicates, includeStyleSiblings },
          progress: {
            currentStep: "Contacting remote server...",
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
        });

        startPolling(jobId);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExtractFromHtml = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pastedHtml.trim()) {
      setError("Please paste the page HTML source code.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setJob(null);
    setActiveJobId(null);

    try {
      const res = await fetch("/api/extract-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html: pastedHtml.trim(),
          url: pastedUrl.trim() || url.trim() || "https://paige.com/products/men-lennox-emberton-1"
        })
      });

      const responseData = await safeParseJsonResponse<{ jobId: string; job?: ExtractionJob }>(res);
      const jobId = responseData.jobId;
      setActiveJobId(jobId);

      if (responseData.job) {
        setJob(responseData.job);
        if (responseData.job.status === "completed" && responseData.job.products?.length > 0) {
          setExpandedProducts({ [responseData.job.products[0].id]: true });
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to extract images from pasted HTML.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const processFile = async (file: File) => {
    if (!file) return;
    
    setFileParsingState({
      isLoading: true,
      error: null,
      result: null
    });

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/parse-file", {
        method: "POST",
        body: formData,
      });

      const result = await safeParseJsonResponse(res);
      setFileParsingState({
        isLoading: false,
        error: null,
        result
      });
    } catch (err: any) {
      console.error("File parsing error:", err);
      setFileParsingState({
        isLoading: false,
        error: err.message || "An unexpected error occurred while parsing the file.",
        result: null
      });
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleStartFileUrlExtraction = async (selectedUrl: string) => {
    if (!selectedUrl.trim()) return;

    setIsSubmitting(true);
    setError(null);
    setJob(null);
    setActiveJobId(null);

    // Update the url state so visual logs track correctly
    setUrl(selectedUrl.trim());

    try {
      const currentFileName = fileParsingState.result?.filename || undefined;
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: selectedUrl.trim(),
          fileName: currentFileName,
          mode: fileExtractionMode,
          options: {
            includeGallery,
            includeVariants,
            useHighestResolution,
            removeDuplicates,
            includeStyleSiblings,
          }
        })
      });

      const responseData = await safeParseJsonResponse<{ jobId: string; job?: ExtractionJob }>(res);
      const jobId = responseData.jobId;
      setActiveJobId(jobId);
      
      if (responseData.job) {
        setJob(responseData.job);
        if (responseData.job.status === "completed" && responseData.job.products?.length > 0) {
          setExpandedProducts({ [responseData.job.products[0].id]: true });
        }
      } else {
        // Initialize local layout progress state
        setJob({
          jobId,
          url: selectedUrl.trim(),
          fileName: currentFileName,
          mode: fileExtractionMode,
          status: "analyzing",
          options: { includeGallery, includeVariants, useHighestResolution, removeDuplicates, includeStyleSiblings },
          progress: {
            currentStep: "Contacting remote server...",
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
        });

        startPolling(jobId);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartBulkExtraction = async (selectedUrls: string[]) => {
    if (!selectedUrls || selectedUrls.length === 0) return;

    setIsSubmitting(true);
    setError(null);
    setJob(null);
    setActiveJobId(null);

    // Update the URL state to represent the bulk action
    setUrl(`Bulk Scrape: ${selectedUrls.length} links`);

    try {
      const currentFileName = fileParsingState.result?.filename || undefined;
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: selectedUrls,
          fileName: currentFileName,
          mode: fileExtractionMode,
          options: {
            includeGallery,
            includeVariants,
            useHighestResolution,
            removeDuplicates,
            includeStyleSiblings,
          }
        })
      });

      const responseData = await safeParseJsonResponse<{ jobId: string; job?: ExtractionJob }>(res);
      const jobId = responseData.jobId;
      setActiveJobId(jobId);
      
      if (responseData.job) {
        setJob(responseData.job);
        if (responseData.job.status === "completed" && responseData.job.products?.length > 0) {
          setExpandedProducts({ [responseData.job.products[0].id]: true });
        }
      } else {
        // Initialize layout with bulk state
        setJob({
          jobId,
          url: `Bulk Scrape: ${selectedUrls.length} links`,
          urls: selectedUrls,
          fileName: currentFileName,
          mode: fileExtractionMode,
          status: "analyzing",
          options: { includeGallery, includeVariants, useHighestResolution, removeDuplicates, includeStyleSiblings },
          progress: {
            currentStep: "Contacting remote server...",
            productsFound: selectedUrls.length,
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
        });

        startPolling(jobId);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRefreshJob = async () => {
    if (!activeJobId) return;
    try {
      const res = await fetch(`/api/jobs/${activeJobId}`);
      const data = await safeParseJsonResponse(res);
      setJob(data);
    } catch (err) {
      console.error("Failed to refresh job", err);
    }
  };

  // Trigger Demo Mode Pre-fill
  const handleLoadDemo = (type: "single" | "listing") => {
    if (type === "single") {
      setUrl("https://example.com/products/puffy-sleeve-sweater-top");
      setMode("product");
    } else {
      setUrl("https://example.com/collections/autumn-highlights");
      setMode("collection");
    }
    setError(null);
  };

  // Toggle expanded view for a product card
  const toggleProduct = (productId: string) => {
    setExpandedProducts(prev => ({
      ...prev,
      [productId]: !prev[productId]
    }));
  };

  // Helper: Trigger direct download for ZIP
  const handleDownloadZIP = () => {
    if (!activeJobId) return;
    window.location.href = `/api/jobs/${activeJobId}/download-zip`;
  };

  // Helper: Trigger single product folder ZIP download
  const handleDownloadProductFolder = (productId: string) => {
    if (!activeJobId) return;
    window.location.href = `/api/jobs/${activeJobId}/products/${productId}/download-zip`;
  };

  // Helper: Trigger single image download
  const handleDownloadSingleImage = (productId: string, imgId: string) => {
    if (!activeJobId) return;
    window.location.href = `/api/jobs/${activeJobId}/download-image/${productId}/${imgId}`;
  };

  // Cancel active scrape
  const handleCancelScrape = async () => {
    // 1. Immediately clear client polling
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    const currentJobId = activeJobId;
    setIsCancelling(true);
    setIsSubmitting(false);

    // 2. Call backend to stop crawler loops immediately
    if (currentJobId) {
      try {
        await fetch(`/api/jobs/${currentJobId}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
      } catch (err) {
        console.error("Failed to cancel job on server:", err);
      }
    }

    // 3. Reset client state cleanly
    setIsCancelling(false);
    setJob(null);
    setActiveJobId(null);
    setUrl("");
    setError("Scraping was cancelled.");
    setTimeout(() => {
      setError(null);
    }, 3000);
  };

  // Reset page
  const handleReset = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (activeJobId && (job?.status === "analyzing" || job?.status === "extracting")) {
      fetch(`/api/jobs/${activeJobId}/cancel`, { method: "POST" }).catch(() => {});
    }
    setUrl("");
    setJob(null);
    setActiveJobId(null);
    setError(null);
    setIsSubmitting(false);
    setIsCancelling(false);
    setExpandedProducts({});
    setPreviewImage(null);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] font-sans antialiased selection:bg-indigo-100 selection:text-indigo-900 pb-20">
      {/* HEADER BAR */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full border border-slate-200 bg-slate-100/60 flex items-center justify-center flex-shrink-0 overflow-hidden">
              <img 
                id="header-logo" 
                src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" 
                alt="" 
                className="w-full h-full object-contain" 
                referrerPolicy="no-referrer"
              />
            </div>
            <span className="font-extrabold text-[#0B132B] text-base sm:text-xl tracking-tight">
              360 RM : E-Commerce Image Extractor
            </span>
          </div>
          <div className="flex items-center gap-4">
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-10">
        
        {/* DEMO PLAYGROUND ANNOUNCEMENT */}
        {showDemoBanner && !job && (
          <div className="mb-6 bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 flex items-start gap-3.5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-100/30 rounded-full blur-2xl translate-x-12 -translate-y-12"></div>
            <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700 mt-0.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-indigo-900 text-sm mb-1">
                Out-of-the-Box Sandbox Testing
              </h4>
              <p className="text-xs text-indigo-700/95 leading-relaxed max-w-2xl">
                CORS rules block client-side extraction of some secure live sites. We built a robust **Sandbox Crawler** that simulates the full scraping, validating, sorting, and ZIP generation with real Unsplash images! Click a preset below to see the complete workflow.
              </p>
              <div className="flex gap-2.5 mt-3">
                <button
                  type="button"
                  onClick={() => handleLoadDemo("single")}
                  className="px-3 py-1.5 text-xs font-semibold bg-white text-indigo-700 border border-indigo-200 hover:border-indigo-300 rounded-lg shadow-sm hover:shadow-md transition-all cursor-pointer"
                >
                  ⚡ Try Single Product Demo
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadDemo("listing")}
                  className="px-3 py-1.5 text-xs font-semibold bg-white text-indigo-700 border border-indigo-200 hover:border-indigo-300 rounded-lg shadow-sm hover:shadow-md transition-all cursor-pointer"
                >
                  ⚡ Try Listing Collection Demo
                </button>
              </div>
            </div>
            <button
              onClick={() => setShowDemoBanner(false)}
              className="text-indigo-400 hover:text-indigo-700 transition-colors cursor-pointer"
              aria-label="Close banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* SCREEN 1: INPUT CONTROLS */}
          {!job && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
            >
              {/* TAB SWITCHER */}
              <div className="flex border-b border-slate-200 bg-slate-50 p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("url")}
                  className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-xs font-bold uppercase tracking-wider transition-all rounded-lg cursor-pointer ${
                    activeTab === "url"
                      ? "bg-white text-indigo-600 shadow-sm border border-slate-200/55 font-extrabold"
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/50"
                  }`}
                >
                  <Globe className="w-4 h-4" />
                  Extract from URL
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("file")}
                  className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-xs font-bold uppercase tracking-wider transition-all rounded-lg cursor-pointer ${
                    activeTab === "file"
                      ? "bg-white text-indigo-600 shadow-sm border border-slate-200/55 font-extrabold"
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/50"
                  }`}
                >
                  <FileUp className="w-4 h-4" />
                  Extract from File (PDF/CSV)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("html")}
                  className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-xs font-bold uppercase tracking-wider transition-all rounded-lg cursor-pointer ${
                    activeTab === "html"
                      ? "bg-white text-indigo-600 shadow-sm border border-slate-200/55 font-extrabold"
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/50"
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  Paste HTML Source
                </button>
              </div>

              {activeTab === "url" ? (
                <form onSubmit={handleStartExtraction} className="p-6 sm:p-8 space-y-6">
                  
                  {/* 1. URL INPUT */}
                  <div className="space-y-2">
                    <label htmlFor="url-input" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Website or Product URL
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Search className="w-5 h-5" />
                      </div>
                      <input
                        id="url-input"
                        type="url"
                        required
                        placeholder="Paste Shopify, WooCommerce, Square, BigCommerce, Wix, Squarespace, Magento, or custom store URL..."
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        className="block w-full pl-11 pr-4 py-3.5 text-slate-900 placeholder:text-slate-400 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all text-sm outline-none"
                      />
                    </div>
                    {/* SUPPORTED PLATFORMS PILLS */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-slate-500">
                      <span className="font-semibold text-slate-600">Supported:</span>
                      {["Shopify", "WooCommerce", "WordPress", "Square", "BigCommerce", "Wix", "Squarespace", "Magento", "PrestaShop", "Shopware", "Webflow", "Shift4Shop", "Clover", "Custom"].map((p) => (
                        <span key={p} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-medium">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* 2. MODE OPTION */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                        What would you like to extract from this link?
                      </label>
                    </div>
                    {[
                      { 
                        id: "auto", 
                        label: "Auto-Detect Link Type", 
                        desc: "Let our smart engine decide based on your link" 
                      },
                      { 
                        id: "product", 
                        label: "Single Product Images", 
                        desc: "Download all images for this particular item" 
                      },
                      { 
                        id: "collection", 
                        label: "Whole Listing / Collection", 
                        desc: "Download images of all products shown on this listing link" 
                      },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setMode(opt.id as any)}
                        className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                          mode === opt.id
                            ? "bg-indigo-50/70 border-indigo-500 ring-2 ring-indigo-50"
                            : "border-slate-200 hover:border-slate-300 bg-white"
                        }`}
                      >
                        <span className={`text-xs font-bold ${mode === opt.id ? "text-indigo-900" : "text-slate-800"}`}>
                          {opt.label}
                        </span>
                        <span className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                          {opt.desc}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* 3. SETTINGS TOGGLES */}
                  <div className="border-t border-slate-100 pt-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Settings className="w-4 h-4 text-slate-500" />
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Extraction Settings
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50/55 border border-emerald-100/50">
                        <div className="mt-0.5 w-4.5 h-4.5 rounded bg-emerald-100 flex items-center justify-center text-emerald-700 text-[10px] font-bold">✓</div>
                        <div>
                          <span className="text-xs font-bold text-slate-800">
                            Strict Product Image Only filter (Active)
                          </span>
                          <p className="text-[10px] text-slate-600 mt-0.5">
                            Smart system ignores website logos, banners, social media icons, and checkout trust badges to download ONLY actual product photos.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50/55 border border-emerald-100/50">
                        <div className="mt-0.5 w-4.5 h-4.5 rounded bg-emerald-100 flex items-center justify-center text-emerald-700 text-[10px] font-bold">✓</div>
                        <div>
                          <span className="text-xs font-bold text-slate-800">
                            Use Highest Quality (Active)
                          </span>
                          <p className="text-[10px] text-slate-600 mt-0.5">
                            Extract highest available resolution master assets from CDN
                          </p>
                        </div>
                      </div>

                      <label className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={includeVariants}
                          onChange={(e) => setIncludeVariants(e.target.checked)}
                          className="mt-0.5 w-4.5 h-4.5 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 transition-all accent-indigo-600"
                        />
                        <div>
                          <span className="text-xs font-semibold text-slate-800 group-hover:text-slate-900">
                            Include Option Variants (Colors & Sizes)
                          </span>
                          <p className="text-[10px] text-slate-500">
                            Extract images corresponding to specific variant swatches
                          </p>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={removeDuplicates}
                          onChange={(e) => setRemoveDuplicates(e.target.checked)}
                          className="mt-0.5 w-4.5 h-4.5 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 transition-all accent-indigo-600"
                        />
                        <div>
                          <span className="text-xs font-semibold text-slate-800 group-hover:text-slate-900">
                            Remove Duplicate Images
                          </span>
                          <p className="text-[10px] text-slate-500">
                            Automatically filter out identical duplicates
                          </p>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 p-3.5 rounded-xl transition-all cursor-pointer group col-span-1 sm:col-span-2 border border-dashed border-indigo-200 bg-indigo-50/30 hover:bg-indigo-50/50 hover:border-indigo-300">
                        <input
                          type="checkbox"
                          checked={includeStyleSiblings}
                          onChange={(e) => setIncludeStyleSiblings(e.target.checked)}
                          className="mt-1 w-4.5 h-4.5 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 transition-all accent-indigo-600"
                        />
                        <div>
                          <span className="text-xs font-bold text-indigo-950 group-hover:text-indigo-900 flex items-center gap-1.5">
                            Extract Sibling Colors (Whole Style Group)
                            <span className="bg-indigo-100 text-indigo-800 text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                              New Feature
                            </span>
                          </span>
                          <p className="text-[10px] text-slate-600 mt-1 leading-relaxed">
                            For products with multiple swatches (e.g. Core and Seasonal colors on Beyond Yoga), we'll automatically detect and crawl all color variation links on the page. Leave unchecked to only scrape the specific link provided.
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* ERROR FEEDBACK */}
                  {error && (
                    <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl flex flex-col gap-2.5 text-rose-800">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" />
                        <div className="text-xs">
                          <span className="font-bold">Extraction Error:</span> {error}
                        </div>
                      </div>
                      {(error.includes("Vercel") || error.includes("Cloudflare") || error.includes("Checkpoint") || error.includes("429")) && (
                        <div className="mt-1 pt-2.5 border-t border-rose-200/60 flex flex-wrap items-center justify-between gap-3">
                          <span className="text-[11px] text-rose-700 font-medium">
                            💡 WAF Security Checkpoint detected. Click below to paste the product page HTML source code directly!
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setPastedUrl(url);
                              setActiveTab("html");
                              setError(null);
                            }}
                            className="px-3.5 py-1.5 text-xs font-bold bg-white text-rose-700 border border-rose-200 hover:bg-rose-100/80 rounded-lg shadow-xs transition-all cursor-pointer"
                          >
                            Paste Page HTML Source
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TRIGGER EXTRACTION BUTTON */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold py-3.5 px-6 rounded-xl shadow-md shadow-indigo-100 hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-4.5 h-4.5 animate-spin" />
                        Contacting Scraper Engine...
                      </>
                    ) : (
                      <>
                        <Download className="w-4.5 h-4.5" />
                        START EXTRACTION
                      </>
                    )}
                  </button>
                </form>
              ) : activeTab === "file" ? (
                <div className="p-6 sm:p-8 space-y-6">
                  {/* File Upload Zone */}
                  <div
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                      dragActive
                        ? "border-indigo-500 bg-indigo-50/50"
                        : "border-slate-300 hover:border-indigo-400 bg-slate-50/50 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={handleFileChange}
                      accept=".pdf,.csv,.xlsx,.xls,.txt,.md,.json"
                    />
                    
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <Upload className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-slate-700">
                          Drag and drop your file here, or <span className="text-indigo-600 font-extrabold hover:text-indigo-700">browse</span>
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Supports Excel (XLSX/XLS), CSV, PDF, and TXT (Max 15MB)
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Loading State */}
                  {fileParsingState.isLoading && (
                    <div className="flex items-center justify-center gap-3 py-6 text-slate-600">
                      <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
                      <span className="text-xs font-semibold">Parsing file & extracting store links...</span>
                    </div>
                  )}

                  {/* Error State */}
                  {fileParsingState.error && (
                    <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-3 text-rose-800">
                      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" />
                      <div className="text-xs font-medium">
                        <span className="font-bold">Parsing Error:</span> {fileParsingState.error}
                      </div>
                    </div>
                  )}

                   {/* Result List */}
                   {fileParsingState.result && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <div>
                          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                            Extracted URL List
                          </h4>
                          <p className="text-[10px] text-slate-500">
                            Found {fileParsingState.result.count} valid store links in <span className="font-semibold text-slate-700">{fileParsingState.result.filename}</span>
                          </p>
                        </div>
                        {fileParsingState.result.count > 0 && (
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-green-50 text-green-700 border border-green-200 rounded-full">
                            Success
                          </span>
                        )}
                      </div>

                      {/* File specific Extraction Mode selector */}
                      {fileParsingState.result.count > 0 && (
                        <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 space-y-3">
                          <label className="block text-[11px] font-bold text-indigo-950 uppercase tracking-wider">
                            Choose Extraction Mode for File Links
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {[
                              { id: "auto", label: "Auto Detect", desc: "Based on store URL" },
                              { id: "product", label: "Product Page", desc: "Single page gallery" },
                              { id: "collection", label: "Collection / Listing", desc: "Scrape links & cards" },
                            ].map((opt) => (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => setFileExtractionMode(opt.id as any)}
                                className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                                  fileExtractionMode === opt.id
                                    ? "bg-white border-indigo-500 ring-2 ring-indigo-100 shadow-sm"
                                    : "border-slate-200 hover:border-slate-300 bg-white"
                                }`}
                              >
                                <span className={`text-xs font-bold ${fileExtractionMode === opt.id ? "text-indigo-900" : "text-slate-800"}`}>
                                  {opt.label}
                                </span>
                                <span className="text-[10px] text-slate-500 mt-0.5 leading-tight">
                                  {opt.desc}
                                </span>
                              </button>
                            ))}
                          </div>

                          <div className="border-t border-indigo-100 pt-3 mt-2 flex items-start gap-2.5">
                            <input
                              type="checkbox"
                              id="file-include-style-siblings"
                              checked={includeStyleSiblings}
                              onChange={(e) => setIncludeStyleSiblings(e.target.checked)}
                              className="mt-0.5 w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 transition-all accent-indigo-600 cursor-pointer"
                            />
                            <div>
                              <label htmlFor="file-include-style-siblings" className="block text-xs font-bold text-indigo-950 cursor-pointer">
                                Extract Sibling Colors (Style Group)
                              </label>
                              <p className="text-[10px] text-slate-500 leading-normal">
                                For swatched variant listings (like Core & Seasonal colors on Beyond Yoga), automatically crawl and extract images for all matching color variants on the same style.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {fileParsingState.result.count > 0 && (
                        <div className="pt-1 pb-1">
                          <button
                            type="button"
                            onClick={() => handleStartBulkExtraction(fileParsingState.result!.urls)}
                            className="w-full py-3.5 px-6 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-extrabold text-xs tracking-wider uppercase rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer border border-indigo-500/20 active:scale-[0.99]"
                          >
                            <FileArchive className="w-4.5 h-4.5 text-indigo-100" />
                            Extract All {fileParsingState.result.count} Links in Bulk
                          </button>
                        </div>
                      )}

                      {fileParsingState.result.count === 0 ? (
                        <div className="text-center py-6 border border-slate-100 rounded-xl bg-slate-50/50">
                          <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                          <p className="text-xs text-slate-600 font-medium">No valid web URLs starting with http:// or https:// were detected in this file.</p>
                        </div>
                      ) : (
                        <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 shadow-inner bg-slate-50/50 p-1 space-y-1">
                          {fileParsingState.result.urls.map((discoveredUrl, idx) => {
                            // Try to parse clean domain name
                            let domain = "";
                            try {
                              domain = new URL(discoveredUrl).hostname.replace("www.", "");
                            } catch (_) {
                              domain = "store link";
                            }
                            
                            // Shopify or WooCommerce heuristic
                            const isShopify = discoveredUrl.includes("shopify") || domain.includes("myshopify");
                            const isWoo = discoveredUrl.includes("wp-content") || discoveredUrl.includes("woocommerce");

                            return (
                              <div key={idx} className="flex items-center justify-between p-3 bg-white rounded-lg hover:bg-slate-50 transition-colors border border-slate-100/50 shadow-sm">
                                <div className="space-y-1 min-w-0 pr-4">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs font-bold text-slate-800 truncate max-w-[180px] sm:max-w-xs">
                                      {domain}
                                    </span>
                                    {isShopify && (
                                      <span className="px-1.5 py-0.5 text-[9px] font-bold bg-green-50 text-green-700 border border-green-200 rounded uppercase tracking-wider">
                                        Shopify
                                      </span>
                                    )}
                                    {isWoo && (
                                      <span className="px-1.5 py-0.5 text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded uppercase tracking-wider">
                                        WooCommerce
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-slate-400 truncate max-w-[200px] sm:max-w-md font-mono">
                                    {discoveredUrl}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  disabled={isSubmitting}
                                  onClick={() => handleStartFileUrlExtraction(discoveredUrl)}
                                  className="shrink-0 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-bold rounded-lg transition-all cursor-pointer shadow-sm hover:shadow"
                                >
                                  Extract Images
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={handleExtractFromHtml} className="p-6 sm:p-8 space-y-6">
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Product Page URL (Optional Reference)
                    </label>
                    <input
                      type="url"
                      placeholder="https://paige.com/products/men-lennox-emberton-1"
                      value={pastedUrl}
                      onChange={(e) => setPastedUrl(e.target.value)}
                      className="block w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all outline-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Paste Product Page HTML Source Code
                    </label>
                    <p className="text-xs text-slate-500">
                      On the product page, press <strong>Ctrl+U</strong> (or <strong>Cmd+Option+U</strong> on Mac) to view page source, select all (<strong>Ctrl+A</strong>), copy and paste here.
                    </p>
                    <textarea
                      required
                      rows={10}
                      placeholder="<!DOCTYPE html><html><head>... Paste complete product page HTML source code here ...</html>"
                      value={pastedHtml}
                      onChange={(e) => setPastedHtml(e.target.value)}
                      className="block w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all outline-none"
                    />
                  </div>

                  {error && (
                    <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-3 text-rose-800">
                      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" />
                      <div className="text-xs">
                        <span className="font-bold">Extraction Error:</span> {error}
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold py-3.5 px-6 rounded-xl shadow-md shadow-indigo-100 hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-4.5 h-4.5 animate-spin" />
                        Parsing HTML & Extracting Images...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4.5 h-4.5" />
                        EXTRACT IMAGES FROM HTML SOURCE
                      </>
                    )}
                  </button>
                </form>
              )}
            </motion.div>
          )}

          {/* SCREEN 2: PROGRESS LOADER */}
          {job && job.status !== "completed" && job.status !== "failed" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6 text-center"
            >
              <div className="relative w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-t-indigo-600 rounded-full animate-spin"></div>
                <ImageIcon className="w-6 h-6 text-indigo-600" />
              </div>

              <div className="space-y-1.5">
                <h3 className="font-bold text-lg text-slate-900 uppercase tracking-wide">
                  {job.status === "analyzing" ? "Analyzing Web Architecture..." : "Extracting Image Assets..."}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Scanning public endpoints & elements. This handles upscaling and validation.
                </p>
              </div>

              {/* PROGRESS BAR */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-slate-600 font-bold px-1">
                  <span>{job.progress.currentStep}</span>
                  <span>{job.progress.percent}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200/50">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${job.progress.percent}%` }}
                    transition={{ duration: 0.4 }}
                    className="bg-indigo-600 h-full rounded-full"
                  ></motion.div>
                </div>
              </div>

              {/* LIVE SCRAPE METRICS */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl text-left border border-slate-150">
                <div>
                  <span className="block text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                    Products Located
                  </span>
                  <span className="text-base font-bold text-slate-900 mt-0.5 block">
                    {job.progress.currentProductIndex > 0 
                      ? `${job.progress.currentProductIndex} / ${job.progress.productsFound}`
                      : job.progress.productsFound || "Scanning..."}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                    Total Images Found
                  </span>
                  <span className="text-base font-bold text-slate-900 mt-0.5 block">
                    {job.progress.imagesFound}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                    Downloaded & Verify
                  </span>
                  <span className="text-base font-bold text-emerald-600 mt-0.5 block">
                    {job.progress.imagesDownloaded}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                    Duplicates Skipped
                  </span>
                  <span className="text-base font-bold text-indigo-600 mt-0.5 block">
                    {job.progress.duplicatesRemoved}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                {job.storeName && (
                  <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200/80 py-1.5 px-3.5 rounded-lg inline-flex items-center gap-1.5 font-bold shadow-xs">
                    <Building2 className="w-3.5 h-3.5 text-amber-600" />
                    Company: <span className="font-extrabold text-amber-950">{job.storeName}</span>
                  </div>
                )}
                {job.progress.currentProductName && (
                  <div className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 py-1.5 px-3.5 rounded-lg inline-flex items-center gap-1.5 font-semibold">
                    Current target: <span className="font-bold">{job.progress.currentProductName}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 pt-5 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleCancelScrape}
                  disabled={isCancelling}
                  className="px-4 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isCancelling ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-600" />
                      <span>Cancelling scrape...</span>
                    </>
                  ) : (
                    <span>Cancel Scrape</span>
                  )}
                </button>
                <span className="text-[11px] text-slate-400">
                  Stops backend extraction and discards in-flight requests
                </span>
              </div>
            </motion.div>
          )}

          {/* SCREEN 3: RESULTS DASHBOARD */}
          {job && job.status === "completed" && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* TOP ACTION BAR */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50 border border-slate-200/60 p-4 rounded-2xl shadow-xs">
                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full sm:w-auto px-5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 font-extrabold text-xs tracking-wider uppercase rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                >
                  <ArrowLeft className="w-4.5 h-4.5 text-slate-500" />
                  Go Back to Extractor
                </button>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handleRefreshJob}
                    className="w-full sm:w-auto px-5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 font-extrabold text-xs tracking-wider uppercase rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                  >
                    <RefreshCw className="w-4 h-4 text-slate-500" />
                    Refresh Dashboard
                  </button>
                </div>
              </div>

              {/* SUCCESS OVERHEAD BANNER */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                      <CheckCircle2 className="w-5.5 h-5.5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-extrabold text-lg text-slate-950">
                          Extraction Complete!
                        </h3>
                        {job.fileName ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-900 border border-indigo-200/90 shadow-xs">
                            <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
                            <span className="font-black text-indigo-950">{job.fileName}</span>
                          </span>
                        ) : (
                          <>
                            {(job.storeName || job.products[0]?.storeName) && (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200/90 shadow-xs">
                                <Building2 className="w-3.5 h-3.5 text-amber-600" />
                                Company: <span className="font-black text-amber-950">{job.storeName || job.products[0]?.storeName}</span>
                              </span>
                            )}
                            {(job.detectedPlatform || job.products[0]?.platform) && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                {getPOSDisplayName(job.detectedPlatform || job.products[0]?.platform, job.url)}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                      {job.fileName ? (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-slate-500">
                          <span>
                            Source File: <span className="font-semibold text-slate-700">{job.fileName}</span>
                          </span>
                          <span>•</span>
                          <span>
                            Processed: <span className="font-semibold text-slate-700">{job.products.length} {job.products.length === 1 ? 'store link' : 'store links'}</span>
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-slate-500">
                          {(job.storeName || job.products[0]?.storeName) && (
                            <>
                              <span className="font-bold text-slate-800 flex items-center gap-1">
                                <Store className="w-3.5 h-3.5 text-amber-600 inline" />
                                Store Name: <span className="text-amber-950 font-extrabold">{job.storeName || job.products[0]?.storeName}</span>
                              </span>
                              <span>•</span>
                            </>
                          )}
                          <span>
                            Processed: <span className="font-semibold text-slate-700 break-all">{job.url}</span>
                          </span>
                        </div>
                      )}
                      {job.collectionStats && (
                        <div className="flex items-center gap-3 mt-1.5 text-[11px] font-medium text-slate-600">
                          <span className="text-emerald-600 font-bold">
                            ✓ {job.collectionStats.successful} Succeeded
                          </span>
                          {job.collectionStats.failed > 0 && (
                            <span className="text-rose-600 font-bold">
                              ✗ {job.collectionStats.failed} Failed
                            </span>
                          )}
                          {job.collectionStats.skipped > 0 && (
                            <span className="text-slate-500">
                              • {job.collectionStats.skipped} Skipped
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* HERO DOWNLOAD BUTTONS */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadZIP}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm hover:shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileArchive className="w-4 h-4" />
                      Download Complete ZIP
                    </button>
                    <button
                      type="button"
                      onClick={handleReset}
                      className="px-3 py-2.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-semibold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      New Scrape
                    </button>
                  </div>
                </div>

                {/* METRICS DASHBOARD GRID */}
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                    Extraction Overview
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
                    {[
                      { 
                        label: "Products Found", 
                        val: job.products.length, 
                        color: "text-slate-900", 
                        bg: "bg-slate-50",
                        icon: <Folder className="w-4 h-4 text-slate-500" />
                      },
                      { 
                        label: "Images Extracted", 
                        val: job.products.reduce((acc, p) => acc + p.images.length, 0), 
                        color: "text-indigo-600", 
                        bg: "bg-indigo-50/40",
                        icon: <ImageIcon className="w-4 h-4 text-indigo-500" />
                      },
                      { 
                        label: "Downloaded File", 
                        val: job.products.reduce((acc, p) => acc + p.images.filter(i => i.downloadStatus === "Downloaded").length, 0), 
                        color: "text-emerald-600", 
                        bg: "bg-emerald-50/40",
                        icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      },
                      { 
                        label: "Duplicates Skipped", 
                        val: job.progress.duplicatesRemoved, 
                        color: "text-amber-600", 
                        bg: "bg-amber-50/40",
                        icon: <Layers className="w-4 h-4 text-amber-500" />
                      },
                      { 
                        label: "Failed Downloads", 
                        val: job.progress.imagesFailed, 
                        color: job.progress.imagesFailed > 0 ? "text-rose-600" : "text-slate-400", 
                        bg: "bg-slate-50",
                        icon: <AlertCircle className="w-4 h-4 text-rose-400" />
                      },
                    ].map((stat, i) => (
                      <div key={i} className={`p-4 rounded-xl border border-slate-150 text-left ${stat.bg}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            {stat.label}
                          </span>
                          {stat.icon}
                        </div>
                        <span className={`text-xl font-black ${stat.color}`}>
                          {stat.val}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CSV DOWNLOAD ROW */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl gap-3">
                  <div className="flex items-center gap-2.5">
                    <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        product_data.csv
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        Fully mapped CSV including Product Title, Variant, CDN URL, Image Type and File Name references. (Also included inside ZIP)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={`/api/jobs/${job.jobId}/download-csv`}
                      download="product_data.csv"
                      className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download CSV
                    </a>
                    <button
                      type="button"
                      onClick={handleDownloadZIP}
                      className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      Get Inside ZIP <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>

              {/* PRODUCTS DIRECTORY SECTION */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Extracted Folders Directory
                </h3>

                {job.products.map((product) => {
                  const isExpanded = !!expandedProducts[product.id];
                  const downloadedImagesCount = product.images.filter(i => i.downloadStatus === "Downloaded").length;
                  const storeName = product.storeName || job.storeName || "Store";
                  const folderTitle = `${storeName} - ${product.name}`;

                  return (
                    <div key={product.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                      
                      {/* Product Header Card */}
                      <div 
                        onClick={() => toggleProduct(product.id)}
                        className="p-4 sm:p-5 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-50 transition-colors select-none"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0 border border-slate-200">
                            <Folder className="w-5.5 h-5.5 fill-slate-400 stroke-slate-500" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-bold text-sm text-slate-900 truncate" title={folderTitle}>
                                {folderTitle}
                              </h4>
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200/80 rounded-md shrink-0">
                                {getPOSDisplayName(product.platform || job.detectedPlatform, product.url || job.url)}
                              </span>
                            </div>
                            <div className="flex items-center gap-3.5 mt-1 text-[11px] text-slate-500 font-medium">
                              <span className="flex items-center gap-1">
                                <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                                {downloadedImagesCount} images downloaded
                              </span>
                              {product.variants.length > 0 && (
                                <span className="flex items-center gap-1">
                                  <Layers className="w-3.5 h-3.5 text-slate-400" />
                                  {product.variants.length} options mapped
                                </span>
                              )}
                              <a 
                                href={product.url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()} // don't toggle accordion
                                className="text-indigo-600 hover:underline flex items-center gap-0.5 font-semibold"
                              >
                                Source Page <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadProductFolder(product.id);
                            }}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-slate-700 hover:text-indigo-700 font-bold text-[11px] rounded-lg transition-colors flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            Get Folder
                          </button>
                          <div className="text-slate-400">
                            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                          </div>
                        </div>
                      </div>

                      {/* Product Gallery Expanded Block */}
                      {isExpanded && (
                        <div className="border-t border-slate-100 bg-slate-50/50 p-4 sm:p-5">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {product.images.map((img) => (
                              <div 
                                key={img.id}
                                className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition-shadow group flex flex-col justify-between"
                              >
                                {/* Thumbnail Image */}
                                <div className="aspect-square bg-slate-100 relative overflow-hidden border-b border-slate-100">
                                  {img.downloadStatus === "Downloaded" ? (
                                    <>
                                      <img
                                        src={`/api/jobs/${job.jobId}/products/${product.id}/images/${img.id}`}
                                        alt={img.filename}
                                        referrerPolicy="no-referrer"
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 cursor-zoom-in"
                                        onClick={() => setPreviewImage({ product, image: img })}
                                      />
                                      {/* Type Badge */}
                                      <span className="absolute top-2 left-2 px-1.5 py-0.5 text-[9px] font-bold bg-slate-900/85 text-white rounded">
                                        {img.variant && img.variant !== "General" ? img.variant : img.type}
                                      </span>
                                    </>
                                  ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
                                      <AlertCircle className="w-8 h-8 text-rose-400 mb-1" />
                                      <span className="text-[10px] font-bold text-rose-600 block">
                                        Download Failed
                                      </span>
                                      <p className="text-[8px] text-slate-500 mt-0.5 line-clamp-2">
                                        {img.error || "Blocked / CORS / CDN"}
                                      </p>
                                    </div>
                                  )}
                                </div>

                                {/* Text specifications */}
                                <div className="p-3 space-y-1.5">
                                  <span className="block text-[10px] font-bold text-slate-400 truncate uppercase tracking-wider">
                                    {img.resolution} • {img.size}
                                  </span>
                                  <h5 className="font-semibold text-xs text-slate-800 line-clamp-1" title={img.filename}>
                                    {img.filename}
                                  </h5>
                                  
                                  {img.downloadStatus === "Downloaded" && (
                                    <button
                                      type="button"
                                      onClick={() => handleDownloadSingleImage(product.id, img.id)}
                                      className="w-full py-1.5 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-slate-700 hover:text-indigo-700 rounded-lg text-[10px] font-bold transition-colors flex items-center justify-center gap-1"
                                    >
                                      <Download className="w-3 h-3" />
                                      Download File
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* FAILED DOWNLOADS ERROR REPORT */}
              {job.failedDownloads.length > 0 && (
                <div className="bg-white rounded-xl border border-rose-150 p-5 space-y-3">
                  <div className="flex items-center gap-2 text-rose-800">
                    <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
                    <h4 className="font-bold text-sm">
                      Extraction Exceptions Report ({job.failedDownloads.length} item{job.failedDownloads.length > 1 ? "s" : ""})
                    </h4>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Some images could not be successfully loaded or resolved. This is common when external CDNs block crawler user-agents or require browser-level authentication. Remaining assets have been packaged successfully!
                  </p>
                  <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-lg text-[11px] font-mono p-3 bg-slate-50 text-slate-600 space-y-2">
                    {job.failedDownloads.map((fail, i) => (
                      <div key={i} className="flex justify-between border-b border-slate-100/60 pb-1.5 last:border-0 last:pb-0">
                        <span className="truncate max-w-lg text-slate-700" title={fail.url}>{fail.url}</span>
                        <span className="text-rose-600 font-semibold shrink-0">{fail.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* FOOTER */}
      <footer className="mt-20 border-t border-slate-200 pt-8 max-w-4xl mx-auto px-4 text-center space-y-3 text-slate-400">
        <p className="text-xs">
          © 2026 360 RM : E-Commerce Image Extractor. Dedicated to providing highly verified structured retail files.
        </p>
      </footer>

      {/* PORTAL OVERLAY: FULL-RESOLUTION ZOOM LIGHTBOX */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div 
            className="bg-white rounded-2xl overflow-hidden max-w-2xl w-full border border-slate-800 flex flex-col relative"
            onClick={(e) => e.stopPropagation()} // prevent close
          >
            {/* Image Box */}
            <div className="bg-slate-950 flex items-center justify-center p-2 relative aspect-video">
              <img
                src={`/api/jobs/${job?.jobId}/products/${previewImage.product.id}/images/${previewImage.image.id}`}
                alt={previewImage.image.filename}
                className="max-h-full max-w-full object-contain shadow-2xl"
              />
              <button
                onClick={() => setPreviewImage(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center cursor-pointer transition-colors"
                aria-label="Close preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Spec Details Panel */}
            <div className="p-5 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="font-extrabold text-sm text-slate-900">
                    {previewImage.image.filename}
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Product: <span className="font-bold text-slate-700">{previewImage.product.name}</span>
                  </p>
                </div>
                <button
                  onClick={() => handleDownloadSingleImage(previewImage.product.id, previewImage.image.id)}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow-sm transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download File
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs border-t border-slate-100 pt-3 text-slate-600 font-medium">
                <div>
                  <span className="block text-[10px] uppercase text-slate-400 font-bold">Resolution</span>
                  {previewImage.image.resolution}
                </div>
                <div>
                  <span className="block text-[10px] uppercase text-slate-400 font-bold">File Size</span>
                  {previewImage.image.size}
                </div>
                <div>
                  <span className="block text-[10px] uppercase text-slate-400 font-bold">Variant Mapped</span>
                  {previewImage.image.variant || "General"}
                </div>
                <div>
                  <span className="block text-[10px] uppercase text-slate-400 font-bold">Extraction Source</span>
                  {previewImage.image.type}
                </div>
              </div>

              <div className="text-[10px] text-slate-400 font-mono select-all truncate border-t border-slate-100 pt-3">
                Source CDN: {previewImage.image.originalUrl}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
