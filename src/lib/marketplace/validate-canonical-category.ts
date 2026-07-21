import { createClient } from "@/lib/supabase/server";
import {
  resolveBikeTypeToCanonicalPath,
  resolveCanonicalPath,
  type CanonicalCategoryPath,
} from "@/lib/marketplace/canonical-taxonomy";

export type ValidatedCanonicalCategory = CanonicalCategoryPath & {
  marketplace_category_id: string | null;
};

/**
 * Resolve and optionally look up the taxonomy node id for a category path.
 * Accepts legacy simplified paths and bikeType shortcuts.
 */
export async function validateAndResolveCanonicalCategory(input: {
  marketplace_category?: string | null;
  marketplace_subcategory?: string | null;
  marketplace_level_3_category?: string | null;
  bikeType?: string | null;
  require?: boolean;
}): Promise<{ ok: true; value: ValidatedCanonicalCategory | null } | { ok: false; error: string }> {
  let path =
    resolveCanonicalPath(
      input.marketplace_category,
      input.marketplace_subcategory,
      input.marketplace_level_3_category,
    ) || resolveBikeTypeToCanonicalPath(input.bikeType);

  if (!path) {
    if (input.require) {
      return {
        ok: false,
        error: "A valid Yellow Jersey category and subcategory are required",
      };
    }
    return { ok: true, value: null };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("resolve_marketplace_category_id", {
      p_level1: path.level1,
      p_level2: path.level2,
      p_level3: path.level3,
    });

    if (error) {
      console.warn("[validate-canonical-category] RPC failed:", error.message);
      return {
        ok: true,
        value: {
          ...path,
          marketplace_category_id: null,
        },
      };
    }

    if (!data) {
      return {
        ok: false,
        error: `Category is not in the Yellow Jersey taxonomy: ${path.level1} > ${path.level2}`,
      };
    }

    return {
      ok: true,
      value: {
        ...path,
        marketplace_category_id: data as string,
      },
    };
  } catch (error) {
    console.warn("[validate-canonical-category] unexpected error:", error);
    return {
      ok: true,
      value: {
        ...path,
        marketplace_category_id: null,
      },
    };
  }
}
