"use client";

import * as React from "react";
import { Search, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ============================================================
// Store Search Bar
// Enterprise search within a specific store's inventory
// ============================================================

interface StoreSearchBarProps {
  onSearchChange: (query: string) => void;
  placeholder?: string;
  className?: string;
}

export function StoreSearchBar({ 
  onSearchChange, 
  placeholder = "Search this store's inventory...",
  className 
}: StoreSearchBarProps) {
  const [query, setQuery] = React.useState("");
  const [isSearching, setIsSearching] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Debounced search
  React.useEffect(() => {
    if (query.length === 0) {
      onSearchChange("");
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(() => {
      onSearchChange(query);
      setIsSearching(false);
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [query, onSearchChange]);

  const handleClear = () => {
    setQuery("");
    onSearchChange("");
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
    <div className={cn("relative w-full", className)}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="pl-10 pr-20 h-11 rounded-md border-gray-300 focus:border-gray-400 focus:ring-gray-400 bg-white"
        />

        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {isSearching && (
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          )}
          
          {query && !isSearching && (
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

      {/* Search indicator */}
      {query && (
        <div className="absolute -bottom-6 left-0 text-xs text-gray-500">
          {isSearching ? (
            <span>Searching...</span>
          ) : (
            <span>
              Press <kbd className="px-1 py-0.5 rounded border border-gray-200 bg-gray-50">ESC</kbd> to clear
            </span>
          )}
        </div>
      )}
    </div>
  );
}

