/**
 * Unit checks for similar-products kind inference, category normalisation,
 * compatibility gates, and rule scoring (pure logic, no DB / OpenAI).
 *
 * Run: npx tsx scripts/test-llm-similar-products.ts
 */
import {
  brandsMatch,
  categoriesMatch,
  categoryQueryValues,
  inferProductKind,
  isCompatibleSimilarCandidate,
  normaliseMarketplaceCategory,
  resolveEffectiveBrand,
  scoreSimilarProductsRuleBased,
  type SimilarProductSource,
} from "../src/lib/marketplace/llm-similar-products";
import type { PublicMarketplaceCardRow } from "../src/lib/marketplace/public-card-feed";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function source(over: Partial<SimilarProductSource> & Pick<SimilarProductSource, "id">): SimilarProductSource {
  return {
    display_name: null,
    description: null,
    brand: null,
    price: null,
    marketplace_category: null,
    marketplace_subcategory: null,
    marketplace_level_3_category: null,
    model_year: null,
    condition_rating: null,
    ...over,
  };
}

function card(
  over: Partial<PublicMarketplaceCardRow> & Pick<PublicMarketplaceCardRow, "id">,
): PublicMarketplaceCardRow {
  return {
    canonical_product_id: null,
    resolved_image_id: "img",
    resolved_image_source: null,
    resolved_external_url: null,
    resolved_cloudinary_url: null,
    resolved_cloudinary_public_id: null,
    display_name: null,
    description: null,
    price: 1000,
    discount_percent: null,
    discount_active: null,
    discount_ends_at: null,
    sale_price: null,
    marketplace_category: "Bicycles",
    marketplace_subcategory: "Road",
    marketplace_level_3_category: null,
    category_name: null,
    qoh: 1,
    created_at: "2026-01-01T00:00:00Z",
    user_id: "u1",
    brand: null,
    listing_type: null,
    listing_source: null,
    listing_status: null,
    uber_delivery_enabled: null,
    model_year: null,
    condition_rating: null,
    pickup_location: null,
    store_name: "Store",
    store_logo_url: null,
    store_account_type: null,
    store_bicycle_store: true,
    first_name: null,
    last_name: null,
    is_verified_bike_store: true,
    ...over,
  };
}

console.log("Category normalisation:");
check("Bikes → Bicycles", normaliseMarketplaceCategory("Bikes") === "Bicycles");
check("bikes → Bicycles", normaliseMarketplaceCategory("bikes") === "Bicycles");
check("Bicycles stays", normaliseMarketplaceCategory("Bicycles") === "Bicycles");
check("Apparel stays", normaliseMarketplaceCategory("Apparel") === "Apparel");
check("null stays null", normaliseMarketplaceCategory(null) === null);
check(
  "query values include both bike labels",
  JSON.stringify(categoryQueryValues("Bikes")) === JSON.stringify(["Bicycles", "Bikes"]),
);
check("Bikes matches Bicycles", categoriesMatch("Bikes", "Bicycles"));
check("Apparel does not match Bicycles", !categoriesMatch("Apparel", "Bicycles"));

