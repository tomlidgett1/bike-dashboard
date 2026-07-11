import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type LightspeedSalesSummaryRow = {
  mirror_start_date: string | null;
  mirror_end_date: string | null;
  completed_sales: number;
  total_revenue: number;
  total_subtotal: number;
  total_discount: number;
  total_tax: number;
  total_avg_cost: number;
  total_fifo_cost: number;
  total_cogs: number;
  gross_profit: number;
  gross_margin_pct: number;
  total_items_sold: number;
};

export type LightspeedSalesWeekdayRow = {
  isodow: number;
  day_name: string;
  trading_days: number;
  total_revenue: number;
  avg_revenue: number;
  total_profit: number;
  avg_profit: number;
  margin_pct: number;
};

export type LightspeedTopItemRow = {
  item_id: number | null;
  item_description: string | null;
  qty_sold: number;
  total_revenue: number;
  total_cost: number;
  margin_pct: number;
};

export type LightspeedItemSalesSummaryRow = {
  mirror_start_date: string | null;
  mirror_end_date: string | null;
  matched_item_count: number;
  total_units_sold: number;
  total_revenue: number;
};

export type LightspeedItemSalesWeekdayRow = {
  isodow: number;
  day_name: string;
  trading_days: number;
  total_units_sold: number;
  total_revenue: number;
  avg_units_per_day: number;
  avg_revenue_per_day: number;
};

export type LightspeedInventorySearchRow = {
  item_id: number;
  description: string | null;
  custom_sku: string | null;
  upc: string | null;
  ean: string | null;
  item_type: string | null;
  default_price: number | null;
  default_cost: number | null;
  qoh: number | null;
  rank_score: number | null;
  synced_at: string | null;
  synced_at_melbourne: string | null;
};

export type LightspeedWorkorderLookupRow = {
  workorder_id: number;
  workorder_status_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_phone_e164: string | null;
  notes: string | null;
  time_in_melbourne: string | null;
  eta_out_melbourne: string | null;
  time_stamp_melbourne: string | null;
  sale_id: number | null;
  sale_total: number | null;
  sale_balance: number | null;
  workorder_line_items: unknown;
  anchor_date_melbourne: string | null;
};

function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchLightspeedSalesSummary(
  supabase: SupabaseClient,
  brandKey: string,
  fromYmd: string,
  toYmd: string,
): Promise<LightspeedSalesSummaryRow> {
  const { data, error } = await supabase.rpc('nest_brand_lightspeed_sales_summary', {
    p_brand_key: brandKey,
    p_from_date: fromYmd,
    p_to_date: toYmd,
  });
  if (error) throw new Error(`Sales summary query failed: ${error.message}`);
  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
  return {
    mirror_start_date: typeof row?.mirror_start_date === 'string' ? row.mirror_start_date : null,
    mirror_end_date: typeof row?.mirror_end_date === 'string' ? row.mirror_end_date : null,
    completed_sales: num(row?.completed_sales),
    total_revenue: num(row?.total_revenue),
    total_subtotal: num(row?.total_subtotal),
    total_discount: num(row?.total_discount),
    total_tax: num(row?.total_tax),
    total_avg_cost: num(row?.total_avg_cost),
    total_fifo_cost: num(row?.total_fifo_cost),
    total_cogs: num(row?.total_cogs),
    gross_profit: num(row?.gross_profit),
    gross_margin_pct: num(row?.gross_margin_pct),
    total_items_sold: num(row?.total_items_sold),
  };
}

export async function fetchLightspeedSalesByWeekday(
  supabase: SupabaseClient,
  brandKey: string,
  fromYmd: string,
  toYmd: string,
): Promise<LightspeedSalesWeekdayRow[]> {
  const { data, error } = await supabase.rpc('nest_brand_lightspeed_sales_by_weekday', {
    p_brand_key: brandKey,
    p_from_date: fromYmd,
    p_to_date: toYmd,
  });
  if (error) throw new Error(`Sales-by-weekday query failed: ${error.message}`);
  return Array.isArray(data)
    ? (data as Record<string, unknown>[]).map((row) => ({
        isodow: num(row.isodow),
        day_name: typeof row.day_name === 'string' ? row.day_name : '',
        trading_days: num(row.trading_days),
        total_revenue: num(row.total_revenue),
        avg_revenue: num(row.avg_revenue),
        total_profit: num(row.total_profit),
        avg_profit: num(row.avg_profit),
        margin_pct: num(row.margin_pct),
      }))
    : [];
}

export async function fetchLightspeedTopItems(
  supabase: SupabaseClient,
  brandKey: string,
  fromYmd: string,
  toYmd: string,
  limit = 15,
): Promise<LightspeedTopItemRow[]> {
  const { data, error } = await supabase.rpc('nest_brand_lightspeed_sales_top_items', {
    p_brand_key: brandKey,
    p_from_date: fromYmd,
    p_to_date: toYmd,
    p_limit: limit,
  });
  if (error) throw new Error(`Top-items query failed: ${error.message}`);
  return Array.isArray(data)
    ? (data as Record<string, unknown>[]).map((row) => ({
        item_id: row.item_id == null ? null : num(row.item_id),
        item_description: typeof row.item_description === 'string' ? row.item_description : null,
        qty_sold: num(row.qty_sold),
        total_revenue: num(row.total_revenue),
        total_cost: num(row.total_cost),
        margin_pct: num(row.margin_pct),
      }))
    : [];
}

