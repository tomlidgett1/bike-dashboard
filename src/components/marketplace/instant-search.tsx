"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Loader2, Package, Store, ArrowRight, Sparkles, Clock, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import Image from "next/image";
import type { AISearchResult } from "@/types/ai-search";
import { AISearchResponseDisplay } from "./ai-search-response";
import { AISearchLoading } from "./ai-search-loading";

// ============================================================
// Enterprise-Level Instant Search
// Multi-faceted real-time search with dropdown results
// ============================================================

// Recent searches storage key
const RECENT_SEARCHES_KEY = 'yj_recent_searches';
const MAX_RECENT_SEARCHES = 5;

interface SearchProduct {
  id: string;
  name: string;
  price: number;
  category: string;
  imageUrl: string;
  thumbnailUrl?: string; // Pre-generated 100px thumbnail for instant loading
  storeName: string;
  inStock: boolean;
}

// Product Image Thumbnail - uses Cloudinary thumbnailUrl when available
function ProductImageThumbnail({ 
  imageUrl, 
  name 
}: { 
  imageUrl: string; 
  name: string 
}) {
  const [imageError, setImageError] = React.useState(false);
  
  // Just use the URL directly (thumbnailUrl already set by API if available)
  const optimisedUrl = imageUrl;

  return (
    <div className="relative h-12 w-12 rounded-md bg-gray-100 flex-shrink-0 overflow-hidden border border-gray-200 flex items-center justify-center">
      {!imageError && optimisedUrl ? (
        <Image
          src={optimisedUrl}
          alt={name}
          fill
          unoptimized
          className="object-contain"
          onError={() => setImageError(true)}
        />
      ) : (
        <Package className="h-6 w-6 text-gray-300" />
      )}
    </div>
  );
}

interface SearchStore {
  id: string;
  name: string;
  logoUrl: string | null;
  productCount: number;
}

interface SearchResults {
  products: SearchProduct[];
  stores: SearchStore[];
  query: string;
}

