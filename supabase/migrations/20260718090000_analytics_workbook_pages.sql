-- Workbook pages for the Analytics studio: each workbook holds multiple pages
-- (bottom tabs), each with its own canvas of elements.
-- Shape: [{ "id": uuid, "name": text, "elements": [...] }]
-- The legacy "elements" column is kept in sync with the first page for
-- backward compatibility.

ALTER TABLE public.analytics_workbooks
  ADD COLUMN IF NOT EXISTS pages JSONB NOT NULL DEFAULT '[]'::jsonb;
