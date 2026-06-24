import { StoreProfileSkeleton } from "@/components/marketplace/store-profile/store-profile-skeleton";

// Instant route-level skeleton for a storefront. Mirrors StoreProfileChrome and
// the default Home tab so navigation feels continuous instead of layout-shifting.
export default function StoreLoading() {
  return <StoreProfileSkeleton />;
}
