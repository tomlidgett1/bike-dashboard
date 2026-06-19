// Instant route-level skeleton for a storefront. Rendered the moment a store
// link is clicked — covering the server render (and any UUID→slug redirect) — so
// the page feels immediate instead of waiting on a blank screen / spinner.
export default function StoreLoading() {
  return (
    <div className="min-h-screen bg-gray-50" aria-busy="true" aria-label="Loading store">
      {/* Header placeholder */}
      <div className="h-14 border-b border-gray-100 bg-white" />

      <div className="animate-pulse">
        {/* Cover image */}
        <div className="h-40 w-full bg-gray-200 sm:h-56" />

        {/* Store identity row */}
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
          <div className="-mt-8 flex items-end gap-4">
            <div className="h-20 w-20 rounded-2xl border-4 border-white bg-gray-300 sm:h-24 sm:w-24" />
            <div className="mb-2 space-y-2">
              <div className="h-6 w-48 rounded bg-gray-200" />
              <div className="h-4 w-32 rounded bg-gray-200" />
            </div>
          </div>

          {/* Tab bar */}
          <div className="mt-6 flex gap-2 border-b border-gray-200 pb-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 w-20 rounded-full bg-gray-200" />
            ))}
          </div>

          {/* Carousel rows */}
          {Array.from({ length: 2 }).map((_, row) => (
            <div key={row} className="mt-8">
              <div className="mb-3 h-5 w-40 rounded bg-gray-200" />
              <div className="flex gap-3 overflow-hidden">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="w-40 flex-shrink-0 sm:w-48">
                    <div className="aspect-square w-full rounded-xl bg-gray-200" />
                    <div className="mt-2 h-4 w-3/4 rounded bg-gray-200" />
                    <div className="mt-1.5 h-4 w-1/3 rounded bg-gray-200" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
