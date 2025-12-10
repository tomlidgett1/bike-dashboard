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
  const validProducts = products.filter(p => p.isValid);
  const invalidProducts = products.filter(p => !p.isValid);
  const allValid = invalidProducts.length === 0;

  const totalValue = products.reduce((sum, p) => sum + p.price, 0);

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-20">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Review & Publish
          </h1>
          <p className="text-gray-600">
            Review your listings before publishing them to the marketplace
          </p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
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
                <p className="text-2xl font-bold text-gray-900">
                  ${totalValue.toLocaleString()}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-gray-400" />
            </div>
          </div>
        </div>

        {/* Validation Issues */}
        {!allValid && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-yellow-900 mb-1">
                  {invalidProducts.length} product{invalidProducts.length !== 1 ? 's need' : ' needs'} attention
                </h3>
                <p className="text-sm text-yellow-800">
                  Please fix validation errors before publishing
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Products Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {products.map((product, index) => (
            <motion.div
              key={product.groupId}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={cn(
                "bg-white rounded-md border-2 overflow-hidden",
                product.isValid ? "border-gray-200" : "border-yellow-300"
              )}
            >
              <div className="flex">
                {/* Image */}
                <div className="relative w-32 h-32 flex-shrink-0 bg-gray-100">
                  <Image
                    src={product.thumbnailUrl || product.imageUrl}
                    alt={product.title}
                    fill
                    className="object-cover"
                  />
                  {!product.isValid && (
                    <div className="absolute top-2 left-2">
                      <div className="h-6 w-6 rounded-full bg-yellow-500 flex items-center justify-center">
                        <AlertCircle className="h-4 w-4 text-white" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 p-4 min-w-0">
                  <h3 className="text-base font-semibold text-gray-900 mb-1 truncate">
                    {product.title || 'Untitled Product'}
                  </h3>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded-md">
                      {product.itemType}
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded-md">
                      {product.condition}
                    </span>
                  </div>
                  <p className="text-lg font-bold text-gray-900 mb-3">
                    ${product.price.toLocaleString()}
                  </p>

                  {/* Validation Errors */}
                  {!product.isValid && product.validationErrors && (
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
                      className="rounded-md flex-1"
                    >
                      <Edit className="h-3.5 w-3.5 mr-1.5" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onDelete(product.groupId)}
                      className="rounded-md"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
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

        {/* Actions */}
        <div className="flex gap-3">
          {onBack && (
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
            className="flex-1 rounded-md bg-gray-900 hover:bg-gray-800 h-12 text-base"
          >
            {isPublishing ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Publishing {validProducts.length} listing{validProducts.length !== 1 ? 's' : ''}...
              </>
            ) : (
              <>
                Publish {validProducts.length} Listing{validProducts.length !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </div>

        {/* Publishing Info */}
        {!isPublishing && allValid && products.length > 0 && (
          <div className="mt-4 text-center text-sm text-gray-600">
            Your listings will be published to the marketplace immediately
          </div>
        )}
      </div>
    </div>
  );
}

