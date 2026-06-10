import Link from 'next/link'
import { ArrowRight, BadgeCheck, Plus, Store as StoreIcon } from 'lucide-react'
import type { V2Store } from '../_lib/data'

// ============================================================
// Store cards — rendered inside a Rail. Server Component.
// ============================================================

function storeTypeLabel(raw: string): string {
  const cleaned = raw.replace(/[_-]/g, ' ').trim()
  if (!cleaned) return 'Bike store'
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase()
}

export function StoreCard({ store }: { store: V2Store }) {
  return (
    <Link
      href={`/marketplace/store/${store.id}`}
      className="group flex h-full flex-col rounded-3xl border border-zinc-200 bg-white p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-lg hover:shadow-zinc-950/[0.06] outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
    >
      <div className="flex items-center gap-3.5">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-zinc-100 ring-1 ring-black/5">
          {store.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={store.logoUrl}
              alt={`${store.name} logo`}
              width={56}
              height={56}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-lg font-black text-zinc-400">
              {store.name.charAt(0).toUpperCase()}
            </span>
          )}
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1 truncate text-[15px] font-bold tracking-tight text-zinc-950">
            <span className="truncate">{store.name}</span>
            <BadgeCheck className="h-4 w-4 shrink-0 text-zinc-900" aria-label="Verified" />
          </p>
          <p className="truncate text-xs text-zinc-400">{storeTypeLabel(store.type)}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3.5">
        <p className="text-xs font-medium text-zinc-500">
          <span className="font-bold text-zinc-950">{store.productCount.toLocaleString('en-AU')}</span> items live
        </p>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-400 transition-colors group-hover:text-zinc-950">
          Visit <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  )
}

/** Final card in the stores rail — pitch to stores. */
export function YourStoreCard() {
  return (
    <Link
      href="/login"
      className="group flex h-full min-h-[150px] flex-col items-center justify-center gap-2.5 rounded-3xl border-2 border-dashed border-zinc-200 bg-zinc-50/50 p-5 text-center transition-colors hover:border-[#e6c84e] hover:bg-[#fffae6] outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white ring-1 ring-zinc-200 transition-colors group-hover:bg-[#ffde59] group-hover:ring-[#ffde59]">
        <Plus className="h-5 w-5 text-zinc-400 transition-colors group-hover:text-zinc-950" />
      </span>
      <span>
        <span className="block text-sm font-bold text-zinc-950">Your store here</span>
        <span className="mt-0.5 block text-xs text-zinc-400">
          Sync your POS, sell to every rider
        </span>
      </span>
      <StoreIcon className="sr-only" />
    </Link>
  )
}
