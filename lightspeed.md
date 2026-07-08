# Lightspeed SQL Reporting Instructions

These instructions are loaded whenever a store user asks about Lightspeed sales, sold products, sale transactions, item cost, gross profit, gross margin, customers, top customers, customer purchase history, customers who purchased a product, current inventory, stock on hand, brand inventory, supplier inventory, or cash tied up in stock.

## Architecture

Use the schema-aware SQL reporting path for Lightspeed analytics:

1. Decide whether the user is asking for Lightspeed reporting.
2. For narrow reporting or lookup questions, skip planning and execute directly.
3. For broad, complex, or multi-pass analysis, call `record_lightspeed_plan` with an internal plan before the SQL passes.
4. For broad profitability, growth, or business-performance questions, run a multi-pass analysis with several focused SQL queries before answering.
5. Call `run_lightspeed_sql_query` for each required analysis pass.
6. Answer in structured Markdown. Do not show the plan or raw SQL in the final answer.

The old fixed analytical Lightspeed tools are not the preferred interface. The SQL executor is the primary reporting tool because it can answer more complex questions with one validated query.

## SQL vs Live API Decision Rule

SQL is the fast local reporting copy. The live Lightspeed API is the source of truth for current object details.

Use SQL first for:

- Sales totals, revenue, gross profit, margin, discounts, tax estimates, sale counts, average sale value.
- Rankings, trends, charts, period comparisons, broad analysis, and any question that needs many rows.
- Sold products, product performance, product purchasers, customer purchase history, top customers, best customers, and historical spend.
- Current inventory fields that exist in `genie_lightspeed_inventory`: QOH, sellable quantity, price, cost, brand, supplier, category, stock value, reorder data, and stale inventory.

Use the live Lightspeed API for:

- A specific customer profile/contact lookup where phone, email, address, archived status, or live profile details matter.
- Serialized bike records linked to a customer or work order.
- Active/finished work orders, work-order status, ETA, public notes, internal notes, warranty text, labour line notes, item notes, and parts on a service job.
- One exact Lightspeed object by ID, or any staged write/proposal target that must reference a current Lightspeed object.

Do not use broad live API scans for reporting if the SQL mirror has the needed fields. Do not use live customer search as a fallback for repair issue phrases or note keywords. For text like "cracked frame", "warranty claim", "brake noise", or "work orders mentioning X", use the work-order query path, not customer search.

## SQL Source Of Truth

Use only the tenant-scoped reporting views:

`genie_lightspeed_sales_report_lines`

`genie_lightspeed_inventory`

These views are tenant-scoped by the server. Do not add or expose `user_id`. Do not query raw tables.

Sales report columns:

- `sale_id`, `sale_line_id`, `ticket_number`
- `complete_time`, `line_time`
- `employee_id`, `employee_name`
- `category_id`, `category`
- `item_id`, `sku`, `description`
- `quantity`, `retail`, `subtotal`, `discount`, `total`
- `customer_id`, `customer_full_name`
- `cost`, `profit`, `margin_pct`
- `synced_at`, `created_at`, `updated_at`

Inventory columns:

- `item_id`, `account_id`, `product_uuid`
- `system_sku`, `custom_sku`, `manufacturer_sku`, `upc`, `ean`
- `name`, `description`, `model_year`, `item_type`, `labor_duration_minutes`
- `brand_id`, `brand_name`
- `supplier_id`, `supplier_name`, `supplier_archived`, `supplier_currency_code`
- `category_id`, `category_name`, `category_path`
- `default_price`, `online_price`, `msrp`, `default_cost`, `avg_cost`
- `total_qoh`, `total_sellable`, `backorder`, `component_qoh`, `component_backorder`
- `reorder_point`, `reorder_level`
- `on_layaway`, `on_special_order`, `on_workorder`, `on_transfer_in`, `on_transfer_out`
- `is_in_stock`, `archived`, `publish_to_ecom`, `serialized`, `discountable`, `taxable`
- `tax_class_id`, `tax_class_name`, `department_id`, `season_id`, `default_vendor_id`, `item_matrix_id`
- `primary_image_url`, `images`, `prices`, `stock_data`
- `lightspeed_created_at`, `lightspeed_updated_at`, `inventory_updated_at`, `first_seen_at`, `last_seen_at`, `last_synced_at`, `created_at`, `updated_at`

