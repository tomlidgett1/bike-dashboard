import { STORE_PAGE_CONTENT_SHELL } from "@/components/marketplace/store-profile/store-profile-chrome";
import { cn } from "@/lib/utils";

function StoreProductCardSkeleton() {
  return (
    <div className="flex h-full flex-col rounded-3xl border border-gray-200 bg-white p-3 sm:p-4">
      <div className="mb-3 aspect-square w-full rounded-2xl bg-gray-200" />
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="h-4 w-full rounded bg-gray-200" />
        <div className="mt-1 h-4 w-3/4 rounded bg-gray-200" />
        <div className="mt-auto flex items-center justify-between gap-1.5 border-t border-gray-200 pt-2.5 sm:pt-3">
          <div className="h-5 w-16 rounded bg-gray-200" />
          <div className="h-6 w-14 rounded-full bg-gray-200" />
        </div>
      </div>
    </div>
  );
}

function CarouselRowSkeleton({ gridCols }: { gridCols: string }) {
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="h-6 w-40 rounded-md bg-gray-200 sm:h-7 sm:w-48" />
          <div className="hidden h-3.5 w-56 rounded-md bg-gray-200 sm:block" />
        </div>
        <div className="h-4 w-20 rounded-md bg-gray-200" />
      </div>

      <div className="flex gap-3 overflow-hidden sm:hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="w-[42vw] flex-shrink-0">
            <StoreProductCardSkeleton />
          </div>
        ))}
      </div>

      <div className={cn("hidden gap-3 sm:grid sm:gap-4", gridCols)}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-full">
            <StoreProductCardSkeleton />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Route-level skeleton — mirrors StoreProfileChrome + default Home tab layout. */
export function StoreProfileSkeleton() {
  const shell = STORE_PAGE_CONTENT_SHELL;

  return (
    <div className="min-h-screen overflow-x-hidden bg-gray-50" aria-busy="true" aria-label="Loading store">
      <div className="sticky top-0 z-40 animate-pulse">
        <header className="border-b border-gray-200 bg-white/95">
          <div className={shell}>
            <div className="flex h-14 items-center justify-between gap-3 sm:h-16 sm:gap-4">
              <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                <div className="h-9 w-9 flex-shrink-0 rounded-full bg-gray-200 sm:h-11 sm:w-11" />
                <div className="min-w-0 space-y-1.5">
                  <div className="h-4 w-36 rounded-md bg-gray-200 sm:h-5 sm:w-44" />
                  <div className="hidden h-3 w-52 rounded-md bg-gray-200 sm:block" />
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <div className="hidden h-9 w-44 rounded-md bg-gray-200 md:block lg:w-56" />
                <div className="h-9 w-9 rounded-md bg-gray-200 md:hidden" />
                <div className="h-9 w-9 rounded-md bg-gray-200" />
                <div className="hidden h-5 w-[84px] rounded-md bg-gray-200 sm:block" />
              </div>
            </div>
          </div>
        </header>

        <div
          className={cn(
            shell,
            "hidden border-b border-gray-200 bg-gray-50 md:block",
            "md:pb-2.5 md:pt-2.5",
          )}
        >
          <div className="hidden items-center md:flex md:overflow-hidden md:rounded-xl md:border md:border-gray-200 md:bg-white md:shadow-[0_4px_20px_rgba(17,17,17,0.08)]">
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden px-0.5">
              {Array.from({ length: 7 }).map((_, i) => (
                <div
                  key={i}
                  className="flex h-11 flex-shrink-0 items-center gap-1.5 px-3.5 py-3.5"
                >
                  <div className="h-3.5 w-3.5 rounded bg-gray-200" />
                  <div
                    className="h-3.5 rounded bg-gray-200"
                    style={{ width: `${52 + (i % 3) * 12}px` }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="animate-pulse">
        <section className="relative sm:hidden">
          <div className="h-48 w-full bg-gray-300" />
          <div className="relative z-10 -mt-5 overflow-hidden rounded-t-xl bg-gray-50 pt-3">
            <div className={cn(shell, "space-y-8 pb-8")}>
              <section>
                <CarouselRowSkeleton gridCols="grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8" />
              </section>
              <section>
                <CarouselRowSkeleton gridCols="grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" />
              </section>
            </div>
          </div>
        </section>

        <section className={cn(shell, "hidden pt-10 sm:block sm:pt-14")}>
          <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
            <div className="space-y-4">
              <div className="h-10 w-full max-w-md rounded-md bg-gray-200 sm:h-14" />
              <div className="h-4 w-full max-w-sm rounded-md bg-gray-200" />
              <div className="h-4 w-2/3 max-w-xs rounded-md bg-gray-200" />
              <div className="flex flex-wrap gap-3 pt-2">
                <div className="h-10 w-28 rounded-full bg-gray-300" />
                <div className="h-10 w-32 rounded-full bg-gray-200" />
              </div>
            </div>
            <div className="aspect-[4/3] rounded-3xl bg-gray-200 ring-1 ring-gray-200/70 lg:block" />
          </div>
        </section>

        <div className="hidden space-y-8 pb-8 pt-3 sm:block sm:space-y-10 sm:pb-10 sm:pt-4">
          <section className={shell}>
            <CarouselRowSkeleton gridCols="grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8" />
          </section>
          <section className={shell}>
            <CarouselRowSkeleton gridCols="grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" />
          </section>
        </div>
      </div>
    </div>
  );
}
