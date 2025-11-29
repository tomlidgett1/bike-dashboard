// ============================================================
// Category Mapping Utilities
// Maps Lightspeed categories to marketplace categories
// ============================================================

import type { MarketplaceCategory } from '@/lib/types/marketplace';

interface CategoryMapping {
  category: MarketplaceCategory;
  subcategory: string;
}

/**
 * Maps a Lightspeed category name and path to a marketplace category
 * This is a client-side version of the SQL function for UI purposes
 */
export function mapToMarketplaceCategory(
  lightspeedCategory: string | null,
  lightspeedPath: string | null
): CategoryMapping {
  const catLower = (lightspeedCategory || '').toLowerCase();
  const pathLower = (lightspeedPath || '').toLowerCase();

  // Bicycles Category
  if (
    /bike|bicycle|cycle/.test(catLower) ||
    /bike|bicycle|cycle/.test(pathLower)
  ) {
    let subcategory = 'Other';

    if (/road/.test(catLower) || /road/.test(pathLower)) {
      subcategory = 'Road';
    } else if (/mountain|mtb/.test(catLower) || /mountain|mtb/.test(pathLower)) {
      subcategory = 'Mountain';
    } else if (/hybrid|commut/.test(catLower) || /hybrid|commut/.test(pathLower)) {
      subcategory = 'Hybrid';
    } else if (
      /electric|e-bike|ebike/.test(catLower) ||
      /electric|e-bike|ebike/.test(pathLower)
    ) {
      subcategory = 'Electric';
    } else if (/kid|child|youth/.test(catLower) || /kid|child|youth/.test(pathLower)) {
      subcategory = 'Kids';
    } else if (/bmx/.test(catLower) || /bmx/.test(pathLower)) {
      subcategory = 'BMX';
    } else if (/cruiser|beach/.test(catLower) || /cruiser|beach/.test(pathLower)) {
      subcategory = 'Cruiser';
    }

    return { category: 'Bicycles', subcategory };
  }

  // Parts Category
  if (
    /part|component|accessory/.test(catLower) ||
    /part|component/.test(pathLower)
  ) {
    let subcategory = 'Other';

    if (/frame/.test(catLower) || /frame/.test(pathLower)) {
      subcategory = 'Frames';
    } else if (
      /wheel|rim|tire|tyre/.test(catLower) ||
      /wheel|rim|tire|tyre/.test(pathLower)
    ) {
      subcategory = 'Wheels';
    } else if (
      /drivetrain|chain|cassette|derailleur|shifter/.test(catLower) ||
      /drivetrain|chain|cassette|derailleur/.test(pathLower)
    ) {
      subcategory = 'Drivetrain';
    } else if (/brake/.test(catLower) || /brake/.test(pathLower)) {
      subcategory = 'Brakes';
    } else if (
      /handlebar|stem|grip/.test(catLower) ||
      /handlebar|stem|grip/.test(pathLower)
    ) {
      subcategory = 'Handlebars';
    } else if (/saddle|seat/.test(catLower) || /saddle|seat/.test(pathLower)) {
      subcategory = 'Saddles';
    } else if (/pedal/.test(catLower) || /pedal/.test(pathLower)) {
      subcategory = 'Pedals';
    }

    return { category: 'Parts', subcategory };
  }

  // Apparel Category
  if (
    /apparel|clothing|wear|jersey|short|jacket|glove|shoe|helmet/.test(catLower) ||
    /apparel|clothing|wear/.test(pathLower)
  ) {
    let subcategory = 'Other';

    if (/jersey|shirt|top/.test(catLower) || /jersey|shirt|top/.test(pathLower)) {
      subcategory = 'Jerseys';
    } else if (
      /short|pant|tight|bib/.test(catLower) ||
      /short|pant|tight|bib/.test(pathLower)
    ) {
      subcategory = 'Shorts';
    } else if (
      /jacket|coat|vest|windbreaker/.test(catLower) ||
      /jacket|coat|vest/.test(pathLower)
    ) {
      subcategory = 'Jackets';
    } else if (/glove/.test(catLower) || /glove/.test(pathLower)) {
      subcategory = 'Gloves';
    } else if (
      /shoe|cleat|footwear/.test(catLower) ||
      /shoe|cleat|footwear/.test(pathLower)
    ) {
      subcategory = 'Shoes';
    } else if (/helmet/.test(catLower) || /helmet/.test(pathLower)) {
      subcategory = 'Helmets';
    }

    return { category: 'Apparel', subcategory };
  }

  // Nutrition Category
  if (
    /nutrition|food|drink|supplement|energy|gel|bar/.test(catLower) ||
    /nutrition|food|drink|supplement/.test(pathLower)
  ) {
    let subcategory = 'Other';

    if (/bar/.test(catLower) || /bar/.test(pathLower)) {
      subcategory = 'Energy Bars';
    } else if (/gel/.test(catLower) || /gel/.test(pathLower)) {
      subcategory = 'Gels';
    } else if (
      /drink|beverage|hydration/.test(catLower) ||
      /drink|beverage|hydration/.test(pathLower)
    ) {
      subcategory = 'Drinks';
    } else if (
      /supplement|vitamin|protein/.test(catLower) ||
      /supplement|vitamin|protein/.test(pathLower)
    ) {
      subcategory = 'Supplements';
    }

    return { category: 'Nutrition', subcategory };
  }

  // Default fallback
  return { category: 'Parts', subcategory: 'Other' };
}

/**
 * Gets an icon name for a category (for use with lucide-react)
 */
export function getCategoryIcon(category: MarketplaceCategory): string {
  const icons: Record<MarketplaceCategory, string> = {
    Bicycles: 'Bike',
    Parts: 'Settings',
    Apparel: 'Shirt',
    Nutrition: 'Apple',
  };

  return icons[category] || 'Package';
}

/**
 * Gets a color class for a category badge
 */
export function getCategoryColor(category: MarketplaceCategory): string {
  const colors: Record<MarketplaceCategory, string> = {
    Bicycles: 'bg-blue-50 text-blue-700 border-blue-200',
    Parts: 'bg-gray-50 text-gray-700 border-gray-200',
    Apparel: 'bg-purple-50 text-purple-700 border-purple-200',
    Nutrition: 'bg-green-50 text-green-700 border-green-200',
  };

  return colors[category] || 'bg-gray-50 text-gray-700 border-gray-200';
}