The executor rejects mutation, comments, raw-table access, restricted columns, secrets, and multi-statement SQL.

## SQL Dialect

The reporting database is Supabase PostgreSQL 17. Always write PostgreSQL, not MySQL, SQLite, BigQuery, or T-SQL.

Use PostgreSQL syntax:

- Date/time grouping: `date_trunc('day', complete_time AT TIME ZONE 'Australia/Brisbane')`.
- Formatting labels: `to_char(...)`.
- Date parts: `extract(month from complete_time)`.
- Null handling: `coalesce(...)`, `nullif(...)`.
- Conditional aggregates: `sum(total) FILTER (WHERE total > 0)`.
- Type casts: `value::numeric`, `'2026-06-18'::date`.
- Intervals: `interval '1 day'`, `interval '1 month'`.

Never use MySQL syntax:

- No `DATE_FORMAT(...)`; use `to_char(...)` or `date_trunc(...)`.
- No `STR_TO_DATE(...)`; use Postgres casts such as `'2026-06-18'::date`.
- No `IFNULL(...)`; use `coalesce(...)`.
- No `CURDATE()`; use `current_date`.
- No `DATE_SUB(...)` / `DATE_ADD(...)`; use Postgres interval arithmetic.
- No `TIMESTAMPDIFF(...)` / `DATEDIFF(...)`; subtract timestamps/dates or use `extract(epoch from ...)`.
- No backtick identifiers. Use unquoted lower-case identifiers exactly as listed.
- No `INTERVAL 1 DAY`; use `interval '1 day'`.
- No `LIMIT offset,count`; use `LIMIT count OFFSET offset`.

## Supported Now

The SQL executor can answer:

- Total sales, net sales, gross sales, discounts, tax estimate, sale count, average sale.
- Sales by day, week, month, year, or custom grouping.
- Every sale / transaction lists.
- Top products, service revenue, category revenue, SKU performance.
- Product trends over time.
- Item-level cost, gross profit, and gross margin from stored sale-line cost fields.
- Top customers by spend, purchase count, or average sale.
- Customer purchase history.
- Customers who purchased a product, service, SKU, category, brand/model term when the term exists in sale-line text.
- Current stock availability, QOH, sellable quantity, reorder levels, current price/cost, inventory value at cost, and retail stock value from `genie_lightspeed_inventory`.
- Brand/manufacturer inventory via `brand_name`.
- Supplier/vendor inventory via `supplier_name`.
- Stale inventory and cash tied up by joining `genie_lightspeed_inventory` to sales-report rows by `item_id`.
- Strategic profitability analysis, including revenue trend, gross profit trend, margin leakage, product/category contribution, discount leakage, average sale value, and top/repeat customer opportunities.

Current limitations:

- Customer phone, email, address, opt-out flags, archived status, and customer create date require a future customer/contact table.
- Current inventory is available from `genie_lightspeed_inventory`, synced from Lightspeed every 10 minutes. Use `brand_name` for brand/manufacturer and `supplier_name` for supplier/vendor.
- Do not infer current stock from historic sales rows. Use `genie_lightspeed_inventory.total_qoh`, `total_sellable`, and `is_in_stock`.

## SQL Rules

- Use `SELECT` or `WITH` only.
- Use one query per narrow analytical question unless the user asks for multiple unrelated outputs.
- Use multiple focused queries for broad strategic questions such as "how can we make more money", "how do we improve profitability", "where are the biggest opportunities", or "what should we do to grow".
- Use the store timezone `Australia/Brisbane` when converting natural dates.
- Filter `complete_time` using timestamp bounds.
- Prefer half-open ranges for timestamp SQL: `complete_time >= 'YYYY-MM-DD'::date AND complete_time < ('YYYY-MM-DD'::date + interval '1 day')`.
- Always include an explicit `ORDER BY` for ranked outputs.
- Always include a sensible `LIMIT`.
- Use `COUNT(DISTINCT sale_id)` for sale count.
- For transaction/customer aggregates, group sale lines to one row per `sale_id` first so multi-line sales are not double-counted.
- Gross sales is usually `SUM(total)`.
- Net sales is usually `SUM(subtotal)`.
- Tax estimate is `SUM(total - subtotal)`.
- Cost is `SUM(cost)`.
- Gross profit is usually `SUM(profit)` or `SUM(subtotal - cost)`.
- Gross margin percent is gross profit divided by net sales.
- Sold units should use positive quantities unless the user asks to include returns/refunds.
- For current inventory, filter `archived = false` unless the user asks for archived items.
- For in-stock inventory, filter `is_in_stock = true AND total_qoh > 0`.
- Inventory value at cost should usually use `COALESCE(NULLIF(avg_cost, 0), NULLIF(default_cost, 0), 0) * total_qoh`.
- Retail stock value should usually use `default_price * total_qoh`.
- Brand/manufacturer analysis should group by `brand_name`.
- Supplier/vendor analysis should group by `supplier_name`.
- Category inventory analysis should group by `category_path` or `category_name`.

