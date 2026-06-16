import { PageContainer, PageBody } from "@/components/dashboard";
import { cn } from "@/lib/utils";

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-gray-100", className)}
      aria-hidden
    />
  );
}

/** Instant shell for the full-height products catalogue while the route loads. */
export function ProductsRouteSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading products">
      <PageContainer
        size="full"
        className="flex h-[calc(100svh-3.5rem)] min-h-0 flex-col !p-0 !pt-2.5 !pb-0"
      >
        <div className="sticky top-0 z-30 w-full bg-white px-2 sm:px-3 lg:px-4">
          <div className="px-0.5 !pb-0">
            <div className="flex min-h-9 items-center justify-between gap-3">
              <SkeletonBlock className="h-7 w-32" />
              <div className="flex items-center gap-2">
                <SkeletonBlock className="h-8 w-28" />
                <SkeletonBlock className="h-8 w-28" />
              </div>
            </div>
          </div>
        </div>

        <PageBody className="mt-1 flex min-h-0 flex-1 flex-col space-y-0 px-1.5">
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-xl border border-gray-200/80 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <div className="flex flex-col gap-2 rounded-t-xl border-b border-border/60 bg-gray-50 px-4 py-3 sm:flex-row sm:items-center md:px-5">
              <SkeletonBlock className="h-9 w-full sm:max-w-[360px]" />
              <div className="flex flex-wrap items-center gap-2">
                <SkeletonBlock className="h-9 w-[190px]" />
                <SkeletonBlock className="h-9 w-[160px]" />
                <SkeletonBlock className="h-9 w-24" />
              </div>
            </div>

            <div className="min-h-0 flex-1 px-4 py-3 md:px-5">
              <SkeletonBlock className="mb-3 h-9 w-full" />
              <div className="space-y-2">
                {Array.from({ length: 12 }).map((_, index) => (
                  <SkeletonBlock key={index} className="h-12 w-full" />
                ))}
              </div>
            </div>
          </section>
        </PageBody>
      </PageContainer>
    </div>
  );
}
