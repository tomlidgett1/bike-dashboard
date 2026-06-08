-- Speed up Genie reporting questions that filter by store/date and then
-- aggregate sale totals, customers, products, gross profit, and distinct sales.

CREATE INDEX IF NOT EXISTS lightspeed_sales_report_lines_user_complete_sale_cover_idx
  ON public.lightspeed_sales_report_lines (user_id, complete_time DESC, sale_id)
  INCLUDE (
    sale_line_id,
    ticket_number,
    customer_id,
    customer_full_name,
    item_id,
    sku,
    category,
    quantity,
    total,
    subtotal,
    cost,
    profit,
    discount
  );

CREATE INDEX IF NOT EXISTS lightspeed_sales_report_lines_user_sale_complete_cover_idx
  ON public.lightspeed_sales_report_lines (user_id, sale_id, complete_time DESC)
  INCLUDE (
    sale_line_id,
    ticket_number,
    customer_id,
    customer_full_name,
    item_id,
    sku,
    category,
    quantity,
    total,
    subtotal,
    cost,
    profit,
    discount
  );

CREATE INDEX IF NOT EXISTS lightspeed_sales_report_lines_user_customer_complete_cover_idx
  ON public.lightspeed_sales_report_lines (user_id, customer_id, complete_time DESC)
  INCLUDE (
    sale_id,
    sale_line_id,
    ticket_number,
    customer_full_name,
    item_id,
    sku,
    category,
    quantity,
    total,
    subtotal,
    cost,
    profit,
    discount
  )
  WHERE customer_id IS NOT NULL AND customer_id <> '0';

CREATE INDEX IF NOT EXISTS lightspeed_sales_report_lines_user_item_complete_cover_idx
  ON public.lightspeed_sales_report_lines (user_id, item_id, complete_time DESC)
  INCLUDE (
    sale_id,
    sale_line_id,
    ticket_number,
    customer_id,
    customer_full_name,
    sku,
    category,
    quantity,
    total,
    subtotal,
    cost,
    profit,
    discount
  )
  WHERE item_id IS NOT NULL AND item_id <> '';
