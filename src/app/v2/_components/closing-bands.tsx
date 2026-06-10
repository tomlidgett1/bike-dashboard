import Link from 'next/link'
import { ArrowRight, BadgeCheck, CreditCard, Sparkles, Zap } from 'lucide-react'

// ============================================================
// Closing bands: trust strip, sell CTA, footer. Server Components.
// ============================================================

const VALUE_PROPS = [
  {
    icon: BadgeCheck,
    title: 'Verified bike stores',
    body: 'Real shops with synced live inventory — what you see is on the shelf.',
  },
  {
    icon: Zap,
    title: 'One-hour delivery',
    body: 'Eligible items arrive by Uber in as little as 60 minutes.',
  },
  {
    icon: CreditCard,
    title: 'Secure checkout',
    body: 'Payments held and processed by Stripe. Card details never touch us.',
  },
  {
    icon: Sparkles,
    title: 'AI does the typing',
    body: 'Photograph your bike — AI writes the listing, specs and price guide.',
  },
] as const

export function ValueProps() {
  return (
    <section
      aria-label="Why Yellow Jersey"
      className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-10 [content-visibility:auto] [contain-intrinsic-size:auto_320px]"
    >
      <div className="grid gap-px overflow-hidden rounded-3xl bg-zinc-200 ring-1 ring-zinc-200 sm:grid-cols-2 lg:grid-cols-4">
        {VALUE_PROPS.map((prop) => (
          <div key={prop.title} className="bg-white p-6 transition-colors hover:bg-zinc-50 sm:p-7">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ffde59]">
              <prop.icon className="h-5 w-5 text-zinc-950" />
            </span>
            <h3 className="mt-4 text-[15px] font-bold tracking-tight text-zinc-950">{prop.title}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">{prop.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

export function SellBanner() {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-10 [content-visibility:auto] [contain-intrinsic-size:auto_420px]">
      <div className="v2-noise relative overflow-hidden rounded-[2rem] bg-zinc-950 px-6 py-14 text-center sm:px-12 sm:py-20">
        <div
          aria-hidden
          className="absolute -right-24 -top-32 h-[380px] w-[380px] rounded-full bg-[#ffde59]/[0.16] blur-[110px]"
        />
        <div
          aria-hidden
          className="absolute -bottom-40 -left-24 h-[380px] w-[380px] rounded-full bg-[#ffde59]/[0.08] blur-[110px]"
        />
        <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#ffde59]">
            Sell on Yellow Jersey
          </p>
          <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-black tracking-tight text-white sm:text-5xl">
            Your next bike is hiding in your garage.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-zinc-400">
            Snap a photo and AI writes the listing in about 60 seconds — name, specs,
            condition, price guide. Free to list, riders Australia-wide.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/marketplace/sell"
              className="inline-flex items-center gap-2 rounded-full bg-[#ffde59] px-6 py-3.5 text-sm font-bold text-zinc-950 transition-all hover:bg-[#f0cf45] hover:shadow-[0_0_32px_rgba(255,222,89,0.4)]"
            >
              Sell something now
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3.5 text-sm font-bold text-white transition-colors hover:border-white/40 hover:bg-white/5"
            >
              Open a store account
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

const FOOTER_COLUMNS = [
  {
    heading: 'Buy',
    links: [
      { label: 'All listings', href: '/marketplace?space=stores' },
      { label: 'Rider listings', href: '/marketplace' },
      { label: '1-hour delivery', href: '/marketplace?space=uber' },
      { label: 'Bicycles', href: '/marketplace?space=stores&level1=Bicycles' },
      { label: 'Parts', href: '/marketplace?space=stores&level1=Parts' },
    ],
  },
  {
    heading: 'Sell',
    links: [
      { label: 'List an item', href: '/marketplace/sell' },
      { label: 'For bike stores', href: '/login' },
      { label: 'Connect Lightspeed', href: '/connect-lightspeed' },
    ],
  },
  {
    heading: 'Support',
    links: [
      { label: 'Help centre', href: '/marketplace/help' },
      { label: 'Your purchases', href: '/marketplace/purchases' },
      { label: 'Messages', href: '/messages' },
    ],
  },
] as const

export function V2Footer() {
  return (
    <footer className="border-t border-zinc-100 bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.4fr_repeat(3,1fr)] lg:px-10">
        <div>
          <p className="text-lg font-black italic tracking-tighter text-zinc-950">
            YELLOW<span className="rounded-sm bg-[#ffde59] px-1">JERSEY</span>
          </p>
          <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-zinc-400">
            The cycling marketplace — every store and every rider, one search.
            Made in Melbourne.
          </p>
        </div>
        {FOOTER_COLUMNS.map((column) => (
          <nav key={column.heading} aria-label={column.heading}>
            <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">
              {column.heading}
            </p>
            <ul className="mt-3.5 space-y-2.5">
              {column.links.map((link) => (
                <li key={link.href + link.label}>
                  <Link
                    href={link.href}
                    className="text-[13px] font-medium text-zinc-600 transition-colors hover:text-zinc-950"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-zinc-100">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-zinc-400 sm:px-6 lg:px-10">
          <p>© {new Date().getFullYear()} Yellow Jersey. All rights reserved.</p>
          <p className="flex items-center gap-1.5">
            <span className="v2-live-dot h-1.5 w-1.5 rounded-full bg-[#ffde59]" />
            All systems pedalling
          </p>
        </div>
      </div>
    </footer>
  )
}
