/**
 * CRM product search — Lightspeed-synced catalogue for campaign item picker.
 *
 * GET /api/store/crm/products?q=
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  catalogRowToPick,
  searchCatalogProducts,
  type CatalogProductRow,
} from "@/lib/crm/product-catalog";
import { detectPromoFromPrompt } from "@/lib/crm/promo-detect";
import type { CrmAgentBrief } from "@/lib/crm/agent/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
    if (q.length < 2) {
      return NextResponse.json({ products: [] });
    }

    const brief: CrmAgentBrief = {
      campaign_goal: q,
      tone: "",
      audience_description: "",
      product_focus: q,
      layout_preference: "classic",
      include_products: true,
      promo: detectPromoFromPrompt(q),
    };

    const { rows } = await searchCatalogProducts(supabase, user.id, brief, [], 20);
    const products = rows.map((row: CatalogProductRow) => {
      const pick = catalogRowToPick(row, user.id, brief.promo);
      if (!pick) return null;
      const sale = Number(row.sale_price);
      const price = Number(row.price);
      const numericPrice =
        Number.isFinite(sale) && sale > 0
          ? sale
          : Number.isFinite(price) && price > 0
            ? price
            : null;
      return {
        id: pick.productId,
        name: pick.title,
        subtitle: pick.subtitle ?? null,
        price: numericPrice,
        imageUrl: pick.imageUrl ?? null,
        url: pick.url ?? null,
        lightspeedItemId: pick.lightspeedItemId ?? null,
      };
    }).filter((product): product is NonNullable<typeof product> => product != null);

    return NextResponse.json({ products });
  } catch (error) {
    console.error("[crm] product search failed:", error);
    return NextResponse.json({ error: "Failed to search products" }, { status: 500 });
  }
}
