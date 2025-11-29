"use client";

import * as React from "react";
import { Search, X, Loader2, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import Image from "next/image";

// ============================================================
// Store Instant Search
// Dropdown search within a specific store's inventory
// NO page reloads - instant results dropdown
// ============================================================

interface SearchProduct {
  id: string;
  name: string;
  price: number;
  category: string;
  imageUrl: string | null;
  inStock: boolean;
}

interface StoreSearchBarProps {
  storeId: string;
  storeName: string;
  className?: string;
}

// Product Image Thumbnail with error handling
function ProductImageThumbnail({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  const [imageError, setImageError] = React.useState(false);

  return (
    <div className="relative h-12 w-12 rounded-md bg-gray-100 flex-shrink-0 overflow-hidden border border-gray-200 flex items-center justify-center">
      {!imageError && imageUrl ? (
        <Image
          src={imageUrl}
          alt={name}
          fill
          className="object-contain"
          sizes="48px"
          onError={() => setImageError(true)}
        />
      ) : (
        <Package className="h-6 w-6 text-gray-300" />
      )}
    </div>
  );
}

export function StoreSearchBar({ storeId, storeName, className }: StoreSearchBarProps) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchProduct[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(-1);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Debounced search
  React.useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/marketplace/store/${storeId}/search?q=${encodeURIComponent(query)}`);
        if (response.ok) {
          const data = await response.json();
          setResults(data.products || []);
          setShowDropdown(true);
          setSelectedIndex(-1);
        }
      } catch (error) {
        console.error('Store search error:', error);
      } finally {
        setLoading(false);
      }
    }, 200); // 200ms debounce for instant feel

    return () => clearTimeout(timer);
  }, [query, storeId]);

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
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || results.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          handleSelectProduct(results[selectedIndex]);
        }
        break;
      case "Escape":
        setShowDropdown(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const handleSelectProduct = (product: SearchProduct) => {
    // Scroll to the product on the page
    const productElement = document.getElementById(`product-${product.id}`);
    if (productElement) {
      productElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Highlight briefly
      productElement.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2');
      setTimeout(() => {
        productElement.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2');
      }, 2000);
    }
    setShowDropdown(false);
    setQuery("");
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
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

  return (
    <div className={cn("relative", className)}>
      {/* Search Input */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0 && query.length >= 2) {
              setShowDropdown(true);
            }
          }}
          placeholder={`Search ${storeName}...`}
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
          className="absolute top-full left-0 mt-2 bg-white rounded-md border border-gray-200 shadow-2xl z-50 w-full max-w-md max-h-[400px] overflow-y-auto animate-in fade-in slide-in-from-top-4 duration-200"
        >
          {loading && results.length === 0 ? (
            <div className="p-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Searching...</p>
            </div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center">
              <Search className="h-8 w-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-900 mb-1">No results found</p>
              <p className="text-xs text-gray-500">Try a different search term</p>
            </div>
          ) : (
            <div className="py-1">
              {results.map((product, index) => (
                <button
                  key={product.id}
                  onClick={() => handleSelectProduct(product)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 transition-colors text-left",
                    selectedIndex === index
                      ? "bg-gray-100"
                      : "hover:bg-gray-50"
                  )}
                >
                  {/* Product Image */}
                  <ProductImageThumbnail imageUrl={product.imageUrl} name={product.name} />

                  {/* Product Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {product.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500">{product.category}</span>
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
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

