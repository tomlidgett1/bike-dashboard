"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Edit, Trash2, Loader2, CheckCircle, AlertCircle, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Image from "next/image";

// ============================================================
// Bulk Review Step
// Final review before publishing all products
// ============================================================

interface ProductSummary {
  groupId: string;
  imageUrl: string;
  thumbnailUrl?: string;
  title: string;
  price: number;
  itemType: string;
  condition: string;
  isValid: boolean;
  validationErrors?: string[];
}

interface BulkReviewStepProps {
  products: ProductSummary[];
  onEdit: (groupId: string) => void;
  onDelete: (groupId: string) => void;
  onPublish: () => void;
  onBack?: () => void;
  isPublishing?: boolean;
}

export function BulkReviewStep({
  products,
  onEdit,
  onDelete,
  onPublish,
  onBack,
  isPublishing = false,
}: BulkReviewStepProps) {
  const [isMobile, setIsMobile] = React.useState(false);
  
  // Detect if on mobile
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const validProducts = products.filter(p => p.isValid);
  const invalidProducts = products.filter(p => !p.isValid);
  const allValid = invalidProducts.length === 0;

  const totalValue = products.reduce((sum, p) => sum + p.price, 0);

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-24">
      <div className={cn("mx-auto", isMobile ? "px-4" : "max-w-6xl px-4")}>
        {/* Header */}
        <div className={cn("mb-4", isMobile ? "text-center" : "mb-8")}>
          <h1 className={cn("font-bold text-gray-900 mb-1", isMobile ? "text-xl" : "text-3xl")}>
            Ready to Publish
          </h1>
          <p className={cn("text-gray-500", isMobile ? "text-sm" : "text-base")}>
            {validProducts.length} listing{validProducts.length !== 1 ? 's' : ''} • ${totalValue.toLocaleString()} total
          </p>
        </div>

        {/* Summary Stats - Mobile compact */}
        {isMobile ? (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            <div className="bg-white rounded-xl px-4 py-3 border border-gray-200 flex-shrink-0">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Products</p>
              <p className="text-lg font-bold text-gray-900">{products.length}</p>
            </div>
            <div className="bg-white rounded-xl px-4 py-3 border border-gray-200 flex-shrink-0">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Ready</p>
              <p className="text-lg font-bold text-green-600">{validProducts.length}</p>
            </div>
            <div className="bg-white rounded-xl px-4 py-3 border border-gray-200 flex-shrink-0">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Value</p>
              <p className="text-lg font-bold text-gray-900">${totalValue.toLocaleString()}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-md p-6 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Total Products</p>
                  <p className="text-2xl font-bold text-gray-900">{products.length}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-gray-400" />
              </div>
            </div>
            <div className="bg-white rounded-md p-6 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Ready to Publish</p>
                  <p className="text-2xl font-bold text-green-600">{validProducts.length}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </div>
            <div className="bg-white rounded-md p-6 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Total Value</p>
                  <p className="text-2xl font-bold text-gray-900">${totalValue.toLocaleString()}</p>
                </div>
                <DollarSign className="h-8 w-8 text-gray-400" />
              </div>
            </div>
          </div>
        )}

        {/* Validation Issues */}
        {!allValid && (
          <div className={cn(
            "bg-yellow-50 border border-yellow-200 p-3 mb-4",
            isMobile ? "rounded-xl" : "rounded-md p-4 mb-6"
          )}>
            <div className="flex items-center gap-2">
              <AlertCircle className={cn("text-yellow-600 flex-shrink-0", isMobile ? "h-4 w-4" : "h-5 w-5")} />
              <p className={cn("text-yellow-900 font-medium", isMobile ? "text-xs" : "text-sm")}>
                {invalidProducts.length} product{invalidProducts.length !== 1 ? 's need' : ' needs'} attention
              </p>
            </div>
          </div>
        )}

        {/* Products List */}
        <div className={cn("space-y-3", isMobile ? "mb-4" : "grid grid-cols-2 gap-6 mb-8 space-y-0")}>
          {products.map((product, index) => (
            <motion.div
              key={product.groupId}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              className={cn(
                "bg-white border-2 overflow-hidden",
                product.isValid ? "border-gray-200" : "border-yellow-300",
                isMobile ? "rounded-xl" : "rounded-md"
              )}
            >
              <div className="flex">
                {/* Image */}
                <div className={cn(
                  "relative flex-shrink-0 bg-gray-100",
                  isMobile ? "w-24 h-24" : "w-32 h-32"
                )}>
                  <Image
                    src={product.thumbnailUrl || product.imageUrl}
                    alt={product.title}
                    fill
                    className="object-cover"
                  />
                  {!product.isValid && (
                    <div className="absolute top-1.5 left-1.5">
                      <div className={cn(
                        "rounded-full bg-yellow-500 flex items-center justify-center",
                        isMobile ? "h-5 w-5" : "h-6 w-6"
                      )}>
                        <AlertCircle className={cn("text-white", isMobile ? "h-3 w-3" : "h-4 w-4")} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className={cn("flex-1 min-w-0", isMobile ? "p-3" : "p-4")}>
                  <h3 className={cn("font-semibold text-gray-900 truncate", isMobile ? "text-sm mb-0.5" : "text-base mb-1")}>
                    {product.title || 'Untitled Product'}
                  </h3>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className={cn(
                      "px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded",
                      isMobile ? "text-[10px]" : "text-xs"
                    )}>
                      {product.itemType}
                    </span>
                    <span className={cn(
                      "px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded",
                      isMobile ? "text-[10px]" : "text-xs"
                    )}>
                      {product.condition}
                    </span>
                  </div>
                  <p className={cn("font-bold text-gray-900", isMobile ? "text-base mb-2" : "text-lg mb-3")}>
                    ${product.price.toLocaleString()}
                  </p>

                  {/* Validation Errors */}
                  {!product.isValid && product.validationErrors && !isMobile && (
                    <div className="mb-3">
                      <ul className="text-xs text-yellow-700 space-y-1">
                        {product.validationErrors.slice(0, 2).map((error, i) => (
                          <li key={i}>• {error}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onEdit(product.groupId)}
                      className={cn("flex-1", isMobile ? "rounded-lg h-8 text-xs" : "rounded-md")}
                    >
                      <Edit className={cn(isMobile ? "h-3 w-3 mr-1" : "h-3.5 w-3.5 mr-1.5")} />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onDelete(product.groupId)}
                      className={cn(isMobile ? "rounded-lg h-8 w-8 p-0" : "rounded-md")}
                    >
                      <Trash2 className={cn(isMobile ? "h-3 w-3" : "h-3.5 w-3.5")} />
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Empty State */}
        {products.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-600">No products to review</p>
          </div>
        )}

        {/* Actions - Fixed on mobile */}
        <div className={cn(
          "flex gap-3",
          isMobile ? "fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200" : ""
        )}>
          {onBack && !isMobile && (
            <Button
              variant="outline"
              onClick={onBack}
              disabled={isPublishing}
              className="rounded-md"
            >
              Back to Edit
            </Button>
          )}
          <Button
            onClick={onPublish}
            disabled={!allValid || products.length === 0 || isPublishing}
            className={cn(
              "flex-1 font-semibold",
              isMobile 
                ? "rounded-xl h-12 bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900" 
                : "rounded-md bg-gray-900 hover:bg-gray-800 h-12 text-base"
            )}
          >
            {isPublishing ? (
              <>
                <Loader2 className={cn("animate-spin mr-2", isMobile ? "h-4 w-4" : "h-5 w-5")} />
                Publishing...
              </>
            ) : (
              <>Publish {validProducts.length} Listing{validProducts.length !== 1 ? 's' : ''}</>
            )}
          </Button>
        </div>

        {/* Publishing Info - Desktop only */}
        {!isMobile && !isPublishing && allValid && products.length > 0 && (
          <div className="mt-4 text-center text-sm text-gray-600">
            Your listings will be published to the marketplace immediately
          </div>
        )}
      </div>
    </div>
  );
}