console.log("\nKind inference (bikes must not become groupset/wheel):");
check(
  "Bicycles category → bike even with Shimano in title",
  inferProductKind(
    source({
      id: "1",
      display_name: "Specialized Tarmac SL7 Shimano Ultegra Di2 Road Bike",
      marketplace_category: "Bicycles",
      marketplace_subcategory: "Road",
    }),
  ) === "bike",
);
check(
  "Bikes legacy category → bike",
  inferProductKind(
    source({
      id: "2",
      display_name: "Giant TCR Advanced Pro Disc SRAM Force",
      marketplace_category: "Bikes",
      marketplace_subcategory: "Road",
    }),
  ) === "bike",
);
check(
  "title with Shimano + bike word → bike (no category)",
  inferProductKind(
    source({
      id: "3",
      display_name: "Specialized Tarmac SL7 Shimano Ultegra Di2 Road Bike",
    }),
  ) === "bike",
);
check(
  "SRAM Force bike title → bike",
  inferProductKind(
    source({
      id: "4",
      display_name: "Giant TCR Advanced Pro Disc SRAM Force Road Bike",
    }),
  ) === "bike",
);
check(
  "actual groupset → drivetrain",
  inferProductKind(
    source({
      id: "5",
      display_name: "Shimano Ultegra R8100 Groupset",
      marketplace_category: "Parts",
      marketplace_subcategory: "Drivetrain",
    }),
  ) === "drivetrain",
);
check(
  "wheelset title → wheel",
  inferProductKind(
    source({
      id: "6",
      display_name: "Bontrager Aeolus Pro 37 Wheelset",
      marketplace_category: "Parts",
      marketplace_subcategory: "Wheels",
    }),
  ) === "wheel",
);
check(
  "frameset → frame",
  inferProductKind(
    source({
      id: "7",
      display_name: "Cervelo S5 Frameset",
      marketplace_category: "Parts",
      marketplace_subcategory: "Frames",
    }),
  ) === "frame",
);
check(
  "Helmets subcategory → helmet",
  inferProductKind(
    source({
      id: "8",
      display_name: "S-Works Evade",
      marketplace_category: "Apparel",
      marketplace_subcategory: "Helmets",
    }),
  ) === "helmet",
);
check(
  "Road subcategory without category → bike",
  inferProductKind(
    source({
      id: "9",
      display_name: "Canyon Ultimate CF SLX 8 Di2",
      marketplace_subcategory: "Road",
    }),
  ) === "bike",
);
check(
  "tyre product → wheel",
  inferProductKind(
    source({
      id: "10",
      display_name: "Continental Grand Prix 5000 Tyre",
      marketplace_category: "Parts",
    }),
  ) === "wheel",
);
check(
  "uncategorised chamois cream → care",
  inferProductKind(
    source({
      id: "11",
      display_name: "Muc-Off Women's Chamois Cream 100ml",
    }),
  ) === "care",
);
check(
  "bike_type must not override cream title",
  inferProductKind(
    source({
      id: "12",
      display_name: "Muc-Off Women's Chamois Cream 100ml",
      bike_type: "Road",
    }),
  ) === "care",
);
check(
  "hand sanitiser → care",
  inferProductKind(
    source({
      id: "13",
      display_name: "Muc-Off Antibacterial Hand Sanitiser 120ml",
      brand: "Muc-Off",
    }),
  ) === "care",
);
check(
  "sealant remover → cleaning",
  inferProductKind(
    source({
      id: "14",
      display_name: "Muc-Off Glue & Sealant Remover 200ml",
      brand: "Muc-Off",
    }),
  ) === "cleaning",
);

