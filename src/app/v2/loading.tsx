// Instant shell while the first (uncached) render fetches data.
// Mirrors the hero's dark canvas so navigation feels seamless.
export default function V2Loading() {
  return (
    <div className="min-h-dvh bg-zinc-950">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
        <div className="flex h-16 items-center justify-between">
          <div className="h-5 w-36 animate-pulse rounded-full bg-white/10" />
          <div className="h-9 w-48 animate-pulse rounded-full bg-white/10" />
        </div>
        <div className="pt-20">
          <div className="h-7 w-56 animate-pulse rounded-full bg-white/10" />
          <div className="mt-8 space-y-4">
            <div className="h-14 w-[68%] animate-pulse rounded-2xl bg-white/10" />
            <div className="h-14 w-[52%] animate-pulse rounded-2xl bg-white/10" />
            <div className="h-14 w-[60%] animate-pulse rounded-2xl bg-[#ffde59]/20" />
          </div>
          <div className="mt-10 h-14 w-full max-w-xl animate-pulse rounded-full bg-white/15" />
        </div>
      </div>
    </div>
  )
}
