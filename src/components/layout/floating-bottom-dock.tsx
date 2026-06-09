"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useGenie } from "@/components/providers/genie-provider";
import { useGenieJobs } from "@/components/providers/genie-jobs-provider";
import { useOptimizeJobs } from "@/components/providers/optimize-jobs-provider";
import { isStoreDashboardPath } from "@/lib/routes/store-dashboard";
import { cn } from "@/lib/utils";

const LazyFloatingOptimizeJobsCard = dynamic(
  () =>
    import("@/components/optimize/floating-optimize-jobs-card").then(
      (mod) => mod.FloatingOptimizeJobsCard,
    ),
  { ssr: false },
);

const LazyFloatingGenieJobsPill = dynamic(
  () =>
    import("@/components/genie/floating-genie-jobs-pill").then(
      (mod) => mod.FloatingGenieJobsPill,
    ),
  { ssr: false },
);

const HOME_PATH = "/settings/store/home";
const STORE_PAGE_PREFIX = "/marketplace/store/";

/** Matches GeniePortal / GenieButton visibility (orb is sm+ on marketplace-style pages). */
function isGenieFloatingOrbVisible(
  pathname: string | null,
  isOpen: boolean,
  isExpanded: boolean,
  productContext: unknown,
) {
  if (!pathname || pathname.startsWith("/login")) return false;
  if (pathname.startsWith(STORE_PAGE_PREFIX)) return false;
  if (isStoreDashboardPath(pathname)) return false;
  if (productContext) return false;
  if (isOpen || isExpanded) return false;
  return true;
}

/**
 * Stacks bottom-right progress panels in a single column so they never overlap.
 * Order (bottom → top): optimise jobs, Genie jobs.
 * Sits above the Genie floating orb when that orb is shown.
 */
export function FloatingBottomDock() {
  const pathname = usePathname();
  const { isOpen, isExpanded, productContext } = useGenie();
  const optimizeJobs = useOptimizeJobs();
  const genieJobs = useGenieJobs();
  const isOnHome = pathname === HOME_PATH;
  const reserveGenieOrbSpace = isGenieFloatingOrbVisible(
    pathname,
    isOpen,
    isExpanded,
    productContext,
  );

  const showOptimize = optimizeJobs.visibleJobs.length > 0;
  const showGenie = !isOnHome && genieJobs.visibleJobs.length > 0;
  if (!showOptimize && !showGenie) {
    return null;
  }

  return (
    <div
      className={cn(
        "pointer-events-none fixed bottom-6 right-6 z-[100] flex flex-col-reverse items-end gap-3",
        reserveGenieOrbSpace &&
          "sm:bottom-[calc(1.5rem+3.5rem+0.75rem+env(safe-area-inset-bottom,0px))]",
      )}
    >
      {showOptimize ? (
        <div className="pointer-events-auto w-fit max-w-[min(100vw-2rem,22rem)]">
          <LazyFloatingOptimizeJobsCard />
        </div>
      ) : null}
      {showGenie ? (
        <div className="pointer-events-auto w-fit max-w-[min(100vw-2rem,22rem)]">
          <LazyFloatingGenieJobsPill />
        </div>
      ) : null}
    </div>
  );
}