console.log("\nBrand resolution:");
check(
  "title brand when brand field null",
  resolveEffectiveBrand(
    source({ id: "b1", display_name: "Muc-Off Women's Chamois Cream 100ml" }),
  ) === "Muc-Off",
);
check(
  "brand field wins",
  resolveEffectiveBrand(
    source({
      id: "b2",
      display_name: "Women's Chamois Cream 100ml",
      brand: "Muc-Off",
    }),
  ) === "Muc-Off",
);
check(
  "brandsMatch title contains brand",
  brandsMatch("Muc-Off", null, "Muc-Off Rim Stix Tyre Lever Pair"),
);
{
  const roadBike = source({
    id: "src",
    display_name: "Specialized Tarmac SL7 Shimano Ultegra Road Bike",
    marketplace_category: "Bicycles",
    marketplace_subcategory: "Road",
    price: 8000,
  });

  check(
    "same subcategory bike accepted (strict)",
    isCompatibleSimilarCandidate(
      roadBike,
      card({
        id: "a",
        display_name: "Trek Emonda SL 6",
        marketplace_category: "Bicycles",
        marketplace_subcategory: "Road",
      }),
      "strict",
    ),
  );

  check(
    "Bikes-labelled candidate matches Bicycles source",
    isCompatibleSimilarCandidate(
      roadBike,
      card({
        id: "b",
        display_name: "Canyon Ultimate CF SLX",
        marketplace_category: "Bikes",
        marketplace_subcategory: "Road",
      }),
      "strict",
    ),
  );

  check(
    "MTB still compatible as bike kind across subcategory (strict)",
    isCompatibleSimilarCandidate(
      roadBike,
      card({
        id: "c",
        display_name: "Santa Cruz Hightower Mountain Bike",
        marketplace_category: "Bicycles",
        marketplace_subcategory: "Mountain",
      }),
      "strict",
    ),
  );

  check(
    "apparel rejected for bike source (strict)",
    !isCompatibleSimilarCandidate(
      roadBike,
      card({
        id: "d",
        display_name: "Rapha Core Jersey",
        marketplace_category: "Apparel",
        marketplace_subcategory: "Jerseys",
      }),
      "strict",
    ),
  );

  check(
    "automotive title blocked",
    !isCompatibleSimilarCandidate(
      roadBike,
      card({
        id: "e",
        display_name: "BMW brake pad kit",
        marketplace_category: "Bicycles",
        marketplace_subcategory: "Road",
      }),
      "relaxed",
    ),
  );

  const helmet = source({
    id: "helm",
    display_name: "Giro Aether MIPS Helmet",
    marketplace_category: "Apparel",
    marketplace_subcategory: "Helmets",
  });

  check(
    "jersey rejected for helmet source (strict)",
    !isCompatibleSimilarCandidate(
      helmet,
      card({
        id: "f",
        display_name: "Rapha Core Jersey",
        marketplace_category: "Apparel",
        marketplace_subcategory: "Jerseys",
      }),
      "strict",
    ),
  );

  check(
    "other helmet accepted",
    isCompatibleSimilarCandidate(
      helmet,
      card({
        id: "g",
        display_name: "Specialized Evade 3",
        marketplace_category: "Apparel",
        marketplace_subcategory: "Helmets",
      }),
      "strict",
    ),
  );

  const cream = source({
    id: "cream",
    display_name: "Muc-Off Women's Chamois Cream 100ml",
  });

  check(
    "bike rejected for uncategorised cream (relaxed)",
    !isCompatibleSimilarCandidate(
      cream,
      card({
        id: "bike-x",
        display_name: "Trek Domane AL 2",
        marketplace_category: "Bicycles",
        marketplace_subcategory: "Road",
      }),
      "relaxed",
    ),
  );

  check(
    "other chamois cream accepted for cream source (strict)",
    isCompatibleSimilarCandidate(
      cream,
      card({
        id: "cream-2",
        display_name: "Chapeau Menthol Chamois Cream",
        marketplace_category: null,
        marketplace_subcategory: null,
      }),
      "strict",
    ),
  );

  check(
    "helmet rejected for cream source (strict)",
    !isCompatibleSimilarCandidate(
      cream,
      card({
        id: "helm-x",
        display_name: "Giro Aether MIPS Helmet",
        marketplace_category: "Accessories",
        marketplace_subcategory: "Helmets",
      }),
      "strict",
    ),
  );

  check(
    "same-brand sanitiser accepted via brand mode",
    isCompatibleSimilarCandidate(
      cream,
      card({
        id: "sanitiser",
        display_name: "Muc-Off Antibacterial Hand Sanitiser 120ml",
        brand: "Muc-Off",
        marketplace_category: null,
        marketplace_subcategory: null,
      }),
      "brand",
    ),
  );

  check(
    "same-brand cleaning in care family",
    isCompatibleSimilarCandidate(
      { ...cream, brand: "Muc-Off" },
      card({
        id: "remover",
        display_name: "Muc-Off Glue & Sealant Remover 200ml",
        brand: "Muc-Off",
        marketplace_category: null,
        marketplace_subcategory: null,
      }),
      "family",
    ),
  );

  check(
    "bike still rejected for cream even in brand mode",
    !isCompatibleSimilarCandidate(
      { ...cream, brand: "Muc-Off" },
      card({
        id: "bike-brand",
        display_name: "Muc-Off branded display bike",
        brand: "Muc-Off",
        marketplace_category: "Bicycles",
        marketplace_subcategory: "Road",
      }),
      "brand",
    ),
  );
}

console.log("\nRule scoring:");
{
  const roadBike = source({
    id: "src",
    display_name: "Specialized Tarmac SL7",
    brand: "Specialized",
    marketplace_category: "Bicycles",
    marketplace_subcategory: "Road",
    price: 8000,
  });

  const candidates = [
    card({
      id: "near",
      display_name: "Specialized Roubaix Sport",
      brand: "Specialized",
      marketplace_category: "Bicycles",
      marketplace_subcategory: "Road",
      price: 7500,
      created_at: "2026-02-01T00:00:00Z",
    }),
    card({
      id: "far-price",
      display_name: "Kids balance bicycle",
      brand: "Generic",
      marketplace_category: "Bicycles",
      marketplace_subcategory: "Kids",
      price: 150,
      created_at: "2026-03-01T00:00:00Z",
    }),
    card({
      id: "mtb",
      display_name: "Trek Fuel EX Mountain Bike",
      brand: "Trek",
      marketplace_category: "Bikes",
      marketplace_subcategory: "Mountain",
      price: 7200,
      created_at: "2026-02-15T00:00:00Z",
    }),
  ];

  const ranked = scoreSimilarProductsRuleBased(roadBike, candidates, 12);
  check("returns results", ranked.length >= 2, `got ${ranked.length}`);
  check("same brand/subcategory ranks first", ranked[0]?.id === "near", `got ${ranked[0]?.id}`);
  check(
    "includes Bikes-labelled MTB via category normalisation",
    ranked.some((p) => p.id === "mtb"),
  );
  check(
    "kids bike ranks below road peers or is last",
    ranked[0]?.id !== "far-price",
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