// Helper function to detect if query is a question
function isQuestion(query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  
  // Minimum length for AI search (reduced to 8 characters)
  if (trimmed.length < 8) return false;
  
  // 1. ALWAYS show AI if there's a question mark
  if (trimmed.includes('?')) return true;
  
  // 2. Question words at the START of the query
  const startsWithQuestionWord = /^(what|how|why|when|where|which|who|whose|whom|should|can|could|will|would|is|are|do|does|did|has|have|had|may|might|must)\b/i;
  if (startsWithQuestionWord.test(trimmed)) return true;
  
  // 3. Action/help-seeking keywords (anywhere in query)
  const helpKeywords = [
    'explain',
    'tell me',
    'help me',
    'teach me',
    'show me',
    'advice',
    'recommend',
    'suggest',
    'comparison',
    'compare',
    'look up',
    'find out',
    'learn about',
  ];
  if (helpKeywords.some(keyword => trimmed.includes(keyword))) return true;
  
  // 4. Comparative/decision patterns
  const comparativePatterns = [
    /\bbest\s+\w+/i,                    // "best groupset", "best bike"
    /\bdifference\s+between\b/i,        // "difference between"
    /\bwhich\s+is\s+better\b/i,         // "which is better"
    /\bshould\s+i\b/i,                  // "should I"
    /\bvs\b/i,                          // "shimano vs sram"
    /\bversus\b/i,                      // "versus"
    /\bor\b.*\bor\b/i,                  // "X or Y or Z"
    /\bbetter\s+than\b/i,               // "better than"
    /\bworth\s+it\b/i,                  // "worth it"
    /\bgood\s+for\b/i,                  // "good for"
  ];
  if (comparativePatterns.some(pattern => pattern.test(trimmed))) return true;
  
  // 5. Cycling-specific question indicators
  const cyclingQuestionPatterns = [
    /\bwhat('s| is)\s+(the\s+)?(best|difference|point|advantage|benefit)\b/i,
    /\bhow\s+(do|to|can|does|much|many|long|often)\b/i,
    /\bwhy\s+(is|are|do|does|should|would)\b/i,
    /\bcan\s+i\b/i,
    /\bshould\s+i\b/i,
    /\bdo\s+i\s+need\b/i,
    /\bis\s+it\s+worth\b/i,
    /\bare\s+they\s+worth\b/i,
  ];
  if (cyclingQuestionPatterns.some(pattern => pattern.test(trimmed))) return true;
  
  return false;
}

interface InstantSearchProps {
  /** Automatically focus the input when mounted */
  autoFocus?: boolean;
  /** Called when a search result is clicked (useful for closing mobile overlays) */
  onResultClick?: () => void;
  /** When true, renders in full-page mobile mode without sheet styling */
  mobileFullPage?: boolean;
  /** Custom placeholder text (overrides typewriter effect) */
  placeholder?: string;
  /** Optional element to render to the left of the search input (e.g., close button) */
  leftSlot?: React.ReactNode;
}

export function InstantSearch({ autoFocus = false, onResultClick, mobileFullPage = false, placeholder: customPlaceholder, leftSlot }: InstantSearchProps = {}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResults | null>(null);
  const [aiResponse, setAiResponse] = React.useState<AISearchResult | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [aiLoading, setAiLoading] = React.useState(false);
  const [showAiButton, setShowAiButton] = React.useState(false);
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(-1);
  const [recentSearches, setRecentSearches] = React.useState<string[]>([]);
  const [isFocused, setIsFocused] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const cacheRef = React.useRef<Map<string, SearchResults>>(new Map());
  const aiCacheRef = React.useRef<Map<string, AISearchResult>>(new Map());
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const aiAbortControllerRef = React.useRef<AbortController | null>(null);

  // Auto-focus input when prop is set
  React.useEffect(() => {
    if (autoFocus && inputRef.current) {
      // Focus immediately for mobile keyboard responsiveness
      inputRef.current.focus();
      
      // Also try again after a small delay to ensure visibility after animations
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [autoFocus]);

  // Load recent searches from localStorage on mount
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setRecentSearches(parsed.slice(0, MAX_RECENT_SEARCHES));
        }
      }
    } catch (error) {
      console.error('Failed to load recent searches:', error);
    }
  }, []);

  // Save a search to recent searches
  const saveRecentSearch = React.useCallback((searchQuery: string) => {
    if (!searchQuery.trim()) return;
    
    setRecentSearches(prev => {
      // Remove duplicates and add new search at the beginning
      const filtered = prev.filter(s => s.toLowerCase() !== searchQuery.toLowerCase());
      const updated = [searchQuery, ...filtered].slice(0, MAX_RECENT_SEARCHES);
      
      // Save to localStorage
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      } catch (error) {
        console.error('Failed to save recent searches:', error);
      }
      
      return updated;
    });
  }, []);

  // Remove a specific recent search
  const removeRecentSearch = React.useCallback((searchQuery: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    setRecentSearches(prev => {
      const updated = prev.filter(s => s !== searchQuery);
      
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      } catch (error) {
        console.error('Failed to save recent searches:', error);
      }
      
      return updated;
    });
  }, []);

  // Clear all recent searches
  const clearAllRecentSearches = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch (error) {
      console.error('Failed to clear recent searches:', error);
    }
  }, []);
  
  // Typewriter effect for placeholder (only if custom placeholder not provided)
  const [placeholder, setPlaceholder] = React.useState(customPlaceholder || "");
  const placeholderTexts = [
    "Shimano 12 speed cassette...",
    "used road bicycle...",
    "Wahoo Elemnt Roam V2...",
    "Ask a question or search bikes, parts, apparel..."
  ];
  
  React.useEffect(() => {
    // Skip typewriter effect if custom placeholder is provided
    if (customPlaceholder) {
      setPlaceholder(customPlaceholder);
      return;
    }

    let currentTextIndex = 0;
    let currentCharIndex = 0;
    let isDeleting = false;
    let timeoutId: NodeJS.Timeout;

    const type = () => {
      const currentText = placeholderTexts[currentTextIndex];
      
      if (!isDeleting) {
        // Typing
        setPlaceholder(currentText.substring(0, currentCharIndex + 1));
        currentCharIndex++;
        
        if (currentCharIndex === currentText.length) {
          // Finished typing current text
          if (currentTextIndex === placeholderTexts.length - 1) {
            // Last text - keep it static
            return;
          }
          // Wait 1 second before deleting
          timeoutId = setTimeout(() => {
            isDeleting = true;
            type();
          }, 1000);
          return;
        }
        
        timeoutId = setTimeout(type, 50); // Typing speed (2x faster)
      } else {
        // Deleting
        setPlaceholder(currentText.substring(0, currentCharIndex - 1));
        currentCharIndex--;
        
        if (currentCharIndex === 0) {
          // Finished deleting, move to next text
          isDeleting = false;
          currentTextIndex++;
          timeoutId = setTimeout(type, 200); // Small pause before next text
          return;
        }
        
        timeoutId = setTimeout(type, 30); // Fast deleting speed
      }
    };

    // Start the typewriter effect
    timeoutId = setTimeout(type, 500); // Initial delay

    return () => clearTimeout(timeoutId);
  }, [customPlaceholder]);

  // Product search only (AI search triggered manually via button)
  React.useEffect(() => {
    if (query.length < 2) {
      setResults(null);
      setAiResponse(null);
      setShowAiButton(false);
      setShowDropdown(false);
      setLoading(false);
      setAiLoading(false);
      // Cancel any pending requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (aiAbortControllerRef.current) {
        aiAbortControllerRef.current.abort();
        aiAbortControllerRef.current = null;
      }
      return;
    }

    // Check if this could be a question (to show the AI button)
    const couldBeQuestion = isQuestion(query);
    setShowAiButton(couldBeQuestion);
    
    // Check cache first for instant results
    const cached = cacheRef.current.get(query.toLowerCase());
    
    if (cached) {
      setResults(cached);
      setShowDropdown(true);
      setLoading(false);
      setSelectedIndex(-1);
      return;
    }

    // Show dropdown IMMEDIATELY with loading state
    setResults(null);
    setShowDropdown(true);
    setLoading(true);

    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Aggressive 75ms debounce for instant feel
    const timer = setTimeout(async () => {
      const productAbortController = new AbortController();
      abortControllerRef.current = productAbortController;
      
      try {
        const response = await fetch(
          `/api/marketplace/search?q=${encodeURIComponent(query)}`,
          { signal: productAbortController.signal }
        );
        
        if (response.ok) {
          const data = await response.json();
          setResults(data);
          setSelectedIndex(-1);
          
          // Cache the result
          cacheRef.current.set(query.toLowerCase(), data);
          if (cacheRef.current.size > 50) {
            const firstKey = cacheRef.current.keys().next().value as string;
            if (firstKey) cacheRef.current.delete(firstKey);
          }
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Product search error:', error);
        }
      } finally {
        setLoading(false);
        abortControllerRef.current = null;
      }
    }, 75); // 75ms debounce

    return () => {
      clearTimeout(timer);
    };
  }, [query]);

  // Function to trigger AI search manually
  const triggerAiSearch = React.useCallback(async () => {
    if (!query || query.length < 3) return;
    
    // Check cache first
    const aiCached = aiCacheRef.current.get(query.toLowerCase());
    if (aiCached) {
      setAiResponse(aiCached);
      return;
    }
    
    // Start AI search
    setAiLoading(true);
    setAiResponse(null);
    
    // Cancel previous AI request if pending
    if (aiAbortControllerRef.current) {
      aiAbortControllerRef.current.abort();
    }
    
    const aiAbortController = new AbortController();
    aiAbortControllerRef.current = aiAbortController;
    
    try {
      const response = await fetch(
        `/api/ai-search?q=${encodeURIComponent(query)}`,
        { signal: aiAbortController.signal }
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setAiResponse(data);
          
          // Cache the AI result
          aiCacheRef.current.set(query.toLowerCase(), data);
          if (aiCacheRef.current.size > 20) {
            const firstKey = aiCacheRef.current.keys().next().value as string;
            if (firstKey) aiCacheRef.current.delete(firstKey);
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('AI search error:', error);
      }
    } finally {
      setAiLoading(false);
      aiAbortControllerRef.current = null;
    }
  }, [query]);

  // Click outside to close
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard navigation
  const totalItems = (results?.products.length || 0) + (results?.stores.length || 0);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle Enter key immediately - works even if dropdown isn't loaded yet
    if (e.key === "Enter") {
      e.preventDefault();
      if (showDropdown && results && selectedIndex !== -1) {
        // Navigate to selected item if dropdown is open and item is selected
        handleSelectItem(selectedIndex);
      } else if (query.trim()) {
        // Otherwise, just search with the current query
        handleFullSearch();
      }
      return;
    }

    // Handle Escape key - close dropdown
    if (e.key === "Escape") {
      setShowDropdown(false);
      setSelectedIndex(-1);
      return;
    }

    // For arrow keys, only work when dropdown is visible
    if (!showDropdown || !results) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : prev));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
    }
  };

  const handleSelectItem = (index: number) => {
    if (!results) return;

    const productCount = results.products.length;
    
    if (index < productCount) {
      // Navigate to product - use full page reload
      const product = results.products[index];
      saveRecentSearch(query.trim());
      onResultClick?.();
      window.location.href = `/marketplace?search=${encodeURIComponent(product.name)}`;
    } else {
      // Navigate to store - use full page reload
      const store = results.stores[index - productCount];
      saveRecentSearch(query.trim());
      onResultClick?.();
      window.location.href = `/marketplace?view=stores&store=${store.id}`;
    }

    setShowDropdown(false);
    setQuery("");
  };

  const handleFullSearch = () => {
    if (query.trim()) {
      saveRecentSearch(query.trim());
      onResultClick?.();
      window.location.href = `/marketplace?search=${encodeURIComponent(query)}`;
      setShowDropdown(false);
    }
  };

  // Use a recent search
  const handleRecentSearchClick = (searchQuery: string) => {
    saveRecentSearch(searchQuery);
    onResultClick?.();
    window.location.href = `/marketplace?search=${encodeURIComponent(searchQuery)}`;
    setShowDropdown(false);
  };

  const handleClear = () => {
    setQuery("");
    setResults(null);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  // Cmd/Ctrl + K shortcut
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const hasResults = results && (results.products.length > 0 || results.stores.length > 0);
  
  // Detect if we're on mobile
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640); // sm breakpoint
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // When in mobileFullPage mode, treat as if not mobile for dropdown positioning
  const useMobileSheet = isMobile && !mobileFullPage;

  // Prevent body scroll when mobile dropdown is open (only for sheet mode)
  React.useEffect(() => {
    if (useMobileSheet && showDropdown && query.length >= 1) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [useMobileSheet, showDropdown, query]);

  // Render results content (shared between dropdown and inline modes)
  const renderResultsContent = () => (
    <>
      {loading && !results ? (
        // Minimal loading state - appears instantly while searching
        <div className={cn("text-center", mobileFullPage ? "py-12" : "p-6")}>
          <Loader2 className="h-6 w-6 animate-spin text-gray-400 mx-auto" />
        </div>
      ) : !hasResults && !aiResponse && !aiLoading ? (
        // No results state - only shows when ALL loading is complete
        <div className={cn("text-center", mobileFullPage ? "py-16" : "p-8")}>
          <Search className="h-8 w-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-900 mb-1">No results found</p>
          <p className="text-xs text-gray-500">Try a different search term</p>
        </div>
      ) : (
        <>
          {/* AI Loading State */}
          {aiLoading && (
            <AISearchLoading />
          )}

          {/* AI Response Section */}
          {aiResponse && !aiLoading && (
            <div className={cn(mobileFullPage ? "border-b border-gray-100" : "border-b border-gray-200")}>
              <AISearchResponseDisplay response={aiResponse.response} />
            </div>
          )}

          {/* AI Search CTA Button */}
          {showAiButton && !aiLoading && !aiResponse && (results?.products || results?.stores) && (
            <div className={cn(
              "py-2",
              mobileFullPage ? "px-3 bg-white" : "px-4 border-t border-gray-100 bg-gray-50"
            )}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  triggerAiSearch();
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-all duration-200 group",
                  mobileFullPage 
                    ? "text-gray-700 active:bg-gray-100 rounded-lg bg-gray-50" 
                    : "text-gray-600 hover:text-gray-900 hover:bg-white rounded-md border border-transparent hover:border-gray-200"
                )}
              >
                <Sparkles className="h-4 w-4 text-[#FFC72C]" />
                <span className="font-medium">Ask Cycling Expert</span>
                <ArrowRight className="h-4 w-4 ml-auto text-gray-400" />
              </button>
            </div>
          )}

          {/* Products Section */}
          {results?.products && results.products.length > 0 && (
            <div className={cn(mobileFullPage ? "" : "border-b border-gray-100")}>
              {/* Section Header */}
              <div className={cn(
                "py-2 flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide",
                mobileFullPage ? "px-3 pt-2" : "px-4 bg-gray-50"
              )}>
                <Package className="h-3.5 w-3.5" />
                Products
              </div>
              {/* Product List */}
              <div className={cn(mobileFullPage ? "" : "py-1")}>
                {results.products.map((product, index) => (
                  <button
                    key={product.id}
                    onClick={() => handleSelectItem(index)}
                    className={cn(
                      "w-full flex items-center gap-3 transition-colors text-left",
                      mobileFullPage 
                        ? "px-3 py-3 active:bg-gray-50 border-b border-gray-100 last:border-b-0" 
                        : cn(
                            "px-4 py-3",
                            selectedIndex === index ? "bg-gray-100" : "hover:bg-gray-50"
                          )
                    )}
                  >
                    {/* Product Image */}
                    <ProductImageThumbnail 
                      imageUrl={product.imageUrl} 
                      name={product.name} 
                    />

                    {/* Product Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {product.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-500">{product.storeName}</span>
                        {!product.inStock && (
                          <span className="text-xs text-red-500 font-medium">Out of Stock</span>
                        )}
                      </div>
                    </div>

                    {/* Price */}
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-gray-900">
                        ${product.price.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500">{product.category}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stores Section */}
          {results?.stores && results.stores.length > 0 && (
            <div>
              {/* Section Header */}
              <div className={cn(
                "py-2 flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide",
                mobileFullPage ? "px-3 pt-2" : "px-4 bg-gray-50"
              )}>
                <Store className="h-3.5 w-3.5" />
                Stores
              </div>
              {/* Store List */}
              <div className={cn(mobileFullPage ? "" : "py-1")}>
                {results.stores.map((store, index) => (
                  <button
                    key={store.id}
                    onClick={() => handleSelectItem(results.products.length + index)}
                    className={cn(
                      "w-full flex items-center gap-3 transition-colors text-left",
                      mobileFullPage 
                        ? "px-3 py-3 active:bg-gray-50 border-b border-gray-100 last:border-b-0" 
                        : cn(
                            "px-4 py-3",
                            selectedIndex === results.products.length + index ? "bg-gray-100" : "hover:bg-gray-50"
                          )
                    )}
                  >
                    {/* Store Logo */}
                    <div className="relative h-10 w-10 rounded-md bg-gray-100 flex-shrink-0 overflow-hidden border border-gray-200 flex items-center justify-center">
                      {store.logoUrl ? (
                        <Image
                          src={store.logoUrl}
                          alt={store.name}
                          fill
                          className="object-cover"
                          sizes="40px"
                        />
                      ) : (
                        <Store className="h-5 w-5 text-gray-400" />
                      )}
                    </div>

                    {/* Store Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {store.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {store.productCount} {store.productCount === 1 ? 'product' : 'products'}
                      </p>
                    </div>

                    <ArrowRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* View All Results */}
          {query && (
            <div className={cn(
              mobileFullPage 
                ? "px-3 py-4 mt-2" 
                : "border-t border-gray-100 p-2"
            )}>
              <button
                onClick={handleFullSearch}
                className={cn(
                  "w-full flex items-center justify-center gap-2 text-sm font-medium transition-colors",
                  mobileFullPage 
                    ? "px-4 py-3 bg-gray-900 text-white rounded-lg active:bg-gray-800" 
                    : "px-4 py-2 text-gray-700 hover:bg-gray-50 rounded-md"
                )}
              >
                View all results for "{query}"
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}
    </>
  );

  // Render recent searches content (shared between dropdown and inline modes)
  const renderRecentSearchesContent = () => (
    <>
      {/* Header */}
      <div className={cn(
        "flex items-center justify-between",
        mobileFullPage 
          ? "px-3 pt-2 pb-1" 
          : "py-2.5 px-4 bg-gray-50 border-b border-gray-100"
      )}>
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          <Clock className="h-3.5 w-3.5" />
          Recent Searches
        </div>
        <button
          onClick={clearAllRecentSearches}
          className={cn(
            "text-xs transition-colors flex items-center gap-1",
            mobileFullPage 
              ? "text-gray-500 active:text-gray-700" 
              : "text-gray-500 hover:text-gray-700"
          )}
        >
          <Trash2 className="h-3 w-3" />
          Clear
        </button>
      </div>
      
      {/* Recent Searches List */}
      <div className={cn(mobileFullPage ? "" : "py-1")}>
        {recentSearches.map((recentQuery, index) => (
          <div
            key={`${recentQuery}-${index}`}
            role="button"
            tabIndex={0}
            onClick={() => handleRecentSearchClick(recentQuery)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleRecentSearchClick(recentQuery);
              }
            }}
            className={cn(
              "w-full flex items-center gap-3 transition-colors text-left cursor-pointer",
              mobileFullPage 
                ? "px-3 py-3 active:bg-gray-50 border-b border-gray-100 last:border-b-0" 
                : "px-4 py-2.5 hover:bg-gray-50 group"
            )}
          >
            <Clock className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <span className="flex-1 text-sm text-gray-700 truncate">
              {recentQuery}
            </span>
            <button
              onClick={(e) => removeRecentSearch(recentQuery, e)}
              className={cn(
                "p-1.5 rounded-md transition-all",
                mobileFullPage 
                  ? "text-gray-400 active:bg-gray-200" 
                  : "opacity-0 group-hover:opacity-100 hover:bg-gray-200"
              )}
              aria-label="Remove search"
            >
              <X className={cn("text-gray-400", mobileFullPage ? "h-4 w-4" : "h-3 w-3")} />
            </button>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className={cn("relative w-full flex flex-col", mobileFullPage ? "h-full" : "")}>
      {/* Search Input Row */}
      <div className={cn(
        "flex-shrink-0",
        leftSlot ? "flex items-center gap-1" : "",
        mobileFullPage ? "px-3 pt-2 pb-1" : ""
      )}>
        {/* Optional left slot (e.g., close button) */}
        {leftSlot}
        
        {/* Search Input */}
        <div className={cn("relative", leftSlot ? "flex-1 min-w-0" : "")}>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
          
          <Input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              setIsFocused(true);
              if (mobileFullPage) {
                // In mobile full page mode, always show content area
                setShowDropdown(true);
              } else if (results && query.length >= 2) {
                setShowDropdown(true);
              } else if (query.length < 2 && recentSearches.length > 0) {
                // Show recent searches when focused with no query
                setShowDropdown(true);
              }
            }}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            className={cn(
              "text-sm",
              mobileFullPage 
                ? "h-10 pl-10 pr-10 rounded-lg border-0 bg-gray-100 focus:ring-2 focus:ring-gray-200 placeholder:text-gray-500" 
                : "h-9 pl-10 pr-16 sm:pl-11 sm:pr-20 rounded-md border-gray-300 focus:border-gray-400 focus:ring-gray-400 bg-white"
            )}
          />

          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {loading && (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            )}
            
            {query && !loading && (
              <button
                onClick={handleClear}
                className="p-1 rounded-md active:bg-gray-200 transition-colors"
                aria-label="Clear search"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            )}

            {!mobileFullPage && (
              <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                <span className="text-xs">⌘</span>K
              </kbd>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Full Page Mode - Render inline (edge-to-edge) */}
      {mobileFullPage && (
        <div className="flex-1 overflow-y-auto bg-white mt-2">
          {query.length < 2 && recentSearches.length > 0 ? (
            renderRecentSearchesContent()
          ) : query.length >= 2 ? (
            renderResultsContent()
          ) : (
            // Empty state when no query and no recent searches
            <div className="py-20 text-center px-4">
              <Search className="h-12 w-12 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">Search for bikes, parts, apparel...</p>
            </div>
          )}
        </div>
      )}

      {/* Desktop/Sheet Mode - Render as dropdowns (only when not in mobileFullPage mode) */}
      {!mobileFullPage && (
        <>
          {/* Mobile Backdrop for Recent Searches (only in sheet mode) */}
          <AnimatePresence>
            {useMobileSheet && showDropdown && query.length < 2 && recentSearches.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 bg-black/50 z-[60]"
                onClick={() => setShowDropdown(false)}
              />
            )}
          </AnimatePresence>

          {/* Recent Searches Dropdown - Shows when focused with no query */}
          <AnimatePresence>
            {showDropdown && query.length < 2 && recentSearches.length > 0 && (
              <motion.div
                ref={dropdownRef}
                initial={{ opacity: 0, y: useMobileSheet ? 20 : -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: useMobileSheet ? 20 : -8 }}
                transition={{ duration: 0.2, ease: [0.04, 0.62, 0.23, 0.98] }}
                className={cn(
                  "bg-white z-[70] overflow-y-auto",
                  useMobileSheet && "fixed inset-x-0 bottom-0 top-16 rounded-t-2xl border-t border-gray-200 shadow-2xl",
                  !useMobileSheet && "absolute top-full left-0 right-0 mt-2 rounded-md border border-gray-200 shadow-xl overflow-hidden"
                )}
              >
                {/* Mobile Close Handle (only in sheet mode) */}
                {useMobileSheet && (
                  <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900">
                      Search
                    </p>
                    <button
                      onClick={() => setShowDropdown(false)}
                      className="p-2 -mr-2 rounded-md hover:bg-gray-100 transition-colors"
                      aria-label="Close search"
                    >
                      <X className="h-5 w-5 text-gray-600" />
                    </button>
                  </div>
                )}

                {renderRecentSearchesContent()}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Mobile Backdrop for Search Results (only in sheet mode) */}
          <AnimatePresence>
            {useMobileSheet && showDropdown && query.length >= 2 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 bg-black/50 z-[60]"
                onClick={() => setShowDropdown(false)}
              />
            )}
          </AnimatePresence>

          {/* Dropdown Results - Shows INSTANTLY */}
          <AnimatePresence>
            {showDropdown && query.length >= 2 && (
              <motion.div
                ref={dropdownRef}
                initial={{ opacity: 0, y: useMobileSheet ? 20 : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: useMobileSheet ? 20 : 0 }}
                transition={{ duration: 0.2, ease: [0.04, 0.62, 0.23, 0.98] }}
                className={cn(
                  "bg-white z-[70] overflow-y-auto",
                  useMobileSheet && "fixed inset-x-0 bottom-0 top-16 rounded-t-2xl border-t border-gray-200 shadow-2xl",
                  !useMobileSheet && "absolute top-full left-0 right-0 mt-2 rounded-md border border-gray-200 shadow-2xl max-h-[70vh]"
                )}
              >
                {/* Mobile Close Handle (only in sheet mode) */}
                {useMobileSheet && (
                  <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900">
                      Search Results
                    </p>
                    <button
                      onClick={() => setShowDropdown(false)}
                      className="p-2 -mr-2 rounded-md hover:bg-gray-100 transition-colors"
                      aria-label="Close search"
                    >
                      <X className="h-5 w-5 text-gray-600" />
                    </button>
                  </div>
                )}

                {renderResultsContent()}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}

