import Link from 'next/link'

// ============================================================
// Brand marquee — pure-CSS infinite scroll of brands that are
// genuinely live in inventory right now (curated server-side).
// Each brand links into a real search. Pauses on hover,
// disabled entirely under prefers-reduced-motion.
// ============================================================

export function BrandMarquee({ brands }: { brands: string[] }) {
  if (brands.length < 6) return null

  const items = brands.slice(0, 16)

  return (
    <div className="v2-marquee border-y border-white/[0.08] bg-zinc-950 py-5" aria-label="Brands in stock">
      <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
        <div className="v2-marquee-track flex w-max items-center">
          {[0, 1].map((copy) => (
            <ul
              key={copy}
              aria-hidden={copy === 1}
              className="flex shrink-0 items-center"
            >
              {items.map((brand) => (
                <li key={`${copy}-${brand}`} className="flex items-center">
                  <Link
                    href={`/marketplace?search=${encodeURIComponent(brand)}`}
                    tabIndex={copy === 1 ? -1 : 0}
                    className="px-7 text-sm font-bold uppercase tracking-[0.18em] text-zinc-600 transition-colors hover:text-[#ffde59]"
                  >
                    {brand}
                  </Link>
                  <span aria-hidden className="h-1 w-1 rounded-full bg-zinc-800" />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  )
}
