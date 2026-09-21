export interface ImageMetadata {
  id: string;
  filename: string;
  originalUrl: string;
  resolution: string;
  size: string; // e.g. "1.2 MB"
  variant: string; // e.g. "Blue", "Black", "General"
  type: string; // e.g. "Main", "Gallery", "Variant"
  contentType: string;
  downloadStatus: 'Downloaded' | 'Failed';
  error?: string;
}

export interface ProductData {
  id: string;
  name: string;
  url: string;
  images: ImageMetadata[];
  variants: string[];
}

export interface ExtractionJob {
  jobId: string;
  url: string;
  urls?: string[];
  mode: 'auto' | 'product' | 'collection';
  status: 'idle' | 'analyzing' | 'extracting' | 'completed' | 'failed';
  options: {
    includeGallery: boolean;
    includeVariants: boolean;
    useHighestResolution: boolean;
    removeDuplicates: boolean;
    includeStyleSiblings?: boolean;
  };
  progress: {
    currentStep: string;
    productsFound: number;
    currentProductIndex: number;
    currentProductName: string;
    imagesFound: number;
    imagesDownloaded: number;
    imagesFailed: number;
    duplicatesRemoved: number;
    percent: number;
  };
  products: ProductData[];
  failedDownloads: { url: string; error: string }[];
  error?: string;
}
