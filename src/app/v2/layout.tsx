import type { Metadata } from 'next'
import { ForceLightChrome } from '@/components/layout/force-light-chrome'
import { SearchPalette } from './_components/search-palette'
import './v2.css'

export const metadata: Metadata = {
  title: 'Yellow Jersey — The Cycling Marketplace',
  description:
    'Every bike, every store, one marketplace. Shop verified Australian bike stores and rider-to-rider listings, with one-hour Uber delivery on eligible items.',
  openGraph: {
    title: 'Yellow Jersey — The Cycling Marketplace',
    description:
      'Every bike, every store, one marketplace. New from verified bike stores, used from riders like you.',
    type: 'website',
  },
}

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return (
    <ForceLightChrome>
      <div className="min-h-dvh overflow-x-clip bg-white text-zinc-950 antialiased">
        {children}
        {/* ⌘K palette island — mounted once, listens globally */}
        <SearchPalette />
      </div>
    </ForceLightChrome>
  )
}
