/**
 * Floating card page layout — canonical spacing + class tokens for full-height
 * dashboard pages (Products blueprint). Import components from
 * `@/components/layout/floating-card-page`.
 *
 * Vertical rhythm: top inset (`!pt-2.5`) must match the gap before the card
 * (`!mt-2.5`). Never use `!p-0` on the page shell — it zeroes top padding.
 */

/** Full viewport column below the dashboard header (hidden topbar routes). */
export const floatingCardPageViewportClass =
  "flex h-[calc(100svh-3.5rem)] min-h-0 flex-col";

/** Clears default PageContainer padding except top inset. */
export const floatingCardPageContainerResetClass = "!px-0 !pb-0";

/** Space from page top to header row (matches header-to-card gap). */
export const floatingCardPageTopInsetClass = "!pt-2.5";

/** Space between sticky header and floating card (matches top inset). */
export const floatingCardPageHeaderToCardGapClass = "!mt-2.5";

/** Horizontal rhythm for sticky header chrome (matches Actions). */
export const floatingCardPageChromeClass = "px-2 sm:px-3 lg:px-4";

/** Sub-pixel nudge aligned with page title/actions row. */
export const floatingCardPageHeaderNudgeClass = "px-0.5";

/**
 * Edge-to-edge table/content shell. `-ml-px` overlaps the sidebar seam so the
 * top-left radius + border render cleanly.
 */
export const floatingCardPageCardClass =
  "relative z-[1] -ml-px flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-xl border border-gray-200 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)]";

/** Marketplace homepage card — same shell as dashboard, without sidebar seam overlap. */
export const marketplaceHomeCardClass =
  "relative z-[1] flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-xl border border-gray-200 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)]";

/** @deprecated Use `floatingCardPageContainerResetClass` */
export const productsPageContainerResetClass = floatingCardPageContainerResetClass;

/** @deprecated Use `floatingCardPageTopInsetClass` */
export const productsPageTopInsetClass = floatingCardPageTopInsetClass;

/** @deprecated Use `floatingCardPageHeaderToCardGapClass` */
export const productsPageHeaderToCardGapClass = floatingCardPageHeaderToCardGapClass;

/** @deprecated Use `floatingCardPageCardClass` */
export const productsFloatingCardClass = floatingCardPageCardClass;
