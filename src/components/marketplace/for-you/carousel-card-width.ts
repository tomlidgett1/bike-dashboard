/** Shared horizontal carousel card width — keep skeleton + live cards in sync. */
export const FOR_YOU_CAROUSEL_CARD_WIDTH =
  "w-[160px] sm:w-[180px] md:w-[200px] lg:w-[220px]";

/** Collapsed carousel peek — enough to hint scroll without showing the whole row. */
export const FOR_YOU_CAROUSEL_COLLAPSED_COUNT = 8;

/** Expanded grid — matches marketplace browse tab when embedded. */
export const forYouExpandedGridClass = (embedded: boolean) =>
  embedded
    ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-0.5 sm:gap-3"
    : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4";
