"use client";

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// Product Breadcrumbs
// Navigation hierarchy for product pages
// ============================================================

interface ProductBreadcrumbsProps {
  level1?: string | null;
  level2?: string | null;
  level3?: string | null;
  productName?: string;
  className?: string;
}

export function ProductBreadcrumbs({
  level1,
  level2,
  level3,
  productName,
  className,
}: ProductBreadcrumbsProps) {
  return (
    <nav className={cn("flex items-center gap-2 text-sm", className)}>
      {/* Home */}
      <Link
        href="/marketplace"
        className="flex items-center gap-1 text-gray-600 hover:text-gray-900 transition-colors"
      >
        <Home className="h-3.5 w-3.5" />
        <span>Home</span>
      </Link>

      {/* Level 1 */}
      {level1 && (
        <>
          <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
          <Link
            href={`/marketplace?level1=${encodeURIComponent(level1)}`}
            className="text-gray-600 hover:text-gray-900 transition-colors"
          >
            {level1}
          </Link>
        </>
      )}

      {/* Level 2 */}
      {level2 && (
        <>
          <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
          <Link
            href={`/marketplace?level1=${encodeURIComponent(level1 || '')}&level2=${encodeURIComponent(level2)}`}
            className="text-gray-600 hover:text-gray-900 transition-colors"
          >
            {level2}
          </Link>
        </>
      )}

      {/* Level 3 */}
      {level3 && (
        <>
          <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
          <Link
            href={`/marketplace?level1=${encodeURIComponent(level1 || '')}&level2=${encodeURIComponent(level2 || '')}&level3=${encodeURIComponent(level3)}`}
            className="text-gray-600 hover:text-gray-900 transition-colors"
          >
            {level3}
          </Link>
        </>
      )}

      {/* Product Name */}
      {productName && (
        <>
          <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-gray-900 truncate max-w-[200px] sm:max-w-xs">
            {productName}
          </span>
        </>
      )}
    </nav>
  );
}





