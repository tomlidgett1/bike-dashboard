import type { ListingFormData, ConditionRating, ItemType } from "@/lib/types/listing";

// ============================================================
// Facebook Marketplace Data Mapper
// ============================================================
// Converts scraped Facebook Marketplace data to Yellow Jersey listing format

export interface FacebookScrapedData {
  title: string;
  price: number;
  currency: string;
  description: string;
  location: string;
  condition: string | null;
  category: string | null;
  images: string[];
}

/**
 * Maps Facebook condition text to Yellow Jersey ConditionRating enum
 */
function mapCondition(fbCondition: string | null): ConditionRating | undefined {
  if (!fbCondition) return undefined;

  const condition = fbCondition.toLowerCase().trim();

  if (condition.includes("new") || condition === "brand new") {
    return "New";
  }
  if (condition.includes("like new") || condition.includes("likenew")) {
    return "Like New";
  }
  if (condition.includes("excellent")) {
    return "Excellent";
  }
  if (condition.includes("good") || condition === "used - good") {
    return "Good";
  }
  if (condition.includes("fair") || condition === "used - fair") {
    return "Fair";
  }
  if (condition.includes("well used") || condition.includes("heavily used")) {
    return "Well Used";
  }

  // Default to Good if we can't determine
  return "Good";
}

/**
 * Detects item type from title, description, and category
 */
function detectItemType(
  title: string,
  description: string,
  category: string | null
): ItemType {
  const searchText = `${title} ${description} ${category || ""}`.toLowerCase();

  // Check for bike indicators
  const bikeKeywords = [
    "bike",
    "bicycle",
    "road bike",
    "mountain bike",
    "mtb",
    "gravel bike",
    "cyclocross",
    "bmx",
    "e-bike",
    "electric bike",
  ];

  // Check for apparel indicators
  const apparelKeywords = [
    "jersey",
    "shirt",
    "shorts",
    "bib",
    "jacket",
    "gloves",
    "shoes",
    "helmet",
    "socks",
    "cycling kit",
    "apparel",
    "clothing",
  ];

  // Count matches
  const bikeMatches = bikeKeywords.filter((kw) => searchText.includes(kw)).length;
  const apparelMatches = apparelKeywords.filter((kw) => searchText.includes(kw)).length;

  if (bikeMatches > apparelMatches && bikeMatches > 0) {
    return "bike";
  }
  if (apparelMatches > 0) {
    return "apparel";
  }

  // Default to part if unclear
  return "part";
}

/**
 * Extracts brand from title or description
 */
function extractBrand(title: string, description: string): string | undefined {
  const commonBrands = [
    "Giant",
    "Trek",
    "Specialized",
    "Cannondale",
    "Scott",
    "Cervelo",
    "Pinarello",
    "Bianchi",
    "Merida",
    "Canyon",
    "BMC",
    "Colnago",
    "Santa Cruz",
    "Yeti",
    "Pivot",
    "Ibis",
    "Orbea",
    "Ridley",
    "Focus",
    "Fuji",
    "Norco",
    "Kona",
    "Marin",
    "GT",
    "Cube",
    "Ghost",
    "Lapierre",
    "Look",
    "Wilier",
    "De Rosa",
    "Argon 18",
    "Felt",
    "Raleigh",
    "Diamondback",
    "Mongoose",
    "Schwinn",
  ];

  const searchText = `${title} ${description}`;

  for (const brand of commonBrands) {
    const regex = new RegExp(`\\b${brand}\\b`, "i");
    if (regex.test(searchText)) {
      return brand;
    }
  }

  return undefined;
}

/**
 * Extracts model year from title or description
 */
function extractModelYear(title: string, description: string): string | undefined {
  const currentYear = new Date().getFullYear();
  const searchText = `${title} ${description}`;

  // Look for 4-digit years between 1990 and current year + 1
  const yearRegex = /\b(19[9]\d|20[0-2]\d)\b/g;
  const matches = searchText.match(yearRegex);

  if (matches && matches.length > 0) {
    // Get the most recent year found
    const years = matches.map((y) => parseInt(y)).filter((y) => y >= 1990 && y <= currentYear + 1);
    if (years.length > 0) {
      return Math.max(...years).toString();
    }
  }

  return undefined;
}

/**
 * Convert currency to AUD (simplified - in production, use an API)
 */
function convertToAUD(amount: number, currency: string): number {
  // Simplified conversion rates (in production, use real-time API)
  const rates: Record<string, number> = {
    AUD: 1,
    USD: 1.52,
    EUR: 1.65,
    GBP: 1.93,
    NZD: 0.93,
    CAD: 1.09,
  };

  const rate = rates[currency.toUpperCase()] || 1;
  return Math.round(amount * rate);
}

/**
 * Main mapper function: Facebook data → Yellow Jersey listing format
 */
export function mapFacebookToListing(
  fbData: FacebookScrapedData,
  facebookUrl: string
): Partial<ListingFormData> {
  const itemType = detectItemType(fbData.title, fbData.description, fbData.category);
  const brand = extractBrand(fbData.title, fbData.description);
  const modelYear = extractModelYear(fbData.title, fbData.description);

  // Convert price to AUD if needed
  const priceAUD = fbData.currency !== "AUD" 
    ? convertToAUD(fbData.price, fbData.currency)
    : fbData.price;

  const mappedData: Partial<ListingFormData> = {
    itemType,
    title: fbData.title, // This becomes the 'description' field in DB (display name)
    brand,
    modelYear,
    // Store the full Facebook description in conditionDetails
    conditionDetails: fbData.description,
    price: priceAUD > 0 ? priceAUD : undefined, // Only set price if it's valid
    conditionRating: mapCondition(fbData.condition),
    pickupLocation: fbData.location,
    facebook_source_url: facebookUrl,
    
    // Set defaults for required fields
    listingStatus: "draft",
  };

  // Set category based on item type
  if (itemType === "bike") {
    mappedData.marketplace_category = "Bicycles";
  } else if (itemType === "part") {
    mappedData.marketplace_category = "Parts";
  } else if (itemType === "apparel") {
    mappedData.marketplace_category = "Apparel";
  }

  return mappedData;
}

/**
 * Validates that minimum required fields are present
 * Note: Price is optional as user can fill it in later
 */
export function validateFacebookData(fbData: FacebookScrapedData): {
  isValid: boolean;
  missingFields: string[];
} {
  const missingFields: string[] = [];

  if (!fbData.title || fbData.title.trim() === "") {
    missingFields.push("title");
  }
  // Price is optional - user can add it later in the form
  // Some listings might be free or "price on request"
  
  if (!fbData.images || fbData.images.length === 0) {
    missingFields.push("images");
  }

  return {
    isValid: missingFields.length === 0,
    missingFields,
  };
}

