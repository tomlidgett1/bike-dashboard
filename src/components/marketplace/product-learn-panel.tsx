"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, 
  Sparkles, 
  ThumbsUp, 
  ThumbsDown, 
  Lightbulb, 
  ExternalLink,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Search
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";
import type { MarketplaceProduct } from "@/lib/types/marketplace";

// ============================================================
// Types
// ============================================================

interface LearnResult {
  summary: string;
  keyFeatures: string[];
  pros: string[];
  cons: string[];
  priceAnalysis: {
    verdict: 'great_deal' | 'fair_price' | 'above_market' | 'unknown';
    explanation: string;
    marketRange?: {
      min: number;
      max: number;
    };
  };
  buyerTips: string[];
  sources: Array<{
    title: string;
    url: string;
  }>;
}

interface ProductLearnPanelProps {
  product: MarketplaceProduct;
  isOpen: boolean;
  onClose: () => void;
}

// ============================================================
// Loading Messages - Rotating Animation
// ============================================================

const LOADING_MESSAGES = [
  "Thinking...",
  "Searching the web...",
  "Analysing cycling websites...",
  "Gathering expert insights...",
  "Compiling information...",
];

// ============================================================
// Collapsible Section
// ============================================================

function CollapsibleSection({ 
  title, 
  icon: Icon, 
  children, 
  defaultOpen = true 
}: { 
  title: string; 
  icon: React.ElementType; 
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-gray-600" />
          <span className="font-medium text-gray-900 text-sm">{title}</span>
        </div>
        <ChevronDown 
          className={cn(
            "h-4 w-4 text-gray-400 transition-transform duration-200",
            isOpen && "rotate-180"
          )} 
        />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ 
              duration: 0.4,
              ease: [0.04, 0.62, 0.23, 0.98]
            }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// Price Verdict Badge
// ============================================================

function PriceVerdictBadge({ verdict }: { verdict: string }) {
  const config: Record<string, { bg: string; text: string; icon: React.ElementType; label: string }> = {
    great_deal: { bg: "bg-green-100", text: "text-green-800", icon: CheckCircle2, label: "Great Deal" },
    fair_price: { bg: "bg-gray-100", text: "text-gray-800", icon: TrendingUp, label: "Fair Price" },
    above_market: { bg: "bg-amber-100", text: "text-amber-800", icon: AlertCircle, label: "Above Market" },
    unknown: { bg: "bg-gray-100", text: "text-gray-600", icon: Search, label: "Price Unknown" },
  };

  const { bg, text, icon: Icon, label } = config[verdict] || config.unknown;

  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium", bg, text)}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

// ============================================================
// Skeleton Loading
// ============================================================

function SkeletonLine({ width = "100%" }: { width?: string }) {
  return (
    <motion.div
      animate={{ opacity: [0.3, 0.6, 0.3] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      className="h-3 bg-gray-200 rounded-md"
      style={{ width }}
    />
  );
}

// ============================================================
// Main Component
// ============================================================

export function ProductLearnPanel({ product, isOpen, onClose }: ProductLearnPanelProps) {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = React.useState(false);
  const [messageIndex, setMessageIndex] = React.useState(0);
  const [result, setResult] = React.useState<LearnResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isMobile, setIsMobile] = React.useState(false);

  // Detect mobile vs desktop
  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Rotate loading messages every 2.5 seconds (same as ai-search-loading)
  React.useEffect(() => {
    if (!isLoading) {
      setMessageIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2500);

    return () => clearInterval(interval);
  }, [isLoading]);

  // Convert user to boolean for stable dependency
  const isLoggedIn = !!user;

  // Fetch product research when panel opens (only if logged in)
  React.useEffect(() => {
    if (!isOpen || result || isLoading || !isLoggedIn) return;

    const fetchResearch = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/product-learn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productName: (product as any).display_name || product.description,
            brand: (product as any).brand,
            model: (product as any).model,
            category: product.marketplace_category,
            subcategory: product.marketplace_subcategory,
            price: product.price,
            condition: (product as any).condition_rating,
            bikeType: (product as any).bike_type,
            frameSize: (product as any).frame_size,
            groupset: (product as any).groupset,
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to research product');
        }

        setResult(data.result);
      } catch (err) {
        console.error('Product learn error:', err);
        setError((err as Error).message || 'Something went wrong');
      } finally {
        setIsLoading(false);
      }
    };

    fetchResearch();
  }, [isOpen, result, isLoading, product, isLoggedIn]);

  // Reset state when panel closes
  const handleClose = () => {
    onClose();
    // Delay reset to allow animation to complete
    setTimeout(() => {
      setResult(null);
      setError(null);
      setIsLoading(false);
      setMessageIndex(0);
    }, 300);
  };

  // Prevent body scroll when panel is open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Results Content - shared between mobile and desktop
  const ResultsContent = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.2, duration: 0.3 }}
      className="space-y-4"
    >
      {/* Summary */}
      <div className="bg-white border border-gray-200 rounded-md p-4">
        <p className="text-sm text-gray-700 leading-relaxed">{result?.summary}</p>
      </div>

      {/* Key Features */}
      <CollapsibleSection title="Key Features" icon={Sparkles}>
        <ul className="space-y-2">
          {result?.keyFeatures.map((feature, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
              <CheckCircle2 className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CollapsibleSection>

      {/* Pros & Cons */}
      <div className="grid grid-cols-2 gap-3">
        {/* Pros */}
        <div className="bg-white border border-gray-200 rounded-md p-4">
          <div className="flex items-center gap-2 mb-3">
            <ThumbsUp className="h-4 w-4 text-green-600" />
            <span className="font-medium text-gray-900 text-sm">Pros</span>
          </div>
          <ul className="space-y-2">
            {result?.pros.map((pro, i) => (
              <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                <span className="text-green-500 mt-0.5">+</span>
                <span>{pro}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Cons */}
        <div className="bg-white border border-gray-200 rounded-md p-4">
          <div className="flex items-center gap-2 mb-3">
            <ThumbsDown className="h-4 w-4 text-red-500" />
            <span className="font-medium text-gray-900 text-sm">Cons</span>
          </div>
          <ul className="space-y-2">
            {result?.cons.map((con, i) => (
              <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                <span className="text-red-400 mt-0.5">−</span>
                <span>{con}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Price Analysis */}
      <CollapsibleSection title="Price Analysis" icon={TrendingUp}>
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <PriceVerdictBadge verdict={result?.priceAnalysis.verdict || 'unknown'} />
            {result?.priceAnalysis.marketRange && (
              <span className="text-xs text-gray-500">
                Market: ${result.priceAnalysis.marketRange.min.toLocaleString()} - ${result.priceAnalysis.marketRange.max.toLocaleString()}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-700">{result?.priceAnalysis.explanation}</p>
        </div>
      </CollapsibleSection>

      {/* Buyer Tips */}
      <CollapsibleSection title="Buyer Tips" icon={Lightbulb} defaultOpen={false}>
        <ul className="space-y-2">
          {result?.buyerTips.map((tip, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
              <span className="text-amber-500 mt-0.5">💡</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </CollapsibleSection>

      {/* Sources */}
      {result?.sources && result.sources.length > 0 && (
        <CollapsibleSection title={`Sources (${result.sources.length})`} icon={ExternalLink} defaultOpen={false}>
          <ul className="space-y-2">
            {result.sources.map((source, i) => (
              <li key={i}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline"
                >
                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{source.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-gray-400 text-center pt-2 pb-4">
        AI-generated research. Always verify details with the seller.
      </p>
    </motion.div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* ============================================================ */}
          {/* DESKTOP: Centered Modal Popup */}
          {/* ============================================================ */}
          {!isMobile && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 bg-black/50 z-[100] hidden lg:block"
                onClick={handleClose}
              />

              {/* Modal */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
                className="fixed inset-0 z-[100] hidden lg:flex items-center justify-center p-8"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="relative bg-white rounded-md shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
                  {/* Header */}
                  <div className="flex-shrink-0 flex items-center justify-between p-5 border-b border-gray-200">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-gray-900 flex items-center justify-center">
                        <Sparkles className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900">AI Research</h2>
                        <p className="text-sm text-gray-500">Powered by AI</p>
                      </div>
                    </div>
                    <button
                      onClick={handleClose}
                      className="p-2 rounded-md hover:bg-gray-100 transition-colors"
                    >
                      <X className="h-5 w-5 text-gray-500" />
                    </button>
                  </div>

                  {/* Content */}
                  <div className="flex-1 overflow-y-auto p-5">
                    {/* Loading State */}
                    {isLoading && !result && (
                      <div className="space-y-6">
                        {/* Animated Status */}
                        <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-md">
                          <div className="flex items-center gap-1.5">
                            {[0, 1, 2].map((i) => (
                              <motion.div
                                key={i}
                                animate={{
                                  scale: [1, 1.3, 1],
                                  opacity: [0.4, 1, 0.4],
                                }}
                                transition={{
                                  duration: 1,
                                  repeat: Infinity,
                                  ease: "easeInOut",
                                  delay: i * 0.15,
                                }}
                                className="h-2 w-2 bg-[#FFC72C] rounded-full"
                              />
                            ))}
                          </div>
                          <div className="h-6 flex items-center">
                            <AnimatePresence mode="wait">
                              <motion.p
                                key={messageIndex}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{
                                  duration: 0.4,
                                  ease: [0.04, 0.62, 0.23, 0.98],
                                }}
                                className="text-sm font-medium text-gray-600"
                              >
                                {LOADING_MESSAGES[messageIndex]}
                              </motion.p>
                            </AnimatePresence>
                          </div>
                        </div>

                        {/* Skeleton */}
                        <div className="space-y-4">
                          <div className="bg-white border border-gray-200 rounded-md p-4 space-y-3">
                            <SkeletonLine width="90%" />
                            <SkeletonLine width="75%" />
                            <SkeletonLine width="85%" />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white border border-gray-200 rounded-md p-4 space-y-3">
                              <SkeletonLine width="50%" />
                              <SkeletonLine width="80%" />
                              <SkeletonLine width="70%" />
                            </div>
                            <div className="bg-white border border-gray-200 rounded-md p-4 space-y-3">
                              <SkeletonLine width="50%" />
                              <SkeletonLine width="80%" />
                              <SkeletonLine width="70%" />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Error State */}
                    {error && !isLoading && (
                      <div className="text-center py-12">
                        <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                          <AlertCircle className="h-6 w-6 text-red-600" />
                        </div>
                        <p className="text-base font-medium text-gray-900 mb-2">Research Failed</p>
                        <p className="text-sm text-gray-500 mb-4">{error}</p>
                        <button
                          onClick={() => {
                            setError(null);
                            setResult(null);
                          }}
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                        >
                          Try Again
                        </button>
                      </div>
                    )}

                    {/* Results */}
                    {result && !isLoading && <ResultsContent />}
                  </div>
                </div>
              </motion.div>
            </>
          )}

          {/* ============================================================ */}
          {/* MOBILE: Bottom Sheet */}
          {/* ============================================================ */}
          {isMobile && (
            <>
              {/* Backdrop - only show when expanded */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: result || error ? 1 : 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  "fixed inset-0 bg-black/50 z-50 lg:hidden",
                  !(result || error) && "pointer-events-none"
                )}
                onClick={handleClose}
              />

              {/* Panel Container */}
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ 
                  type: "spring",
                  damping: 30,
                  stiffness: 300
                }}
                className="fixed bottom-0 left-0 right-0 z-50 lg:hidden"
              >
                {/* Loading State - Compact Bottom Bar */}
                {isLoading && !result && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ 
                      opacity: 1, 
                      y: 0,
                      boxShadow: [
                        "0 -4px 20px rgba(0, 0, 0, 0.15)",
                        "0 -4px 25px rgba(0, 0, 0, 0.2)",
                        "0 -4px 20px rgba(0, 0, 0, 0.15)"
                      ]
                    }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{ 
                      boxShadow: {
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }
                    }}
                    className="bg-white rounded-t-xl border-t border-x border-gray-300"
                  >
                    <div className="px-4 py-4">
                      {/* Header Row */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-gray-900 flex items-center justify-center">
                            <Sparkles className="h-4 w-4 text-white" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">AI Research</p>
                            <p className="text-xs text-gray-500">Analysing product...</p>
                          </div>
                        </div>
                        <button
                          onClick={handleClose}
                          className="p-2 rounded-md hover:bg-gray-100 transition-colors"
                        >
                          <X className="h-5 w-5 text-gray-500" />
                        </button>
                      </div>

                      {/* Animated Rotating Message */}
                      <div className="flex items-center gap-3">
                        <div className="h-6 flex items-center flex-1">
                          <AnimatePresence mode="wait">
                            <motion.p
                              key={messageIndex}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              transition={{
                                duration: 0.4,
                                ease: [0.04, 0.62, 0.23, 0.98],
                              }}
                              className="text-sm font-medium text-gray-600"
                            >
                              {LOADING_MESSAGES[messageIndex]}
                            </motion.p>
                          </AnimatePresence>
                        </div>

                        {/* Animated Dots */}
                        <div className="flex items-center gap-1.5">
                          {[0, 1, 2].map((i) => (
                            <motion.div
                              key={i}
                              animate={{
                                scale: [1, 1.3, 1],
                                opacity: [0.4, 1, 0.4],
                              }}
                              transition={{
                                duration: 1,
                                repeat: Infinity,
                                ease: "easeInOut",
                                delay: i * 0.15,
                              }}
                              className="h-2 w-2 bg-[#FFC72C] rounded-full"
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Error State */}
                {error && !isLoading && (
                  <motion.div
                    initial={{ height: "auto" }}
                    animate={{ height: "auto" }}
                    className="bg-white rounded-t-xl border-t border-x border-gray-200 shadow-xl"
                  >
                    <div className="px-4 py-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-md bg-red-100 flex items-center justify-center">
                            <AlertCircle className="h-4 w-4 text-red-600" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">Research Failed</p>
                            <p className="text-xs text-gray-500">{error}</p>
                          </div>
                        </div>
                        <button
                          onClick={handleClose}
                          className="p-2 rounded-md hover:bg-gray-100 transition-colors"
                        >
                          <X className="h-5 w-5 text-gray-500" />
                        </button>
                      </div>
                      <button
                        onClick={() => {
                          setError(null);
                          setResult(null);
                        }}
                        className="w-full py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                      >
                        Try Again
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Results - Expanded Panel */}
                {result && !isLoading && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: "85vh" }}
                    transition={{ 
                      duration: 0.4,
                      ease: [0.04, 0.62, 0.23, 0.98]
                    }}
                    className="bg-white rounded-t-xl border-t border-x border-gray-200 shadow-xl flex flex-col overflow-hidden"
                  >
                    {/* Header */}
                    <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-200">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-gray-900 flex items-center justify-center">
                          <Sparkles className="h-4 w-4 text-white" />
                        </div>
                        <div>
                          <p className="text-base font-semibold text-gray-900">AI Research</p>
                          <p className="text-xs text-gray-500">Powered by AI</p>
                        </div>
                      </div>
                      <button
                        onClick={handleClose}
                        className="p-2 rounded-md hover:bg-gray-100 transition-colors"
                      >
                        <X className="h-5 w-5 text-gray-500" />
                      </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-4">
                      <ResultsContent />
                    </div>
                  </motion.div>
                )}
              </motion.div>
            </>
          )}
        </>
      )}
    </AnimatePresence>
  );
}
