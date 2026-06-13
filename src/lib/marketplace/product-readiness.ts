import { isApprovedImage, type ResolvableProductImage } from '@/lib/services/image-resolver';

/** Matches marketplace_ready_products eligibility rules */
export type MarketplaceReadinessBlockerId =
  | 'inactive'
  | 'listing_status'
  | 'out_of_stock'
  | 'no_approved_image';

export interface MarketplaceReadinessBlocker {
  id: MarketplaceReadinessBlockerId;
  label: string;
  action: string;
}

export interface MarketplaceReadiness {
  isLive: boolean;
  blockers: MarketplaceReadinessBlocker[];
}

export interface MarketplaceReadinessInput {
  is_active: boolean;
  listing_status: string | null;
  listing_type: string | null;
  qoh: number | null;
  hasApprovedImage?: boolean | null;
  selected_product_image_id?: string | null;
  productImages?: ResolvableProductImage[] | null;
  canonicalImages?: ResolvableProductImage[] | null;
}

function isApproved(img: ResolvableProductImage): boolean {
  return isApprovedImage(img);
}

/** Mirrors resolved_image_id logic in marketplace_ready_products */
export function resolveMarketplaceImageId(input: MarketplaceReadinessInput): string | null {
  const productImages = input.productImages ?? [];
  const canonicalImages = input.canonicalImages ?? [];
  const selectedId = input.selected_product_image_id;

  if (selectedId) {
    const selected = [...productImages, ...canonicalImages].find(
      (img) => img.id === selectedId && isApproved(img)
    );
    if (selected?.id) return selected.id;
  }

  const approvedProduct = productImages.filter(isApproved);
  if (approvedProduct.length > 0) {
    const primary =
      approvedProduct.find((img) => img.is_primary) ??
      [...approvedProduct].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      )[0];
    if (primary?.id) return primary.id;
  }

  const approvedCanonical = canonicalImages.filter(isApproved);
  const canonicalPrimary = approvedCanonical.find((img) => img.is_primary);
  if (canonicalPrimary?.id) return canonicalPrimary.id;

  if (approvedCanonical.length > 0) {
    const first = [...approvedCanonical].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    )[0];
    if (first?.id) return first.id;
  }

  return null;
}

function passesStockRule(listingType: string | null, qoh: number | null): boolean {
  if (listingType === 'private_listing' || listingType === 'store_inventory') {
    return true;
  }
  return (qoh ?? 0) > 0;
}

function listingStatusBlocker(status: string): MarketplaceReadinessBlocker {
  const normalised = status.toLowerCase();
  const labels: Record<string, { label: string; action: string }> = {
    sold: {
      label: 'Marked as sold',
      action: 'Reactivate the listing or remove sold status',
    },
    draft: {
      label: 'Draft listing',
      action: 'Publish the listing as active',
    },
    expired: {
      label: 'Listing expired',
      action: 'Renew or set listing status to active',
    },
    archived: {
      label: 'Listing archived',
      action: 'Restore the listing to active',
    },
  };
  const known = labels[normalised];
  return {
    id: 'listing_status',
    label: known?.label ?? `Listing status: ${status}`,
    action: known?.action ?? 'Set listing status to active',
  };
}

export function getMarketplaceReadiness(
  input: MarketplaceReadinessInput
): MarketplaceReadiness {
  const blockers: MarketplaceReadinessBlocker[] = [];

  if (!input.is_active) {
    blockers.push({
      id: 'inactive',
      label: 'Inactive',
      action: 'Turn on Active in the Status column',
    });
  }

  if (
    input.listing_status != null &&
    input.listing_status !== '' &&
    input.listing_status !== 'active'
  ) {
    blockers.push(listingStatusBlocker(input.listing_status));
  }

  if (!passesStockRule(input.listing_type, input.qoh)) {
    blockers.push({
      id: 'out_of_stock',
      label: 'Out of stock',
      action:
        'Sync stock from Lightspeed or ensure quantity on hand is greater than zero',
    });
  }

  const hasApprovedImage =
    input.hasApprovedImage ?? Boolean(resolveMarketplaceImageId(input));

  if (!hasApprovedImage) {
    blockers.push({
      id: 'no_approved_image',
      label: 'No approved image',
      action: 'Add images and approve a primary image (Images action)',
    });
  }

  return {
    isLive: blockers.length === 0,
    blockers,
  };
}
