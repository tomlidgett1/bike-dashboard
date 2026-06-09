import { createServiceRoleClient } from "@/lib/supabase/server";
import { needsCopy, type CopyNeedProduct } from "@/lib/optimize/copy-needs";

const PAGE_SIZE = 200;

type ProductRow = CopyNeedProduct & { id: string };

export async function fetchCategoryProductsNeedingCopy(
  userId: string,
  categoryId: string,
): Promise<string[]> {
  const supabase = createServiceRoleClient();
  const ids: string[] = [];
  let page = 0;

  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("products")
      .select("id, description, display_name, product_description, listing_source")
      .eq("user_id", userId)
      .eq("is_active", true)
      .gt("qoh", 0)
      .eq("lightspeed_category_id", categoryId)
      .range(from, to);

    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const row of data as ProductRow[]) {
      if (needsCopy(row)) ids.push(row.id);
    }

    if (data.length < PAGE_SIZE) break;
    page += 1;
  }

  return ids;
}
