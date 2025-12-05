"use client";

export const dynamic = 'force-dynamic';

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  Package,
  FolderTree,
  Sparkles,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Header } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/providers/auth-provider";
import { createClient } from "@/lib/supabase/client";

interface Category {
  id: string;
  name: string;
  fullPath: string;
  depth: number;
  parentId: string | null;
  children: Category[];
}

interface LightspeedItem {
  id: string;
  systemSku: string;
  customSku: string;
  description: string;
  price: string;
  defaultCost: string;
  avgCost: string;
  categoryId: string;
  category: string;
  modelYear: string;
  upc: string;
  qoh: string;
  sellable: string;
  images: Array<{ url: string; publicId: string }>;
  timeStamp: string;
}

const steps = [
  {
    id: 1,
    title: "Select Categories",
    description: "Choose which product categories to sync",
    icon: FolderTree,
  },
  {
    id: 2,
    title: "Preview Items",
    description: "Review products to be imported",
    icon: Package,
  },
  {
    id: 3,
    title: "Confirm & Sync",
    description: "Start the import process",
    icon: Sparkles,
  },
  {
    id: 4,
    title: "Complete",
    description: "Import finished",
    icon: CheckCircle2,
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.04, 0.62, 0.23, 0.98] as [number, number, number, number],
    },
  },
};