export async function fetchLightspeedItemSalesSummary(
  supabase: SupabaseClient,
  brandKey: string,
  fromYmd: string,
  toYmd: string,
  query: string,
): Promise<LightspeedItemSalesSummaryRow> {
  const { data, error } = await supabase.rpc('nest_brand_lightspeed_item_sales_summary', {
    p_brand_key: brandKey,
    p_from_date: fromYmd,
    p_to_date: toYmd,
    p_query: query,
  });
  if (error) throw new Error(`Item-sales summary query failed: ${error.message}`);
  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
  return {
    mirror_start_date: typeof row?.mirror_start_date === 'string' ? row.mirror_start_date : null,
    mirror_end_date: typeof row?.mirror_end_date === 'string' ? row.mirror_end_date : null,
    matched_item_count: num(row?.matched_item_count),
    total_units_sold: num(row?.total_units_sold),
    total_revenue: num(row?.total_revenue),
  };
}

export async function fetchLightspeedItemSalesByWeekday(
  supabase: SupabaseClient,
  brandKey: string,
  fromYmd: string,
  toYmd: string,
  query: string,
): Promise<LightspeedItemSalesWeekdayRow[]> {
  const { data, error } = await supabase.rpc('nest_brand_lightspeed_item_sales_by_weekday', {
    p_brand_key: brandKey,
    p_from_date: fromYmd,
    p_to_date: toYmd,
    p_query: query,
  });
  if (error) throw new Error(`Item-sales weekday query failed: ${error.message}`);
  return Array.isArray(data)
    ? (data as Record<string, unknown>[]).map((row) => ({
        isodow: num(row.isodow),
        day_name: typeof row.day_name === 'string' ? row.day_name : '',
        trading_days: num(row.trading_days),
        total_units_sold: num(row.total_units_sold),
        total_revenue: num(row.total_revenue),
        avg_units_per_day: num(row.avg_units_per_day),
        avg_revenue_per_day: num(row.avg_revenue_per_day),
      }))
    : [];
}

export async function searchLightspeedInventory(
  supabase: SupabaseClient,
  brandKey: string,
  query: string,
  limit = 40,
): Promise<LightspeedInventorySearchRow[]> {
  const { data, error } = await supabase.rpc('nest_brand_lightspeed_inventory_search', {
    p_brand_key: brandKey,
    p_query: query,
    p_limit: limit,
  });
  if (error) throw new Error(`Inventory search query failed: ${error.message}`);
  return Array.isArray(data)
    ? (data as Record<string, unknown>[]).map((row) => ({
        item_id: num(row.item_id),
        description: typeof row.description === 'string' ? row.description : null,
        custom_sku: typeof row.custom_sku === 'string' ? row.custom_sku : null,
        upc: typeof row.upc === 'string' ? row.upc : null,
        ean: typeof row.ean === 'string' ? row.ean : null,
        item_type: typeof row.item_type === 'string' ? row.item_type : null,
        default_price: row.default_price == null ? null : num(row.default_price),
        default_cost: row.default_cost == null ? null : num(row.default_cost),
        qoh: row.qoh == null ? null : num(row.qoh),
        rank_score: row.rank_score == null ? null : num(row.rank_score),
        synced_at: typeof row.synced_at === 'string' ? row.synced_at : null,
        synced_at_melbourne: typeof row.synced_at_melbourne === 'string' ? row.synced_at_melbourne : null,
      }))
    : [];
}

export async function lookupLightspeedWorkordersSql(
  supabase: SupabaseClient,
  args: {
    brandKey: string;
    customerPhoneE164?: string | null;
    customerName?: string | null;
    fromDate?: string | null;
    toDate?: string | null;
    statusIds?: number[] | null;
    limit?: number;
  },
): Promise<LightspeedWorkorderLookupRow[]> {
  const { data, error } = await supabase.rpc('nest_brand_lightspeed_workorder_lookup', {
    p_brand_key: args.brandKey,
    p_customer_phone_e164: args.customerPhoneE164 ?? null,
    p_customer_name: args.customerName ?? null,
    p_from_date: args.fromDate ?? null,
    p_to_date: args.toDate ?? null,
    p_status_ids: args.statusIds ?? null,
    p_limit: args.limit ?? 100,
  });
  if (error) throw new Error(`Workorder lookup query failed: ${error.message}`);
  return Array.isArray(data)
    ? (data as Record<string, unknown>[]).map((row) => ({
        workorder_id: num(row.workorder_id),
        workorder_status_id: row.workorder_status_id == null ? null : num(row.workorder_status_id),
        customer_name: typeof row.customer_name === 'string' ? row.customer_name : null,
        customer_phone: typeof row.customer_phone === 'string' ? row.customer_phone : null,
        customer_phone_e164: typeof row.customer_phone_e164 === 'string' ? row.customer_phone_e164 : null,
        notes: typeof row.notes === 'string' ? row.notes : null,
        time_in_melbourne: typeof row.time_in_melbourne === 'string' ? row.time_in_melbourne : null,
        eta_out_melbourne: typeof row.eta_out_melbourne === 'string' ? row.eta_out_melbourne : null,
        time_stamp_melbourne: typeof row.time_stamp_melbourne === 'string' ? row.time_stamp_melbourne : null,
        sale_id: row.sale_id == null ? null : num(row.sale_id),
        sale_total: row.sale_total == null ? null : num(row.sale_total),
        sale_balance: row.sale_balance == null ? null : num(row.sale_balance),
        workorder_line_items: row.workorder_line_items ?? [],
        anchor_date_melbourne: typeof row.anchor_date_melbourne === 'string' ? row.anchor_date_melbourne : null,
      }))
    : [];
}
