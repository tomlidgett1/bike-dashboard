import { PageContainer } from "@/components/dashboard";
import { cn } from "@/lib/utils";

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-gray-100", className)}
      aria-hidden
    />
  );
}

/**
 * Instant shell shown during soft navigation between store dashboard routes.
 * Mirrors the common PageContainer + header + content rhythm.
 */
export function StoreSettingsRouteSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading page">
      <PageContainer size="wide">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <SkeletonBlock className="h-8 w-44 sm:w-56" />
            <SkeletonBlock className="h-4 w-full max-w-md" />
          </div>
          <SkeletonBlock className="h-8 w-28 shrink-0" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-28 sm:col-span-2 xl:col-span-1" />
        </div>

        <SkeletonBlock className="h-72" />
      </div>
      </PageContainer>
    </div>
  );
}