## Required Behaviour

- `record_lightspeed_plan` is required only for complex or strategic Lightspeed analysis. Do not call it for narrow stock lookups, top-N rankings, customer history, sale totals, or one-query reports.
- Do not put a `Plan` section in the final answer.
- Do not show raw SQL in the final answer unless the user explicitly asks for the query.
- Use tables for rankings, lists, and comparisons.
- Use charts when the user asks for a graph, line chart, or bar chart by setting the visual options on `run_lightspeed_sql_query`.
- If the SQL result is empty, partial, or row-limited, call `record_lightspeed_recheck` and try one materially different SQL strategy.
- For simple item availability lookups, `search_lightspeed_inventory` is preferred because it returns item details, brand, supplier, category, price/cost, QOH, sellable quantity, and sync timestamps.
- For strategic business analysis, do not answer after one shallow query. Continue until you have enough evidence to give ranked, actionable recommendations, while clearly stating any missing data limits.

## Strategic Profitability Analysis

For prompts like "how can we make the business more profitable and make more money":

- Treat it as a deep business analysis request, not casual advice.
- Use a default period of the last 12 months unless the user specifies another range.
- Run several focused SQL queries rather than one over-large query.
- Recommended passes:
  - Monthly revenue, gross profit, gross margin, sale count, and average sale value.
  - Category/service contribution by revenue, gross profit, margin, and trend.
  - Product/SKU contribution: high revenue, high profit, low margin, high discount, and declining products.
  - Discount leakage: categories/products with unusually high discount value or discount rate.
  - Customer concentration: top customers, repeat customers, average spend, and recency.
  - Basket/transaction indicators: average transaction value and lines per transaction where sale-line data allows.
  - Inventory/cash tied up from `genie_lightspeed_inventory`, joined to sales rows by `item_id` when recent movement or stale-stock logic is needed.
- Final response shape:
  - Executive summary.
  - Biggest profit levers.
  - Ranked opportunity tables.
  - Concrete actions for the store.
  - Data limitations and next data needed.

## Date Rules

- "Today": current store-local date.
- "Yesterday": previous store-local date.
- "This week": Monday of the current week through today.
- "Last 30 days": today minus 30 days through today.
- "Last 3 years": same calendar date three years ago through today.
- "Jan to Feb of 2025": `2025-01-01` through `2025-02-28`.
- A month: first through last day of that month.
- A year: January 1 through December 31.
- A year range such as "2025 to 2026": `2025-01-01` through `2026-12-31`, unless the user clearly means year-to-date.

Final answers must state the exact date range used.

## Example: Best Customers Over Last 3 Years

For "tell me our best customers over the last 3 years":

- Date range: same calendar date three years ago through today in `Australia/Brisbane`.
- Tool: `run_lightspeed_sql_query`.
- Query shape:
  - CTE `sales`: group `genie_lightspeed_sales_report_lines` by `sale_id`, `customer_id`, `customer_full_name`.
  - Sale total: `SUM(total)`.
  - Date: `MAX(complete_time)`.
  - Exclude `customer_id IS NULL`, empty customer IDs, and `customer_id = '0'` unless walk-ins are requested.
  - Outer query groups by customer and calculates gross sales, sale count, average sale, first purchase, last purchase.
  - Sort by gross sales descending.
- Output: Markdown heading, date range, short bullets, and a table with rank, customer, gross sales, sale count, average sale, first purchase, and last purchase.

## Example SQL Pattern

Use this pattern for customer ranking. Adapt dates and ranking only as needed:

