-- ============================================================
-- Add Smart Upload Metadata Fields
-- ============================================================
-- Stores enriched product data from AI image analysis + web search

-- Add JSONB column for structured metadata (bike/part/apparel-specific fields)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS smart_upload_metadata JSONB DEFAULT '{}'::jsonb;

-- Add JSONB column for web search sources
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS web_search_sources JSONB DEFAULT '[]'::jsonb;

-- Add JSONB column for AI confidence scores
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS ai_confidence_scores JSONB DEFAULT '{}'::jsonb;

-- Create GIN index for JSONB queries on metadata
CREATE INDEX IF NOT EXISTS idx_products_smart_upload_metadata 
  ON products USING gin(smart_upload_metadata);

-- Create index for confidence scores
CREATE INDEX IF NOT EXISTS idx_products_ai_confidence 
  ON products USING gin(ai_confidence_scores);

-- Add comments for documentation
COMMENT ON COLUMN products.smart_upload_metadata IS 'Structured product data from smart upload: bike specs (frame_size, material, groupset), part specs (compatibility, weight), apparel specs (size, gender_fit, material)';
COMMENT ON COLUMN products.web_search_sources IS 'Array of URLs and sources consulted during web search enrichment';
COMMENT ON COLUMN products.ai_confidence_scores IS 'Confidence scores for different fields (brand, model, specs, etc.) from AI analysis';

