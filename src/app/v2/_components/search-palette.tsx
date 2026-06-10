'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, ArrowRight, Store as StoreIcon, Clock, TrendingUp,
  CornerDownLeft, Loader2, Bike,
} from 'lucide-react'
import { formatPriceAUD } from '@/lib/marketplace/pricing'
import { cn } from '@/lib/utils'

// ============================================================
// ⌘K command palette — the single interactive centrepiece of /v2.
//
// Opens from: ⌘K / Ctrl+K, "/", or any element carrying the
// `data-v2-search-open` attribute (header button, hero input —
// both of which are server-rendered). Searches the existing
// /api/marketplace/search endpoint with debounce + in-memory
// result cache, full keyboard navigation, recent-search memory.
// ============================================================

interface SearchProduct {
  id: string
  name: string
  price: number
  category: string | null
  imageUrl: string | null
  storeName: string
  listingType: string | null
}

interface SearchStore {
  id: string
  name: string
  logoUrl: string | null
  productCount: number
}

type PaletteItem =
  | { kind: 'search-all'; query: string }
  | { kind: 'product'; product: SearchProduct }
  | { kind: 'store'; store: SearchStore }
  | { kind: 'recent'; query: string }
  | { kind: 'quick'; label: string; href: string }

const RECENT_KEY = 'yj.v2.recent-searches'
const QUICK_LINKS: Array<{ label: string; href: string }> = [
  { label: 'Road bikes', href: '/marketplace?space=stores&level1=Bicycles' },
  { label: 'Parts & components', href: '/marketplace?space=stores&level1=Parts' },
  { label: 'Helmets & apparel', href: '/marketplace?space=stores&level1=Apparel' },
  { label: '1-hour delivery', href: '/marketplace?space=uber' },
  { label: 'Rider listings', href: '/marketplace' },
]

function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((q) => typeof q === 'string').slice(0, 5) : []
  } catch {
    return []
  }
}

function pushRecent(query: string) {
  try {
    const next = [query, ...readRecents().filter((q) => q !== query)].slice(0, 5)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable — fine */
  }
}