```sql
WITH sales AS (
  SELECT
    sale_id,
    customer_id,
    COALESCE(NULLIF(customer_full_name, ''), 'Customer ' || customer_id) AS customer,
    MAX(complete_time) AS completed_at,
    SUM(total) AS sale_total
  FROM genie_lightspeed_sales_report_lines
  WHERE complete_time >= '2023-06-06'::date
    AND complete_time < ('2026-06-06'::date + interval '1 day')
    AND customer_id IS NOT NULL
    AND customer_id <> ''
    AND customer_id <> '0'
  GROUP BY sale_id, customer_id, customer
)
SELECT
  customer_id,
  customer,
  ROUND(SUM(sale_total)::numeric, 2) AS gross_sales,
  COUNT(*) AS sale_count,
  ROUND(AVG(sale_total)::numeric, 2) AS average_sale_value,
  MIN(completed_at) AS first_purchase_at,
  MAX(completed_at) AS last_purchase_at
FROM sales
GROUP BY customer_id, customer
ORDER BY gross_sales DESC
LIMIT 20
```

## Example: In-Stock Inventory By Brand

For "show me Shimano products in stock":

- Tool: `search_lightspeed_inventory` with `query: "Shimano"` and `in_stock_only: true`, or a SQL query against `genie_lightspeed_inventory`.
- Output should include product, SKU, brand, supplier, category, price, cost, QOH, and sellable quantity.

Example SQL shape:

```sql
SELECT
  item_id,
  description,
  system_sku,
  brand_name,
  supplier_name,
  category_path,
  default_price,
  avg_cost,
  total_qoh,
  total_sellable,
  last_synced_at
FROM genie_lightspeed_inventory
WHERE archived = false
  AND is_in_stock = true
  AND total_qoh > 0
  AND brand_name ILIKE '%Shimano%'
ORDER BY total_qoh DESC, description
LIMIT 25
```

## Example: Inventory Cash By Supplier

For "which suppliers have the most cash tied up in stock":

- Tool: `run_lightspeed_sql_query`.
- Query `genie_lightspeed_inventory`.
- Group by `supplier_name`.
- Use cost value: `COALESCE(NULLIF(avg_cost, 0), NULLIF(default_cost, 0), 0) * total_qoh`.

```sql
SELECT
  COALESCE(NULLIF(supplier_name, ''), 'Unknown') AS supplier,
  COUNT(*) AS item_count,
  ROUND(SUM(total_qoh)::numeric, 2) AS units_on_hand,
  ROUND(SUM(COALESCE(NULLIF(avg_cost, 0), NULLIF(default_cost, 0), 0) * total_qoh)::numeric, 2) AS stock_value_at_cost,
  ROUND(SUM(default_price * total_qoh)::numeric, 2) AS retail_stock_value
FROM genie_lightspeed_inventory
WHERE archived = false
  AND is_in_stock = true
  AND total_qoh > 0
GROUP BY supplier
ORDER BY stock_value_at_cost DESC
LIMIT 20
```

## Resolve names before filtering

User wording for a product, service, or category is not a proven Lightspeed name. "General service" may be stored as "Service - Major", "Std Service", "Servicing", a SKU code, or a category label.

Before filtering sales by any user-supplied name, run one cheap discovery query with the broadest keyword:

```sql
SELECT description, category, COUNT(*) AS lines
FROM genie_lightspeed_sales_report_lines
WHERE complete_time >= (current_date - interval '18 months')
  AND (description ILIKE '%servic%' OR category ILIKE '%servic%')
GROUP BY 1, 2
ORDER BY lines DESC
LIMIT 30
```

Then build the real filter from the exact names returned. `search_lightspeed_inventory` with the shortest keyword also reveals live item names, categories, and SKUs.

Never answer that a named product/service sold 0 unless discovery has proven no matching catalogue name exists. A grouped result where every metric is 0 means the filter text is wrong — recheck with resolved names.

## Resilience

Recheck with a changed SQL strategy when:

- No rows match but the request likely should have data.
- Every metric in a grouped result is 0 for a named product/service/category.
- A product/service phrase may be too specific.
- A customer name is ambiguous.
- The result hits the row limit.
- The result does not directly answer the user.
- The backfill may not cover the requested range.

Good rechecks:

- Run the name-resolution discovery query above and re-filter with the exact names it returns.
- Shorten product terms.
- Try singular/plural variants.
- Search `description`, `sku`, and `category`.
- Broaden from product description to category/service wording.
- Split a date range only when needed for limits or coverage.
- Ask a concise clarification only after one useful recheck fails.
