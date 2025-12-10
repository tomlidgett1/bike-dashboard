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
  Search,
  Brain,
  Globe
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

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

type LoadingPhase = 'thinking' | 'searching' | 'analysing';

interface ProductLearnPanelProps {
  product: MarketplaceProduct;
  isOpen: boolean;
  onClose: () => void;
}

// ============================================================
// Loading Status Messages
// ============================================================

const LOADING_PHASES: Record<LoadingPhase, { icon: React.ElementType; message: string }> = {
  thinking: { icon: Brain, message: "Thinking..." },
  searching: { icon: Globe, message: "Searching the web..." },
  analysing: { icon: Search, message: "Analysing sources..." },
};

// ============================================================
// Skeleton Components
// ============================================================

function SkeletonLine({ width = "100%" }: { width?: string }) {
  return (
    <div 
      className="h-4 bg-gray-200 rounded animate-pulse" 
      style={{ width }}
    />
  );
}

function SkeletonBlock() {
  return (
    <div className="space-y-3">
      <SkeletonLine width="90%" />
      <SkeletonLine width="75%" />
      <SkeletonLine width="85%" />
    </div>
  );
}

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
// Main Component
// ============================================================

export function ProductLearnPanel({ product, isOpen, onClose }: ProductLearnPanelProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [loadingPhase, setLoadingPhase] = React.useState<LoadingPhase>('thinking');
  const [result, setResult] = React.useState<LearnResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Cycle through loading phases
  React.useEffect(() => {
    if (!isLoading) return;

    const timers: NodeJS.Timeout[] = [];

    // Phase 1: Thinking (0-2s)
    setLoadingPhase('thinking');

    // Phase 2: Searching (2-6s)
    timers.push(setTimeout(() => {
      setLoadingPhase('searching');
    }, 2000));

    // Phase 3: Analysing (6s+)
    timers.push(setTimeout(() => {
      setLoadingPhase('analysing');
    }, 6000));

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [isLoading]);

  // Fetch product research when panel opens
  React.useEffect(() => {
    if (!isOpen || result || isLoading) return;

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
  }, [isOpen, result, isLoading, product]);

  // Reset state when panel closes
  const handleClose = () => {
    onClose();
    // Delay reset to allow animation to complete
    setTimeout(() => {
      setResult(null);
      setError(null);
      setIsLoading(false);
    }, 300);
  };

  const LoadingIcon = LOADING_PHASES[loadingPhase].icon;
  const loadingMessage = LOADING_PHASES[loadingPhase].message;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent 
        side="bottom" 
        showCloseButton={false}
        className="h-[85vh] rounded-t-xl flex flex-col p-0"
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-gray-900 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <SheetTitle className="text-base font-semibold text-gray-900">
                Product Research
              </SheetTitle>
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
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Loading State */}
          {isLoading && (
            <div className="space-y-6">
              {/* Animated Status */}
              <div className="flex items-center justify-center py-8">
                <motion.div
                  key={loadingPhase}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex flex-col items-center gap-3"
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center"
                  >
                    <LoadingIcon className="h-6 w-6 text-gray-700" />
                  </motion.div>
                  <p className="text-sm font-medium text-gray-700">{loadingMessage}</p>
                </motion.div>
              </div>

              {/* Skeleton Content */}
              <div className="space-y-4">
                <div className="bg-white border border-gray-200 rounded-md p-4">
                  <SkeletonBlock />
                </div>
                <div className="bg-white border border-gray-200 rounded-md p-4">
                  <SkeletonBlock />
                </div>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className="bg-white border border-red-200 rounded-md p-6 text-center">
              <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-900 mb-1">Research Failed</p>
              <p className="text-xs text-gray-600 mb-4">{error}</p>
              <button
                onClick={() => {
                  setError(null);
                  setResult(null);
                }}
                className="text-sm font-medium text-gray-700 hover:text-gray-900 underline"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Results */}
          {result && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="space-y-4"
            >
              {/* Summary */}
              <div className="bg-white border border-gray-200 rounded-md p-4">
                <p className="text-sm text-gray-700 leading-relaxed">{result.summary}</p>
              </div>

              {/* Key Features */}
              <CollapsibleSection title="Key Features" icon={Sparkles}>
                <ul className="space-y-2">
                  {result.keyFeatures.map((feature, i) => (
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
                    {result.pros.map((pro, i) => (
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
                    {result.cons.map((con, i) => (
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
                  <div className="flex items-center gap-2">
                    <PriceVerdictBadge verdict={result.priceAnalysis.verdict} />
                    {result.priceAnalysis.marketRange && (
                      <span className="text-xs text-gray-500">
                        Market: ${result.priceAnalysis.marketRange.min.toLocaleString()} - ${result.priceAnalysis.marketRange.max.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700">{result.priceAnalysis.explanation}</p>
                </div>
              </CollapsibleSection>

              {/* Buyer Tips */}
              <CollapsibleSection title="Buyer Tips" icon={Lightbulb} defaultOpen={false}>
                <ul className="space-y-2">
                  {result.buyerTips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="text-amber-500 mt-0.5">💡</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </CollapsibleSection>

              {/* Sources */}
              {result.sources && result.sources.length > 0 && (
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
              <p className="text-xs text-gray-400 text-center pt-2">
                AI-generated research. Always verify details with the seller.
              </p>
            </motion.div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
