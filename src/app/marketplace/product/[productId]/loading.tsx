// Instant route-level skeleton. Next.js renders this the moment a product link
// is clicked, while the server component fetches/renders the real page — so the
// tap feels instant instead of leaving the user on the old screen.
export default function ProductLoading() {
  return (
    <div className="min-h-screen bg-white sm:bg-gray-50" aria-busy="true" aria-label="Loading product">
      {/* Header placeholder */}
      <div className="h-14 border-b border-gray-100 bg-white" />

      <div className="mx-auto max-w-[1536px] animate-pulse px-3 pb-24 pt-4 sm:px-4 sm:pt-6 lg:pb-8">
        {/* Breadcrumb */}
        <div className="mb-4 hidden h-4 w-64 rounded bg-gray-200 sm:block" />

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* Gallery */}
          <div className="min-w-0 lg:w-[62%]">
            <div className="aspect-square w-full rounded-2xl bg-gray-200 sm:aspect-[4/3]" />
            <div className="mt-3 hidden gap-2 sm:flex">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 w-16 flex-shrink-0 rounded-lg bg-gray-200" />
              ))}
            </div>
          </div>

          {/* Info panel */}
          <div className="min-w-0 space-y-4 lg:w-[38%]">
            <div className="h-7 w-3/4 rounded bg-gray-200" />
            <div className="h-5 w-1/2 rounded bg-gray-200" />
            <div className="h-9 w-32 rounded bg-gray-200" /> {/* price */}
            <div className="h-12 w-full rounded-xl bg-gray-200" /> {/* primary CTA */}
            <div className="h-12 w-full rounded-xl bg-gray-100" /> {/* secondary CTA */}
            <div className="space-y-2 pt-2">
              <div className="h-4 w-full rounded bg-gray-200" />
              <div className="h-4 w-11/12 rounded bg-gray-200" />
              <div className="h-4 w-4/5 rounded bg-gray-200" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
