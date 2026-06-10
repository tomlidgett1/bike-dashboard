'use client'

import * as React from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================================
// Horizontal scroll rail. The only client logic is the arrow
// buttons + edge state — the cards themselves are passed in as
// server-rendered children, so rail content costs zero JS.
// ============================================================

interface RailProps {
  children: React.ReactNode
  ariaLabel: string
  className?: string
}

export function Rail({ children, ariaLabel, className }: RailProps) {
  const scrollerRef = React.useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = React.useState(true)
  const [atEnd, setAtEnd] = React.useState(false)
  const [overflows, setOverflows] = React.useState(false)

  const updateEdges = React.useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setOverflows(max > 8)
    setAtStart(el.scrollLeft <= 4)
    setAtEnd(el.scrollLeft >= max - 4)
  }, [])

  React.useEffect(() => {
    updateEdges()
    const el = scrollerRef.current
    if (!el) return
    const observer = new ResizeObserver(updateEdges)
    observer.observe(el)
    return () => observer.disconnect()
  }, [updateEdges])

  const scrollBy = (direction: 1 | -1) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: 'smooth' })
  }

  return (
    <div className={cn('group/rail relative', className)}>
      <div
        ref={scrollerRef}
        role="list"
        aria-label={ariaLabel}
        onScroll={updateEdges}
        className="v2-no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-1 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:-mx-10 lg:scroll-px-10 lg:px-10"
      >
        {children}
      </div>

      {/* Edge fades — only when scrollable in that direction */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 -left-1 w-12 bg-gradient-to-r from-white to-transparent transition-opacity duration-300 max-lg:hidden',
          atStart ? 'opacity-0' : 'opacity-100',
        )}
      />
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 -right-1 w-12 bg-gradient-to-l from-white to-transparent transition-opacity duration-300 max-lg:hidden',
          atEnd ? 'opacity-0' : 'opacity-100',
        )}
      />

      {overflows && (
        <>
          <button
            type="button"
            aria-label="Scroll back"
            onClick={() => scrollBy(-1)}
            disabled={atStart}
            className={cn(
              'absolute -left-4 top-[38%] z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-zinc-900 shadow-lg ring-1 ring-black/10 transition-all hover:scale-105 hover:bg-zinc-50 disabled:pointer-events-none disabled:opacity-0 lg:flex',
              'opacity-0 group-hover/rail:opacity-100 focus-visible:opacity-100',
            )}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Scroll forward"
            onClick={() => scrollBy(1)}
            disabled={atEnd}
            className={cn(
              'absolute -right-4 top-[38%] z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-zinc-900 shadow-lg ring-1 ring-black/10 transition-all hover:scale-105 hover:bg-zinc-50 disabled:pointer-events-none disabled:opacity-0 lg:flex',
              'opacity-0 group-hover/rail:opacity-100 focus-visible:opacity-100',
            )}
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  )
}

/** Fixed-width snap item for rails. */
export function RailItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="listitem" className={cn('w-[46vw] shrink-0 snap-start sm:w-[220px] lg:w-[236px]', className)}>
      {children}
    </div>
  )
}
