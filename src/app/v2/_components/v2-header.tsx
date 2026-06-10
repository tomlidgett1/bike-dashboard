import Link from 'next/link'
import { Search } from 'lucide-react'

// ============================================================
// V2 header — a Server Component. Dark glass bar that reads as
// part of the hero at the top and as a floating chrome strip
// over the light page below. The search button carries
// `data-v2-search-open`, which the SearchPalette island listens
// for globally — no client code in the header itself.
// ============================================================

const NAV_LINKS = [
  { label: 'Marketplace', href: '/marketplace' },
  { label: 'Bike stores', href: '/marketplace?space=stores' },
  { label: '1-hr delivery', href: '/marketplace?space=uber' },
] as const

export function V2Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-zinc-950/85 text-white backdrop-blur-xl supports-[backdrop-filter]:bg-zinc-950/70">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-4 sm:px-6 lg:px-10">
        {/* Wordmark */}
        <Link
          href="/v2"
          className="flex shrink-0 items-baseline gap-1.5 outline-none focus-visible:ring-2 focus-visible:ring-[#ffde59] rounded-sm"
          aria-label="Yellow Jersey home"
        >
          <span className="text-lg font-black italic tracking-tighter">
            YELLOW<span className="text-[#ffde59]">JERSEY</span>
          </span>
          <span className="hidden rounded-full border border-[#ffde59]/40 px-1.5 py-px text-[9px] font-bold tracking-widest text-[#ffde59] sm:block">
            V2
          </span>
        </Link>

        {/* Nav */}
        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-1.5 text-[13px] font-medium text-zinc-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white outline-none"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Search trigger — opens the ⌘K palette */}
        <button
          type="button"
          data-v2-search-open
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-white/10 hover:text-white sm:w-auto sm:gap-2.5 sm:bg-white/[0.07] sm:px-3.5 sm:ring-1 sm:ring-white/15 sm:hover:bg-white/[0.12] outline-none focus-visible:ring-2 focus-visible:ring-[#ffde59]"
          aria-label="Search the marketplace"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="hidden text-[13px] text-zinc-400 sm:block sm:w-28 sm:text-left lg:w-40">
            Search anything…
          </span>
          <kbd className="hidden rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400 sm:block">
            ⌘K
          </kbd>
        </button>

        {/* Account + sell */}
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/login"
            className="hidden rounded-full px-3 py-1.5 text-[13px] font-medium text-zinc-300 transition-colors hover:bg-white/10 hover:text-white sm:block outline-none focus-visible:ring-2 focus-visible:ring-[#ffde59]"
          >
            Sign in
          </Link>
          <Link
            href="/marketplace/sell"
            className="rounded-full bg-[#ffde59] px-3.5 py-2 text-[13px] font-bold text-zinc-950 transition-all hover:bg-[#f0cf45] hover:shadow-[0_0_24px_rgba(255,222,89,0.35)] outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Sell
          </Link>
        </div>
      </div>
    </header>
  )
}
