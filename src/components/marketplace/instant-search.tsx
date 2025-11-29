"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, X, Loader2, Package, Store, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import Image from "next/image";

// ============================================================
// Enterprise-Level Instant Search
// Multi-faceted real-time search with dropdown results
// ============================================================

interface SearchProduct {
  id: string;
  name: string;
  price: number;
  category: string;
  imageUrl: string;
  storeName: string;
  inStock: boolean;
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

export function InstantSearch() {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResults | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(-1);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Debounced search
  React.useEffect(() => {
    if (query.length < 2) {
      setResults(null);
      setShowDropdown(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/marketplace/search?q=${encodeURIComponent(query)}`);
        if (response.ok) {
          const data = await response.json();
          setResults(data);
          setShowDropdown(true);
          setSelectedIndex(-1);
        }
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setLoading(false);
      }
    }, 200); // 200ms debounce for instant feel

    return () => clearTimeout(timer);
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
      case "Enter":
        e.preventDefault();
        if (selectedIndex === -1) {
          // Enter with no selection - go to search results page
          handleFullSearch();
        } else {
          // Navigate to selected item
          handleSelectItem(selectedIndex);
        }
        break;
      case "Escape":
        setShowDropdown(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const handleSelectItem = (index: number) => {
    if (!results) return;

    const productCount = results.products.length;
    
    if (index < productCount) {
      // Navigate to product - use full page reload
      const product = results.products[index];
      window.location.href = `/marketplace?search=${encodeURIComponent(product.name)}`;
    } else {
      // Navigate to store - use full page reload
      const store = results.stores[index - productCount];
      window.location.href = `/marketplace?view=stores&store=${store.id}`;
    }

    setShowDropdown(false);
    setQuery("");
  };

  const handleFullSearch = () => {
    if (query.trim()) {
      window.location.href = `/marketplace?search=${encodeURIComponent(query)}`;
      setShowDropdown(false);
    }
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

  return (
    <div className="relative w-full">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results && query.length >= 2) {
              setShowDropdown(true);
            }
          }}
          placeholder="Search bikes, parts, stores..."
          className="pl-10 pr-20 h-10 rounded-md border-gray-300 focus:border-gray-400 focus:ring-gray-400"
        />

        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {loading && (
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          )}
          
          {query && !loading && (
            <button
              onClick={handleClear}
              className="p-1 rounded-md hover:bg-gray-100 transition-colors"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5 text-gray-400" />
            </button>
          )}

          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
            <span className="text-xs">⌘</span>K
          </kbd>
        </div>
      </div>

      {/* Dropdown Results */}
      {showDropdown && query.length >= 2 && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-2 bg-white rounded-md border border-gray-200 shadow-2xl z-50 max-h-[500px] overflow-y-auto animate-in fade-in slide-in-from-top-4 duration-200"
        >
          {loading && !hasResults ? (
            <div className="p-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Searching...</p>
            </div>
          ) : !hasResults ? (
            <div className="p-8 text-center">
              <Search className="h-8 w-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-900 mb-1">No results found</p>
              <p className="text-xs text-gray-500">Try a different search term</p>
            </div>
          ) : (
            <>
              {/* Products Section */}
              {results.products.length > 0 && (
                <div className="border-b border-gray-100">
                  <div className="px-4 py-2 bg-gray-50">
                    <div className="flex items-center gap-2 text-xs font-semibold text-gray-700 uppercase tracking-wide">
                      <Package className="h-3.5 w-3.5" />
                      Products
                    </div>
                  </div>
                  <div className="py-1">
                    {results.products.map((product, index) => (
                      <button
                        key={product.id}
                        onClick={() => handleSelectItem(index)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3 transition-colors text-left",
                          selectedIndex === index
                            ? "bg-gray-100"
                            : "hover:bg-gray-50"
                        )}
                      >
                        {/* Product Image */}
                        <div className="relative h-12 w-12 rounded-md bg-gray-100 flex-shrink-0 overflow-hidden border border-gray-200">
                          <Image
                            src={product.imageUrl}
                            alt={product.name}
                            fill
                            className="object-cover"
                            sizes="48px"
                          />
                        </div>

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
              {results.stores.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-gray-50">
                    <div className="flex items-center gap-2 text-xs font-semibold text-gray-700 uppercase tracking-wide">
                      <Store className="h-3.5 w-3.5" />
                      Stores
                    </div>
                  </div>
                  <div className="py-1">
                    {results.stores.map((store, index) => (
                      <button
                        key={store.id}
                        onClick={() => handleSelectItem(results.products.length + index)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3 transition-colors text-left",
                          selectedIndex === results.products.length + index
                            ? "bg-gray-100"
                            : "hover:bg-gray-50"
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
              <div className="border-t border-gray-100 p-2">
                <button
                  onClick={handleFullSearch}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
                >
                  View all results for "{query}"
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

