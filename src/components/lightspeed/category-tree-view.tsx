"use client";

import * as React from "react";
import { ChevronRight, Folder, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Category {
  categoryId: string;
  name: string;
  productCount: number;
  products: any[];
}

interface CategoryTreeViewProps {
  categories: Category[];
  selectedCategories: Set<string>;
  onCategoryToggle: (categoryId: string) => void;
  onCategoryClick: (categoryId: string | null) => void;
  selectedCategoryId: string | null;
}

export function CategoryTreeView({
  categories,
  selectedCategories,
  onCategoryToggle,
  onCategoryClick,
  selectedCategoryId,
}: CategoryTreeViewProps) {
  const [search, setSearch] = React.useState("");

  const filteredCategories = React.useMemo(() => {
    if (!search) return categories;
    
    const searchLower = search.toLowerCase();
    return categories.filter(cat => 
      cat.name.toLowerCase().includes(searchLower) ||
      cat.categoryId.toLowerCase().includes(searchLower)
    );
  }, [categories, search]);

  const totalSelected = selectedCategories.size;
  const totalProducts = filteredCategories.reduce((sum, cat) => sum + cat.productCount, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Search Bar */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search categories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-9 rounded-md"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <span>{filteredCategories.length} categories</span>
          <span>{totalProducts} products</span>
        </div>

        {/* Selection Status */}
        {totalSelected > 0 && (
          <div className="mt-3 rounded-md bg-blue-50 dark:bg-blue-900/20 px-3 py-2 flex items-center justify-between">
            <span className="text-xs font-medium text-blue-900 dark:text-blue-400">
              {totalSelected} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                selectedCategories.forEach(id => onCategoryToggle(id));
              }}
              className="h-6 text-xs rounded-md"
            >
              Clear
            </Button>
          </div>
        )}
      </div>

      {/* Category List */}
      <div className="flex-1 overflow-y-auto">
        {filteredCategories.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            No categories found
          </div>
        ) : (
          <div className="p-2">
            {filteredCategories.map((category) => {
              const isSelected = selectedCategories.has(category.categoryId);
              const isActive = selectedCategoryId === category.categoryId;

              return (
                <div
                  key={category.categoryId}
                  className={cn(
                    "group rounded-md mb-1 transition-colors",
                    isActive && "bg-gray-100 dark:bg-gray-800"
                  )}
                >
                  <div className="flex items-center gap-2 p-2">
                    {/* Checkbox */}
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onCategoryToggle(category.categoryId)}
                      className="flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    />

                    {/* Category Info */}
                    <button
                      onClick={() => onCategoryClick(category.categoryId)}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left hover:opacity-70 transition-opacity"
                    >
                      <Folder className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {category.name || `Category ${category.categoryId}`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {category.productCount} {category.productCount === 1 ? 'product' : 'products'}
                        </div>
                      </div>
                    </button>

                    {/* Arrow indicator */}
                    {isActive && (
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