export default function SyncInventoryPage() {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = React.useState(1);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [selectedCategories, setSelectedCategories] = React.useState<Set<string>>(new Set());
  const [items, setItems] = React.useState<LightspeedItem[]>([]);
  const [filteredCategoryId, setFilteredCategoryId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingItems, setLoadingItems] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [syncComplete, setSyncComplete] = React.useState(false);
  const [syncStats, setSyncStats] = React.useState<{
    totalItems: number;
    itemsWithStock: number;
    itemsSynced: number;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Fetch categories
  React.useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/lightspeed/categories');
      
      if (!response.ok) {
        throw new Error('Failed to fetch categories');
      }

      const data = await response.json();
      setCategories(data.categories || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (categoryId: string) => {
    setSelectedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  const selectAllCategories = (category: Category) => {
    const ids = new Set<string>();
    const collectIds = (cat: Category) => {
      ids.add(cat.id);
      cat.children.forEach(collectIds);
    };
    collectIds(category);
    
    setSelectedCategories(prev => {
      const newSet = new Set(prev);
      ids.forEach(id => newSet.add(id));
      return newSet;
    });
  };

  const fetchItems = async () => {
    setLoadingItems(true);
    setError(null);
    
    try {
      const categoryIds = Array.from(selectedCategories).join(',');
      const response = await fetch(`/api/lightspeed/items?categoryIds=${categoryIds}&limit=30`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch items');
      }

      const data = await response.json();
      const loadedItems = data.items || [];
      setItems(loadedItems);
      
      // Debug: Log category distribution
      const categoryGroups = loadedItems.reduce((acc: Record<string, number>, item: LightspeedItem) => {
        acc[item.categoryId] = (acc[item.categoryId] || 0) + 1;
        return acc;
      }, {});
      console.log('Items by category:', categoryGroups);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load items');
    } finally {
      setLoadingItems(false);
    }
  };

  const handleSyncAll = async () => {
    if (!user) {
      setError('User not authenticated');
      return;
    }

    setSyncing(true);
    setCurrentStep(4);
    
    try {
      const supabase = createClient();
      
      // Call Edge Function with empty categoryIds to sync ALL items
      const { data, error: funcError } = await supabase.functions.invoke('sync-lightspeed-inventory', {
        body: {
          categoryIds: [], // Empty array means sync ALL
        },
      });

      if (funcError) {
        console.error('Edge function error:', funcError);
        throw new Error(funcError.message || 'Sync failed');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.success && data?.data) {
        setSyncStats({
          totalItems: data.data.totalItems,
          itemsWithStock: data.data.itemsWithStock,
          itemsSynced: data.data.itemsSynced,
        });
      }
      
      setSyncComplete(true);
    } catch (err) {
      console.error('Sync error:', err);
      setError(err instanceof Error ? err.message : 'Sync failed. Please try again.');
      setSyncing(false);
      setLoading(false);
    }
  };

  const handleNext = async () => {
    if (currentStep === 1) {
      // Moving from categories to items - fetch items
      await fetchItems();
      setFilteredCategoryId(null); // Reset filter
      setCurrentStep(2);
    } else if (currentStep === 2) {
      // Moving from items to confirmation
      setCurrentStep(3);
    } else if (currentStep === 3) {
      // Start sync
      handleSync();
    }
  };

  // Get filtered items based on selected category
  const displayedItems = React.useMemo(() => {
    if (!filteredCategoryId) return items;
    return items.filter(item => item.categoryId === filteredCategoryId);
  }, [items, filteredCategoryId]);

  // Get category info for pills
  const getCategoryInfo = (categoryId: string) => {
    const findCategory = (cats: Category[]): Category | null => {
      for (const cat of cats) {
        if (cat.id === categoryId) return cat;
        const found = findCategory(cat.children);
        if (found) return found;
      }
      return null;
    };
    return findCategory(categories);
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(1, prev - 1));
  };

  const handleSync = async () => {
    if (!user) {
      setError('User not authenticated');
      return;
    }

    setSyncing(true);
    setCurrentStep(4);
    
    try {
      const supabase = createClient();
      
      // Call Supabase Edge Function
      const { data, error: funcError } = await supabase.functions.invoke('sync-lightspeed-inventory', {
        body: {
          categoryIds: Array.from(selectedCategories),
        },
      });

      if (funcError) {
        console.error('Edge function error:', funcError);
        throw new Error(funcError.message || 'Sync failed');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.success && data?.data) {
        setSyncStats({
          totalItems: data.data.totalItems,
          itemsWithStock: data.data.itemsWithStock,
          itemsSynced: data.data.itemsSynced,
        });
      }
      
      setSyncComplete(true);
    } catch (err) {
      console.error('Sync error:', err);
      setError(err instanceof Error ? err.message : 'Sync failed. Please try again.');
      setCurrentStep(3);
    } finally {
      setSyncing(false);
    }
  };

  const renderCategory = (category: Category, depth: number = 0) => {
    const isSelected = selectedCategories.has(category.id);
    const hasChildren = category.children.length > 0;
    
    return (
      <div key={category.id}>
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className={cn(
            "group relative rounded-md border border-border bg-white dark:bg-card transition-all hover:shadow-md",
            isSelected && "border-green-500 bg-green-50 dark:bg-green-900/10"
          )}
          style={{ marginLeft: `${depth * 24}px` }}
        >
          <button
            onClick={() => toggleCategory(category.id)}
            className="w-full px-4 py-3 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "h-5 w-5 rounded border-2 flex items-center justify-center transition-all",
                  isSelected
                    ? "bg-green-500 border-green-500"
                    : "border-gray-300 dark:border-gray-600"
                )}
              >
                {isSelected && <Check className="h-3 w-3 text-white" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{category.name}</span>
                  {hasChildren && (
                    <Badge variant="secondary" className="rounded-md text-xs">
                      {category.children.length}
                    </Badge>
                  )}
                </div>
                {depth === 0 && (
                  <span className="text-xs text-muted-foreground">
                    {category.fullPath}
                  </span>
                )}
              </div>
            </div>
            
            {hasChildren && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  selectAllCategories(category);
                }}
                className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium"
              >
                Select all
              </button>
            )}
          </button>
        </motion.div>
        
        {hasChildren && (
          <div className="mt-2 space-y-2">
            {category.children.map(child => renderCategory(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Header
        title="Sync Inventory"
        description="Import products from Lightspeed POS"
      />

      <div className="p-4 lg:p-6">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="mx-auto max-w-4xl space-y-6"
        >
          {/* Step Progress - Minimal Design */}
          <motion.div variants={itemVariants}>
            <div className="flex items-center gap-3 max-w-md mx-auto">
              {steps.map((step, index) => {
                const isActive = currentStep === step.id;
                const isCompleted = currentStep > step.id || syncComplete;
                
                return (
                  <React.Fragment key={step.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "h-2 w-2 rounded-full transition-all",
                          isActive && "bg-blue-600 scale-150",
                          isCompleted && "bg-green-500",
                          !isActive && !isCompleted && "bg-gray-300 dark:bg-gray-700"
                        )}
                      />
                      {isActive && (
                        <span className="text-sm font-medium text-foreground">
                          {step.title}
                        </span>
                      )}
                    </div>
                    {index < steps.length - 1 && (
                      <div
                        className={cn(
                          "h-px flex-1 transition-all",
                          isCompleted ? "bg-green-500" : "bg-gray-200 dark:bg-gray-700"
                        )}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </motion.div>

          {/* Error Message */}
          {error && (
            <motion.div variants={itemVariants}>
              <div className="rounded-md border border-red-200 bg-white p-4 shadow-sm dark:border-red-900 dark:bg-card">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-red-900 dark:text-red-400">
                      Error
                    </h3>
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                      {error}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step Content */}
          <AnimatePresence mode="wait">
            {currentStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
              >
                <Card className="bg-white dark:bg-card rounded-md border-border">
                  <CardContent className="p-6">
                    <div className="mb-6">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h2 className="text-lg font-semibold mb-2">Select Categories to Sync</h2>
                          <p className="text-sm text-muted-foreground">
                            Choose specific categories, or sync all products including those without categories.
                          </p>
                        </div>
                        <Button
                          onClick={handleSyncAll}
                          variant="outline"
                          className="rounded-md whitespace-nowrap"
                        >
                          <Sparkles className="mr-2 h-4 w-4" />
                          Sync All Products
                        </Button>
                      </div>
                    </div>

                    {loading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : categories.length === 0 ? (
                      <div className="text-center py-12">
                        <FolderTree className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-sm text-muted-foreground">
                          No categories found. Make sure you're connected to Lightspeed.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                        {categories.map(category => renderCategory(category))}
                      </div>
                    )}

                    {categories.length > 0 && (
                      <div className="mt-6 pt-6 border-t border-border space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-muted-foreground">
                            {selectedCategories.size} categor{selectedCategories.size === 1 ? 'y' : 'ies'} selected
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              onClick={() => {
                                // Select all categories
                                const allCategoryIds = new Set<string>();
                                const collectAllIds = (cats: Category[]) => {
                                  cats.forEach(cat => {
                                    allCategoryIds.add(cat.id);
                                    collectAllIds(cat.children);
                                  });
                                };
                                collectAllIds(categories);
                                setSelectedCategories(allCategoryIds);
                              }}
                              className="rounded-md"
                            >
                              <Package className="mr-2 h-4 w-4" />
                              Select All
                            </Button>
                            <Button
                              onClick={handleNext}
                              disabled={selectedCategories.size === 0}
                              className="rounded-md"
                            >
                              Continue
                              <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {currentStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
              >
                <Card className="bg-white dark:bg-card rounded-md border-border">
                  <CardContent className="p-6">
                    <div className="mb-6">
                      <h2 className="text-lg font-semibold mb-2">Preview Items</h2>
                      <p className="text-sm text-muted-foreground">
                        Showing the first 30 products from your selected categories. All items in these categories will be imported during sync.
                      </p>
                    </div>

                    {loadingItems ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : items.length === 0 ? (
                      <div className="text-center py-12">
                        <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-sm text-muted-foreground">
                          No items found in the selected categories.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Category Filter Pills */}
                        <div className="mb-6">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => setFilteredCategoryId(null)}
                              className={cn(
                                "px-3 py-1.5 text-xs font-medium rounded-full transition-all",
                                !filteredCategoryId
                                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400"
                              )}
                            >
                              All ({items.length})
                            </button>
                            {Array.from(selectedCategories).map(catId => {
                              const category = getCategoryInfo(catId);
                              if (!category) return null;
                              const itemCount = items.filter(item => item.categoryId === catId).length;
                              
                              return (
                                <button
                                  key={catId}
                                  onClick={() => setFilteredCategoryId(catId)}
                                  className={cn(
                                    "px-3 py-1.5 text-xs font-medium rounded-full transition-all",
                                    filteredCategoryId === catId
                                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400"
                                  )}
                                >
                                  {category.name} ({itemCount})
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        
                        {displayedItems.length === 0 ? (
                          <div className="text-center py-12">
                            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                            <p className="text-sm text-muted-foreground">
                              No items found in this category.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                            {displayedItems.map((item) => (
                            <motion.div
                              key={item.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.3 }}
                              className="rounded-md border border-border bg-white dark:bg-card p-4 hover:shadow-md transition-shadow"
                            >
                              <div className="flex items-start gap-4">
                                {item.images.length > 0 && (
                                  <div className="flex-shrink-0 w-16 h-16 rounded-md bg-gray-100 dark:bg-gray-800 overflow-hidden">
                                    <img
                                      src={item.images[0].url}
                                      alt={item.description}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                      }}
                                    />
                                  </div>
                                )}
                                
                                <div className="flex-1 min-w-0">
                                  <h3 className="text-sm font-medium mb-1">
                                    {item.description}
                                  </h3>
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                                    <span>SKU: {item.customSku || item.systemSku}</span>
                                    {item.category && (
                                      <>
                                        <span>•</span>
                                        <span>{item.category}</span>
                                      </>
                                    )}
                                    {item.modelYear && (
                                      <>
                                        <span>•</span>
                                        <span>Year: {item.modelYear}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-4">
                                  <div className="text-right">
                                    <div className="text-sm font-semibold">
                                      ${parseFloat(item.price || '0').toFixed(2)}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      Cost: ${parseFloat(item.defaultCost || '0').toFixed(2)}
                                    </div>
                                  </div>
                                  
                                  <div className="text-right min-w-[60px]">
                                    <div className={cn(
                                      "text-sm font-semibold",
                                      parseInt(item.qoh || '0') > 0 
                                        ? "text-green-600 dark:text-green-400" 
                                        : "text-red-600 dark:text-red-400"
                                    )}>
                                      QOH: {item.qoh || '0'}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      Sellable: {item.sellable || '0'}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    {items.length > 0 && (
                      <div className="flex items-center justify-between mt-6 pt-6 border-t border-border">
                        <Button
                          variant="outline"
                          onClick={handleBack}
                          className="rounded-md"
                        >
                          <ArrowLeft className="mr-2 h-4 w-4" />
                          Back
                        </Button>
                        <Button
                          onClick={handleNext}
                          disabled={items.length === 0}
                          className="rounded-md"
                        >
                          Continue
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {currentStep === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
              >
                <Card className="bg-white dark:bg-card rounded-md border-border">
                  <CardContent className="p-6">
                    <div className="mb-6">
                      <h2 className="text-lg font-semibold mb-2">Ready to Sync</h2>
                      <p className="text-sm text-muted-foreground">
                        Confirm your selection and start importing products from Lightspeed.
                      </p>
                    </div>

                    <div className="space-y-4 mb-6">
                      <div className="rounded-md bg-gray-50 dark:bg-gray-800/50 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">Categories</span>
                          <Badge variant="secondary" className="rounded-md">
                            {selectedCategories.size}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {selectedCategories.size} categories selected
                        </div>
                      </div>

                      <div className="rounded-md bg-gray-50 dark:bg-gray-800/50 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">Products</span>
                          <Badge variant="secondary" className="rounded-md">
                            {items.length}+
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {items.length} products previewed, all will be imported
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <Button
                        variant="outline"
                        onClick={handleBack}
                        className="rounded-md"
                      >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back
                      </Button>
                      <Button
                        onClick={handleNext}
                        className="rounded-md"
                      >
                        Start Sync
                        <Sparkles className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {currentStep === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
              >
                <Card className="bg-white dark:bg-card rounded-md border-border">
                  <CardContent className="p-12">
                    <div className="text-center">
                      {syncComplete ? (
                        <>
                          <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
                            <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                          </div>
                          <h2 className="text-xl font-semibold mb-2">Sync Complete!</h2>
                          {syncStats ? (
                            <>
                              <p className="text-sm text-muted-foreground mb-2">
                                Successfully imported {syncStats.itemsSynced} products with stock from Lightspeed.
                              </p>
                              <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground mb-6">
                                <span>{syncStats.totalItems} total items</span>
                                <span>•</span>
                                <span>{syncStats.itemsWithStock} in stock</span>
                                <span>•</span>
                                <span>{selectedCategories.size} categories</span>
                              </div>
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground mb-6">
                              Your inventory has been successfully synced from Lightspeed.
                            </p>
                          )}
                          <Button
                            onClick={() => window.location.href = '/connect-lightspeed'}
                            className="rounded-md"
                          >
                            Back to Connection
                          </Button>
                        </>
                      ) : (
                        <>
                          <Loader2 className="h-16 w-16 animate-spin text-blue-600 mx-auto mb-4" />
                          <h2 className="text-xl font-semibold mb-2">Syncing Your Inventory</h2>
                          <p className="text-sm text-muted-foreground mb-1">
                            Please wait while we import your products from Lightspeed...
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Processing items from {selectedCategories.size} categories
                          </p>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </>
  );
}