export function SearchPalette() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [products, setProducts] = React.useState<SearchProduct[]>([])
  const [stores, setStores] = React.useState<SearchStore[]>([])
  const [recents, setRecents] = React.useState<string[]>([])
  const [activeIndex, setActiveIndex] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const cacheRef = React.useRef(new Map<string, { products: SearchProduct[]; stores: SearchStore[] }>())
  const abortRef = React.useRef<AbortController | null>(null)

  const close = React.useCallback(() => {
    setOpen(false)
    setQuery('')
    setProducts([])
    setStores([])
    setActiveIndex(0)
  }, [])

  // ── Global open triggers ──────────────────────────────────
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
        return
      }
      const target = e.target as HTMLElement | null
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      if (e.key === '/' && !typing) {
        e.preventDefault()
        setOpen(true)
      }
    }
    const onClick = (e: MouseEvent) => {
      const trigger = (e.target as HTMLElement | null)?.closest('[data-v2-search-open]')
      if (trigger) {
        e.preventDefault()
        setOpen(true)
      }
    }
    // Hero input focuses → take over with the palette
    const onFocusIn = (e: FocusEvent) => {
      const trigger = (e.target as HTMLElement | null)?.closest('[data-v2-search-focus]')
      if (trigger) setOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('click', onClick)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('click', onClick)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [])

  // ── Open/close side effects ───────────────────────────────
  React.useEffect(() => {
    if (!open) return
    setRecents(readRecents())
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const t = window.setTimeout(() => inputRef.current?.focus(), 10)
    return () => {
      document.body.style.overflow = previous
      window.clearTimeout(t)
    }
  }, [open])

  // ── Debounced instant search ──────────────────────────────
  React.useEffect(() => {
    const q = query.trim()
    if (!open || q.length < 2) {
      setProducts([])
      setStores([])
      setLoading(false)
      return
    }
    const cached = cacheRef.current.get(q)
    if (cached) {
      setProducts(cached.products)
      setStores(cached.stores)
      setLoading(false)
      return
    }
    setLoading(true)
    const timer = window.setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const res = await fetch(`/api/marketplace/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`search ${res.status}`)
        const data = await res.json()
        const nextProducts: SearchProduct[] = (data.products ?? []).slice(0, 6)
        const nextStores: SearchStore[] = (data.stores ?? []).slice(0, 3)
        cacheRef.current.set(q, { products: nextProducts, stores: nextStores })
        setProducts(nextProducts)
        setStores(nextStores)
        setActiveIndex(0)
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setProducts([])
          setStores([])
        }
      } finally {
        setLoading(false)
      }
    }, 140)
    return () => window.clearTimeout(timer)
  }, [query, open])

  // ── Flat item list for keyboard navigation ────────────────
  const items: PaletteItem[] = React.useMemo(() => {
    const q = query.trim()
    if (q.length >= 2) {
      return [
        { kind: 'search-all', query: q },
        ...products.map((product) => ({ kind: 'product' as const, product })),
        ...stores.map((store) => ({ kind: 'store' as const, store })),
      ]
    }
    return [
      ...recents.map((r) => ({ kind: 'recent' as const, query: r })),
      ...QUICK_LINKS.map((l) => ({ kind: 'quick' as const, ...l })),
    ]
  }, [query, products, stores, recents])

  const go = React.useCallback(
    (item: PaletteItem) => {
      switch (item.kind) {
        case 'search-all':
        case 'recent':
          pushRecent(item.query)
          router.push(`/marketplace?search=${encodeURIComponent(item.query)}`)
          break
        case 'product':
          router.push(`/marketplace/product/${item.product.id}`)
          break
        case 'store':
          router.push(`/marketplace/store/${item.store.id}`)
          break
        case 'quick':
          router.push(item.href)
          break
      }
      close()
    },
    [router, close],
  )

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = items[activeIndex] ?? items[0]
      if (item) go(item)
      else if (query.trim()) go({ kind: 'search-all', query: query.trim() })
    }
  }

  if (!open) return null

  const q = query.trim()

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search Yellow Jersey"
    >
      <button
        type="button"
        aria-label="Close search"
        onClick={close}
        className="absolute inset-0 cursor-default bg-zinc-950/45 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10">
        {/* Input row */}
        <div className="flex items-center gap-3 border-b border-zinc-100 px-4">
          {loading ? (
            <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin text-zinc-400" />
          ) : (
            <Search className="h-[18px] w-[18px] shrink-0 text-zinc-400" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Search bikes, parts, apparel, stores…"
            aria-label="Search query"
            className="h-14 w-full bg-transparent text-[15px] text-zinc-900 outline-none placeholder:text-zinc-400"
          />
          <kbd className="hidden shrink-0 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400 sm:block">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[52vh] overflow-y-auto overscroll-contain p-2">
          {items.length === 0 && q.length >= 2 && !loading && (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <Bike className="h-6 w-6 text-zinc-300" />
              <p className="text-sm text-zinc-500">Nothing matching “{q}” yet</p>
              <p className="text-xs text-zinc-400">Try a brand, a model, or a category</p>
            </div>
          )}

          {items.length === 0 && q.length < 2 && (
            <p className="px-4 py-6 text-center text-sm text-zinc-400">
              Start typing to search the whole marketplace
            </p>
          )}

          {q.length < 2 && recents.length > 0 && (
            <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Recent
            </p>
          )}

          {items.map((item, index) => {
            const active = index === activeIndex
            const baseClass = cn(
              'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
              active ? 'bg-zinc-100' : 'hover:bg-zinc-50',
            )
            const key =
              item.kind === 'product' ? `p-${item.product.id}`
              : item.kind === 'store' ? `s-${item.store.id}`
              : item.kind === 'quick' ? `q-${item.href}`
              : `${item.kind}-${item.query}`

            // Heading before the first quick link when browsing (no query)
            const quickHeading =
              item.kind === 'quick' && index === recents.length && q.length < 2 ? (
                <p
                  key="quick-heading"
                  className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400"
                >
                  Browse
                </p>
              ) : null

            return (
              <React.Fragment key={key}>
                {quickHeading}
                <button
                  type="button"
                  onClick={() => go(item)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={baseClass}
                >
                  {item.kind === 'search-all' && (
                    <>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-950 text-[#ffde59]">
                        <Search className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-zinc-900">
                        Search everything for <span className="font-semibold">“{item.query}”</span>
                      </span>
                      <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-zinc-300" />
                    </>
                  )}

                  {item.kind === 'product' && (
                    <>
                      <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-zinc-100 ring-1 ring-black/5">
                        {item.product.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.product.imageUrl}
                            alt=""
                            width={36}
                            height={36}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-zinc-900">{item.product.name}</span>
                        <span className="block truncate text-xs text-zinc-400">{item.product.storeName}</span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-zinc-900">
                        {formatPriceAUD(Number(item.product.price) || 0)}
                      </span>
                    </>
                  )}

                  {item.kind === 'store' && (
                    <>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 ring-1 ring-black/5">
                        {item.store.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.store.logoUrl}
                            alt=""
                            width={36}
                            height={36}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <StoreIcon className="h-4 w-4 text-zinc-400" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-zinc-900">{item.store.name}</span>
                        <span className="block text-xs text-zinc-400">
                          Store · {item.store.productCount} items
                        </span>
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-300" />
                    </>
                  )}

                  {item.kind === 'recent' && (
                    <>
                      <Clock className="ml-2 h-4 w-4 shrink-0 text-zinc-300" />
                      <span className="min-w-0 flex-1 truncate text-zinc-700">{item.query}</span>
                    </>
                  )}

                  {item.kind === 'quick' && (
                    <>
                      <TrendingUp className="ml-2 h-4 w-4 shrink-0 text-zinc-300" />
                      <span className="min-w-0 flex-1 truncate text-zinc-700">{item.label}</span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-300" />
                    </>
                  )}
                </button>
              </React.Fragment>
            )
          })}
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-4 border-t border-zinc-100 px-4 py-2.5 text-[11px] text-zinc-400">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 font-sans">↑↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 font-sans">↵</kbd> open
          </span>
          <span className="ml-auto hidden items-center gap-1.5 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-[#ffde59]" />
            Searching all stores + rider listings
          </span>
        </div>
      </div>
    </div>
  )
}
