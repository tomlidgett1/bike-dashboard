-- Short shopper-facing blurb shown under stock on the product page.
-- Distilled from the long product_description (or POS title) via cheap LLM in Optimise.

ALTER TABLE products
ADD COLUMN IF NOT EXISTS sub_description TEXT;

COMMENT ON COLUMN products.sub_description IS
  'Short 1–2 sentence product blurb for the purchase panel, AI-distilled from product_description';
