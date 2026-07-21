/** Fixed-template content for a world-class product page (bike or accessory/part). */

export type WorldClassProductKind = "bike" | "non_bike";

export type WorldClassKeyStat = {
  label: string;
  value: string;
};

export type WorldClassHighlight = {
  title: string;
  description: string;
};

export type WorldClassSpecSection = {
  title: string;
  specs: Array<{ label: string; value: string }>;
};

export type WorldClassTechItem = {
  name: string;
  description: string;
};

export type WorldClassRiderFit = {
  bestFor: string[];
  notIdealFor: string[];
  ridingStyles: string[];
  sizingNotes: string | null;
};

export type WorldClassBrandStory = {
  name: string;
  established: string | null;
  origin: string | null;
  tagline: string | null;
  paragraphs: string[];
  highlights: string[];
};

export type WorldClassComparison = {
  competitor: string;
  summary: string;
  /** Wins for this product (named thisBikeWins for bike pages; same meaning for non-bike). */
  thisBikeWins: string[];
  competitorWins: string[];
  /** Product photo of the rival, discovered via image search. */
  competitorImageUrl: string | null;
};

export type WorldClassInsight = {
  title: string;
  body: string;
};

export type WorldClassImage = {
  url: string;
  caption: string | null;
  sourceUrl: string | null;
  role: "hero" | "gallery" | "detail" | "lifestyle";
  /**
   * Camera angle assigned by the vision verification pass (e.g. "full_side",
   * "detail_closeup", "action_riding"). Absent on pages generated before
   * vision verification existed.
   */
  viewAngle?: string | null;
};

export type WorldClassVideo = {
  videoId: string;
  title: string;
  channel: string | null;
  thumbnailUrl: string | null;
};

export type WorldClassSource = {
  url: string;
  title: string;
  isOfficialBrand: boolean;
};

/** Audit trail proving the content came from live web research. */
export type WorldClassResearchMeta = {
  /** Official brand domain used for site-restricted searches. */
  officialDomain: string | null;
  /** Exact official product page URL, when found. */
  officialProductUrl: string | null;
  /** True when specs were extracted from the official brand site. */
  officialSpecsVerified: boolean;
  /** Hosted web-search invocations across all research passes. */
  webSearchCount: number;
  officialSourceCount: number;
  totalSourceCount: number;
};

export type WorldClassProductPage = {
  /** Bike vs accessory/part. Older published pages omit this; treat as bike. */
  productKind?: WorldClassProductKind;
  productName: string;
  brand: string | null;
  brandLogoUrl: string | null;
  model: string | null;
  modelYear: string | null;
  /** Bicycle discipline (road, gravel, MTB…). Null for non-bike. */
  bikeType: string | null;
  /** Accessory/part category (helmet, groupset, pedals…). Null/absent for bikes. */
  productCategory?: string | null;
  tagline: string | null;
  heroSummary: string | null;
  keyStats: WorldClassKeyStat[];
  overviewParagraphs: string[];
  /** Ideal rider (bike) or ideal buyer/use (non-bike). */
  idealRider: string | null;
  highlights: WorldClassHighlight[];
  specifications: WorldClassSpecSection[];
  technology: WorldClassTechItem[];
  /** Rider fit (bike) or buyer fit / compatibility guidance (non-bike). */
  riderFit: WorldClassRiderFit | null;
  brandStory: WorldClassBrandStory | null;
  comparisons: WorldClassComparison[];
  expertInsights: WorldClassInsight[];
  images: WorldClassImage[];
  videos: WorldClassVideo[];
  sources: WorldClassSource[];
  research: WorldClassResearchMeta;
  generatedAt: string;
  query: string;
};

export type GenerateProgressStage =
  | "started"
  | "official"
  | "researching"
  | "images"
  | "videos"
  | "assembling"
  | "complete"
  | "error";

export type GenerateProgressEvent = {
  stage: GenerateProgressStage;
  message: string;
  page?: WorldClassProductPage;
  error?: string;
};
