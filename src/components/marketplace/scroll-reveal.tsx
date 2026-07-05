"use client";

import * as React from "react";

// ============================================================
// ScrollReveal — fade-and-rise cards in as they scroll into view
// ============================================================
// One shared IntersectionObserver for every card (cheap at any grid size).
// Reveals are CSS animations on opacity/transform only, so they run on the
// compositor. Elements already on screen when the component mounts are left
// untouched — no hide-then-show flash on first paint or hydration.

let sharedObserver: IntersectionObserver | null = null;
const pendingReveals = new Set<Element>();

function getObserver(): IntersectionObserver {
  if (sharedObserver) return sharedObserver;

  sharedObserver = new IntersectionObserver(
    (entries) => {
      // Reveal left-to-right, top-to-bottom when a whole row lands at once.
      const entering = entries
        .filter((entry) => entry.isIntersecting && pendingReveals.has(entry.target))
        .sort(
          (a, b) =>
            a.boundingClientRect.top - b.boundingClientRect.top ||
            a.boundingClientRect.left - b.boundingClientRect.left,
        );

      entering.forEach((entry, index) => {
        pendingReveals.delete(entry.target);
        sharedObserver?.unobserve(entry.target);
        playReveal(entry.target as HTMLElement, Math.min(index * 55, 275));
      });
    },
    // Start the reveal just before the card fully enters, so it never feels late.
    { rootMargin: "0px 0px -4% 0px", threshold: 0.01 },
  );

  return sharedObserver;
}

// Timestamp of the very first reveal effect — used to tell initial hydration
// apart from later mounts (load-more pages, tab switches). Hiding content that
// is already painted at hydration time would flash, so we never animate it.
let firstMountAt: number | null = null;

// Batched stagger for cards that mount already inside the viewport.
let immediateBatchIndex = 0;
let immediateBatchScheduled = false;

function nextImmediateDelay(): number {
  if (!immediateBatchScheduled) {
    immediateBatchScheduled = true;
    queueMicrotask(() => {
      immediateBatchIndex = 0;
      immediateBatchScheduled = false;
    });
  }
  return Math.min(immediateBatchIndex++ * 45, 270);
}

function playReveal(el: HTMLElement, delayMs: number) {
  el.style.animationDelay = `${delayMs}ms`;
  el.classList.remove("scroll-reveal-pending");
  el.classList.add("scroll-reveal-in");
  el.addEventListener(
    "animationend",
    () => {
      el.classList.remove("scroll-reveal-in");
      el.style.animationDelay = "";
    },
    { once: true },
  );
}

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  /** Skip the scroll animation (e.g. the element has its own entrance animation). */
  disabled?: boolean;
}

export function ScrollReveal({ children, className, disabled = false }: ScrollRevealProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    if (firstMountAt === null) firstMountAt = performance.now();

    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight) {
      // Element mounted already in view. During initial hydration leave it
      // alone (it may already be painted); on later mounts — load more, tab
      // switches — give it the same fade-in so new content never just pops.
      if (performance.now() - firstMountAt > 1200 && rect.bottom > 0) {
        el.classList.add("scroll-reveal-pending");
        playReveal(el, nextImmediateDelay());
      }
      return;
    }

    el.classList.add("scroll-reveal-pending");
    pendingReveals.add(el);
    getObserver().observe(el);

    return () => {
      pendingReveals.delete(el);
      sharedObserver?.unobserve(el);
      el.classList.remove("scroll-reveal-pending", "scroll-reveal-in");
      el.style.animationDelay = "";
    };
  }, [disabled]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
