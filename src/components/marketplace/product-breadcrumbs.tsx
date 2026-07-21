"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Home } from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";

interface ProductBreadcrumbsProps {
  level1?: string | null;
  level2?: string | null;
  level3?: string | null;
  productName?: string;
  className?: string;
}

const crumbLinkClassName =
  "text-gray-500 transition-colors hover:text-gray-900";

function BreadcrumbSeparator() {
  return (
    <>
      <span className="hidden shrink-0 text-gray-400 sm:inline" aria-hidden>
        /
      </span>
      <ChevronRight className="h-3 w-3 shrink-0 text-gray-300 sm:hidden" aria-hidden />
    </>
  );
}

export function ProductBreadcrumbs({
  level1,
  level2,
  level3,
  productName,
  className,
}: ProductBreadcrumbsProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex min-w-0 items-center gap-1.5 overflow-x-auto text-sm scrollbar-hide sm:gap-2",
        className,
      )}
    >
      <Link
        href="/marketplace"
        className={cn(crumbLinkClassName, "inline-flex shrink-0 items-center gap-1")}
      >
        <Home className="h-3.5 w-3.5 sm:hidden" />
        <span className="sm:hidden">Home</span>
        <span className="hidden sm:inline">Shop</span>
      </Link>

      {level1 ? (
        <>
          <BreadcrumbSeparator />
          <Link
            href={`/marketplace?space=stores&level1=${encodeURIComponent(level1)}`}
            className={cn(crumbLinkClassName, "shrink-0")}
          >
            {level1}
          </Link>
        </>
      ) : null}

      {level2 ? (
        <>
          <BreadcrumbSeparator />
          <Link
            href={`/marketplace?space=stores&level1=${encodeURIComponent(level1 || "")}&level2=${encodeURIComponent(level2)}`}
            className={cn(crumbLinkClassName, "shrink-0")}
          >
            {level2}
          </Link>
        </>
      ) : null}

      {level3 ? (
        <>
          <BreadcrumbSeparator />
          <Link
            href={`/marketplace?space=stores&level1=${encodeURIComponent(level1 || "")}&level2=${encodeURIComponent(level2 || "")}&level3=${encodeURIComponent(level3)}`}
            className={cn(crumbLinkClassName, "shrink-0")}
          >
            {level3}
          </Link>
        </>
      ) : null}

      {productName ? (
        <>
          <BreadcrumbSeparator />
          <span
            aria-current="page"
            className="min-w-0 truncate font-medium text-gray-900"
            title={productName}
          >
            {productName}
          </span>
        </>
      ) : null}
    </nav>
  );
}
